#!/usr/bin/env python3
"""
Pixel-diff the before/after screenshot sets for M1's evidence.

usage: python3 -I scripts/diff-screens.py

No Pillow on this machine, so this decodes PNG directly. `adb screencap
-p` emits 8-bit non-interlaced RGBA, which is the only case handled —
anything else raises rather than guessing, because a decoder that
quietly mis-reads would produce a confident wrong answer.

Byte-comparing the PNGs would be a weaker test: identical bytes prove
identical pixels, but differing bytes prove nothing, since the encoder
is free to pick different filters run to run.
"""
import io
import os
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEFORE = os.path.join(ROOT, 'docs/evidence/m1/before')
AFTER = os.path.join(ROOT, 'docs/evidence/m1/after')


def read_png(path):
    """-> (width, height, bytes RGBA)"""
    data = io.open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{path}: not a PNG')
    pos, idat, hdr = 8, [], None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            hdr = struct.unpack('>IIBBBBB', body)
        elif ctype == b'IDAT':
            idat.append(body)
        elif ctype == b'IEND':
            break
        pos += 12 + length

    w, h, depth, colour, comp, filt, interlace = hdr
    if depth != 8 or interlace != 0 or colour not in (2, 6):
        raise ValueError(
            f'{path}: unsupported PNG (depth={depth} colour={colour} '
            f'interlace={interlace}); expected 8-bit RGB/RGBA, non-interlaced'
        )
    channels = 4 if colour == 6 else 3
    raw = zlib.decompress(b''.join(idat))

    stride = w * channels
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:      # Sub
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif f == 2:    # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:    # Average
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:    # Paeth
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif f != 0:
            raise ValueError(f'{path}: bad filter {f} on row {y}')
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, bytes(out), channels


# The status bar is system chrome, not the app. Demo mode pins the clock
# and battery, but the wifi/mobile indicators still flicker — measured at
# 75 pixels on row 17 between two runs of the SAME build. Comparing it
# would report that flicker as a change M1 caused.
STATUS_BAR_PX = 60


def compare(a_path, b_path):
    aw, ah, a, ac = read_png(a_path)
    bw, bh, b, bc = read_png(b_path)
    if (aw, ah) != (bw, bh):
        return {'error': f'size differs: {aw}x{ah} vs {bw}x{bh}'}
    if ac != bc:
        return {'error': f'channel count differs: {ac} vs {bc}'}

    # Skip the status bar rows entirely.
    start_row = STATUS_BAR_PX
    total = aw * (ah - start_row)
    differing = 0
    worst = 0
    # Row band of the first difference, to say *where* rather than only
    # how much.
    first_row = None
    stride = aw * ac
    for i in range(start_row * stride, len(a), ac):
        if a[i:i + 3] != b[i:i + 3]:
            differing += 1
            d = max(abs(a[i + k] - b[i + k]) for k in range(3))
            if d > worst:
                worst = d
            if first_row is None:
                first_row = (i // stride)
    return {
        'w': aw, 'h': ah, 'total': total, 'skipped_rows': start_row,
        'differing': differing,
        'pct': 100.0 * differing / total,
        'worst_channel_delta': worst,
        'first_differing_row': first_row,
    }


def main():
    if not os.path.isdir(BEFORE) or not os.path.isdir(AFTER):
        sys.exit('need both docs/evidence/m1/before and .../after')

    names = sorted(
        set(f for f in os.listdir(BEFORE) if f.endswith('.png'))
        & set(f for f in os.listdir(AFTER) if f.endswith('.png'))
    )
    only_before = sorted(set(os.listdir(BEFORE)) - set(os.listdir(AFTER)))
    only_after = sorted(set(os.listdir(AFTER)) - set(os.listdir(BEFORE)))
    if only_before or only_after:
        print(f'!! unpaired: before-only={only_before} after-only={only_after}\n')

    if not names:
        sys.exit('no paired screenshots to compare')

    worst_pct = 0.0
    print(f'{"screen":<30} {"size":>10} {"differing":>12} {"%":>8} {"max Δ":>7}')
    print('-' * 72)
    for n in names:
        r = compare(os.path.join(BEFORE, n), os.path.join(AFTER, n))
        if 'error' in r:
            print(f'{n:<30} {r["error"]}')
            worst_pct = 100.0
            continue
        worst_pct = max(worst_pct, r['pct'])
        print(f'{n:<30} {r["w"]}x{r["h"]:<5} {r["differing"]:>12,} '
              f'{r["pct"]:>7.3f}% {r["worst_channel_delta"]:>7}')
        if r['differing'] and r['first_differing_row'] is not None:
            print(f'{"":<30} first differing row: {r["first_differing_row"]}')

    print('-' * 72)
    if worst_pct == 0.0:
        print('IDENTICAL — every paired screenshot matches pixel for pixel.')
    else:
        print(f'DIFFERENCES FOUND — worst screen differs on {worst_pct:.3f}% of pixels.')
        print('M1 is structural; any difference here is a regression to explain.')
    return 0 if worst_pct == 0.0 else 1


if __name__ == '__main__':
    sys.exit(main())
