#!/usr/bin/env bash
# Run the engine on the low-end emulator and record real memory.
#
# performance.memory only sees the JS heap. A PDF viewer spends most of
# its memory on canvas backing stores, which never appear there — so the
# number that decides the pdf.js question has to come from the OS.
# This samples PSS from dumpsys while the autorun drives the engine.
#
# usage: ./measure-device.sh "text,pdf,pdf-large,epub" [serial]
set -uo pipefail

MODES="${1:-text,pdf,pdf-large,epub}"
SERIAL="${2:-emulator-5556}"
HOST_PORT=8100
URL="http://10.0.2.2:${HOST_PORT}/engine/index.html?run=${MODES}&sync=1"

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/results"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)"
MEM="$OUT/mem-$STAMP.tsv"

adb -s "$SERIAL" shell am force-stop com.android.chrome >/dev/null 2>&1
sleep 1

echo "launching chrome on $SERIAL"
echo "  $URL"
adb -s "$SERIAL" shell am start -a android.intent.action.VIEW \
  -d "'$URL'" com.android.chrome >/dev/null 2>&1

printf 'elapsed_s\ttotal_pss_kb\tjava_heap_kb\tnative_heap_kb\tgraphics_kb\tprocs\n' > "$MEM"

START=$(date +%s)
LIMIT=300
while :; do
  NOW=$(( $(date +%s) - START ))
  [ "$NOW" -ge "$LIMIT" ] && { echo "timeout at ${LIMIT}s"; break; }

  # Chrome runs multi-process: the browser process plus a renderer per
  # site. Summing TOTAL PSS across them is the honest figure, because the
  # renderer is where the PDF canvases live.
  # dumpsys lists every process TWICE -- once under "Total PSS by
  # process" and again under "Total PSS by OOM adjustment". Summing the
  # raw grep double-counts and yields more than physical RAM. Key on pid.
  SUM=$(adb -s "$SERIAL" shell "dumpsys meminfo 2>/dev/null | grep -i chrome" 2>/dev/null \
        | tr -d '\r' | sed 's/^ *//' \
        | awk -F'[:(]' '{gsub(/,/,"",$1); pid=$3; if (!(pid in seen)) {seen[pid]=1; s+=$1; n++}} END {printf "%d %d", s, n}')
  PSS=$(echo "$SUM" | cut -d' ' -f1)
  PROCS=$(echo "$SUM" | cut -d' ' -f2)

  DETAIL=$(adb -s "$SERIAL" shell "dumpsys meminfo com.android.chrome 2>/dev/null" 2>/dev/null | tr -d '\r')
  JAVA=$(echo "$DETAIL"   | awk '/Java Heap:/   {print $3; exit}')
  NATIVE=$(echo "$DETAIL" | awk '/Native Heap:/ {print $3; exit}')
  GFX=$(echo "$DETAIL"    | awk '/Graphics:/    {print $2; exit}')

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$NOW" "${PSS:-0}" "${JAVA:-0}" "${NATIVE:-0}" "${GFX:-0}" "${PROCS:-0}" >> "$MEM"

  # The engine renames the document when autorun finishes; that is the
  # signal, rather than guessing a duration.
  if ls "$OUT"/run-*.json >/dev/null 2>&1; then
    NEWEST=$(ls -t "$OUT"/run-*.json | head -1)
    if [ "$NEWEST" -nt "$MEM" ]; then
      echo "metrics posted: $(basename "$NEWEST") at ${NOW}s"
      sleep 3
      break
    fi
  fi
  sleep 2
done

echo
echo "=== peak memory (kB) ==="
awk -F'\t' 'NR>1 {if ($2>p) {p=$2; t=$1}} END {printf "  peak total PSS: %d kB (%.0f MB) at %ss\n", p, p/1024, t}' "$MEM"
awk -F'\t' 'NR>1 {if ($5>g) g=$5} END {printf "  peak graphics:  %d kB (%.0f MB)\n", g, g/1024}' "$MEM"
echo "  samples: $(( $(wc -l < "$MEM") - 1 ))  -> $MEM"
