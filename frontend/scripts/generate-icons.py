#!/usr/bin/env python3
"""Generate the PWA icons referenced by public/manifest.webmanifest.

Written with only the standard library (zlib + struct) so it runs anywhere
without Pillow, ImageMagick or a headless browser. Re-run after changing the
brand colour:

    python3 scripts/generate-icons.py

Outputs:
    public/icons/icon-192.png
    public/icons/icon-512.png
    public/icons/icon-maskable-512.png   (extra padding for Android masking)
    public/favicon-32.png
"""

from __future__ import annotations

import os
import struct
import zlib

BRAND = (79, 70, 229)      # indigo-600, matches theme_color
GLYPH = (255, 255, 255)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

# Supersampling factor for cheap anti-aliasing.
SS = 3


def _shield_alpha(nx: float, ny: float) -> float:
    """Return 1.0 inside the shield glyph, 0.0 outside.

    nx, ny are normalised to the glyph box (0..1). The shape is a rounded top
    that tapers to a point at the bottom.
    """
    top, bottom = 0.06, 0.96
    if ny < top or ny > bottom:
        return 0.0

    ty = (ny - top) / (bottom - top)  # 0 at top, 1 at tip
    half = 0.40

    # Taper the lower 55% down to a point.
    if ty > 0.45:
        t = (ty - 0.45) / 0.55
        half *= max(0.0, 1.0 - t ** 1.8)

    # Round the top corners.
    if ty < 0.12:
        t = ty / 0.12
        half *= 0.72 + 0.28 * (1 - (1 - t) ** 2)

    return 1.0 if abs(nx - 0.5) <= half else 0.0


def _rounded_square_alpha(nx: float, ny: float, radius: float) -> float:
    """1.0 inside a rounded square occupying the whole 0..1 box."""
    x = min(nx, 1 - nx)
    y = min(ny, 1 - ny)
    if x >= radius or y >= radius:
        return 1.0
    dx, dy = radius - x, radius - y
    return 1.0 if (dx * dx + dy * dy) <= radius * radius else 0.0


def render(size: int, glyph_scale: float = 0.62, corner: float = 0.22) -> bytes:
    """Render RGBA pixel rows for an icon of the given size."""
    rows = bytearray()
    glyph_span = size * glyph_scale
    glyph_x0 = (size - glyph_span) / 2
    glyph_y0 = (size - glyph_span) / 2

    for py in range(size):
        rows.append(0)  # PNG filter type 0 for this scanline
        for px in range(size):
            bg_hits = 0
            fg_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = px + (sx + 0.5) / SS
                    fy = py + (sy + 0.5) / SS
                    bg_hits += _rounded_square_alpha(fx / size, fy / size, corner)
                    if glyph_span > 0:
                        gx = (fx - glyph_x0) / glyph_span
                        gy = (fy - glyph_y0) / glyph_span
                        if 0.0 <= gx <= 1.0 and 0.0 <= gy <= 1.0:
                            fg_hits += _shield_alpha(gx, gy)

            total = SS * SS
            bg_a = bg_hits / total
            fg_a = fg_hits / total

            # Composite white glyph over the brand background.
            r = BRAND[0] * (1 - fg_a) + GLYPH[0] * fg_a
            g = BRAND[1] * (1 - fg_a) + GLYPH[1] * fg_a
            b = BRAND[2] * (1 - fg_a) + GLYPH[2] * fg_a
            a = bg_a

            rows += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), int(a * 255 + 0.5)))

    return bytes(rows)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: str, size: int, **kwargs) -> None:
    raw = render(size, **kwargs)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(raw, 9))
        + _chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)
    print(f"  wrote {os.path.relpath(path)} ({size}x{size}, {len(png):,} bytes)")


def main() -> None:
    print("Generating SafeZone PWA icons...")
    write_png(os.path.join(OUT_DIR, "icon-192.png"), 192)
    write_png(os.path.join(OUT_DIR, "icon-512.png"), 512)
    # Maskable icons get cropped to a circle on Android, so keep the glyph well
    # inside the safe zone and fill the full square.
    write_png(
        os.path.join(OUT_DIR, "icon-maskable-512.png"),
        512,
        glyph_scale=0.44,
        corner=0.0,
    )
    write_png(os.path.join(OUT_DIR, "..", "favicon-32.png"), 32, glyph_scale=0.72, corner=0.18)
    print("Done.")


if __name__ == "__main__":
    main()
