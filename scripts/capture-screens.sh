#!/usr/bin/env bash
# Capture the five pre-auth screens for M1's zero-visual-change evidence.
#
# usage: ./scripts/capture-screens.sh before|after [serial]
#
# Taps are resolved by on-screen TEXT through uiautomator, never by fixed
# coordinates. Two reasons: a coordinate that drifts by a few pixels
# between runs silently captures the wrong state, and text-based taps
# make the script identical for both builds — which is the whole point
# of a before/after comparison.
#
# Only five screens because only five are reachable without an account.
# Everything past auth needs the test account that Phase D is still
# waiting on.
#
# Run against a RELEASE build, not a debug one. A debug build paints the
# expo-dev-client gear over the top-right corner and a LogBox toast over
# the bottom, both of which vary run to run — they would show up as
# "differences" that say nothing about the change under test.
set -uo pipefail

LABEL="${1:?usage: capture-screens.sh before|after [serial]}"
SERIAL="${2:-emulator-5556}"
PKG=com.eaustine.bookflow

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/docs/evidence/m2/$LABEL"
mkdir -p "$OUT"

adb() { command adb -s "$SERIAL" "$@"; }

shot() {
  local name="$1"
  sleep 1.2                      # let any transition settle
  adb exec-out screencap -p > "$OUT/$name.png"
  printf '  %-28s %s bytes\n' "$name" "$(stat -f%z "$OUT/$name.png")"
}

# Tap the centre of the first node whose text or content-desc matches.
tap_text() {
  local needle="$1"
  local bounds
  bounds=$(adb exec-out uiautomator dump /dev/tty 2>/dev/null \
    | tr '>' '\n' \
    | grep -F "$needle" \
    | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
    | head -1 \
    | grep -oE '[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+')
  if [ -z "$bounds" ]; then
    echo "  !! could not find \"$needle\" on screen" >&2
    return 1
  fi
  local x1 y1 x2 y2
  x1=${bounds%%,*}; local rest=${bounds#*,}
  y1=${rest%%]*};  rest=${rest#*][}
  x2=${rest%%,*};  y2=${rest#*,}
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
  sleep 1.5
}

echo "capturing '$LABEL' from $SERIAL -> docs/evidence/m2/$LABEL"

# Freeze the status bar. The clock alone would differ between the before
# and after runs and register as changed pixels, which is exactly the
# false positive this comparison must not produce. Demo mode pins the
# time, the battery and the signal icons to fixed values.
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null 2>&1; }
demo enter
demo clock -e hhmm 1200
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4
demo network -e mobile show -e datatype none -e level 4
demo notifications -e visible false
sleep 1

launch() {
  adb shell am force-stop "$PKG"
  sleep 1
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  # The JS splash runs 3.1s, but session restore can hold it to the
  # 8s ceiling in App.tsx. Wait past that rather than racing it — a
  # too-short wait silently captures the splash instead of the screen.
  sleep 14
}

# Five STATIC screens. Focused-field states were tried and dropped:
# a focused TextInput paints a blinking caret, so two captures of the
# same screen differ by the caret's phase. That is a false positive this
# comparison must not produce, and no amount of waiting fixes it.
#
# The checkbox state stands in for the focus ring. It exercises the same
# Input/Button/Text surface plus the checkbox, and it holds still.

launch
shot 01-welcome
tap_text "Get started"                    && shot 02-signup-empty
tap_text "occasional product updates"     && shot 03-signup-checkbox-checked

launch
tap_text "already have an account"        && shot 04-signin-empty
tap_text "Send magic link"                && sleep 2 && shot 05-signin-submitted

demo exit

echo "done: $(ls "$OUT" | wc -l | tr -d ' ') screenshots"
