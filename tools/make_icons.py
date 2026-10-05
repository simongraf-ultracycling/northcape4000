#!/usr/bin/env python3
"""Erzeugt die App-Icons (PNG) einmalig – nur Python-Standardbibliothek.

Motiv: Mitternachtssonne über dem Nordkapp-Felsen, dunkler Hintergrund.
Aufruf im Repository-Hauptordner:  python3 tools/make_icons.py

Ergebnis:
  icons/apple-touch-icon.png  (180 px, für iOS-Home-Screen)
  icons/icon-192.png          (192 px, Manifest)
  icons/icon-512.png          (512 px, Manifest, auch "maskable")

Das Motiv hält die wichtigen Teile im inneren Kreis (80 %), damit es auch
als "maskable" Icon (runde/abgerundete Masken) funktioniert.
"""

import math
import os
import struct
import zlib

SUPERSAMPLE = 4  # 4x4 Abtastpunkte pro Pixel für weiche Kanten

# Farben (RGB 0..255)
SKY_TOP = (6, 11, 26)
SKY_HORIZON = (38, 44, 92)
SEA_TOP = (14, 22, 48)
SEA_BOTTOM = (5, 9, 20)
SUN_CORE = (255, 200, 92)
SUN_EDGE = (255, 138, 61)
GLOW = (255, 150, 70)
CLIFF = (3, 6, 14)

HORIZON_Y = 0.665
SUN_X, SUN_Y, SUN_R = 0.60, 0.50, 0.135


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def piecewise(points, x):
    """Lineare Interpolation über sortierte (x, y)-Stützpunkte."""
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return lerp(y0, y1, (x - x0) / (x1 - x0))
    return points[-1][1]


# Oberkante des Plateaus (x -> y) und Felswand (y -> x)
CLIFF_TOP = [(0.0, 0.505), (0.10, 0.495), (0.24, 0.50), (0.31, 0.512), (0.345, 0.53)]
CLIFF_FACE = [(0.53, 0.345), (0.60, 0.375), (0.665, 0.405), (0.80, 0.43), (1.0, 0.46)]


def in_cliff(x, y):
    if y < 0.49:
        return False
    face_x = piecewise(CLIFF_FACE, y) if y >= 0.53 else 0.345
    if x > face_x:
        return False
    return y >= piecewise(CLIFF_TOP, x)


def background(x, y):
    if y < HORIZON_Y:
        col = mix(SKY_TOP, SKY_HORIZON, (y / HORIZON_Y) ** 1.6)
        # warmes Leuchten rund um die Sonne
        d = math.hypot(x - SUN_X, (y - SUN_Y) * 1.25)
        glow = max(0.0, 1.0 - d / 0.55) ** 2.2 * 0.55
        return mix(col, GLOW, glow)
    t = (y - HORIZON_Y) / (1.0 - HORIZON_Y)
    col = mix(SEA_TOP, SEA_BOTTOM, t)
    # Spiegelung der Sonne als waagrechte Streifen
    width = SUN_R * (1.05 - 0.55 * t)
    if abs(x - SUN_X) < width:
        phase = ((y - HORIZON_Y) / 0.034) % 1.0
        if phase < 0.5:
            edge = 1.0 - abs(x - SUN_X) / width
            strength = (1.0 - t) ** 1.4 * min(1.0, edge * 3.0) * 0.85
            col = mix(col, SUN_EDGE, strength)
    return col


def sample(x, y):
    if in_cliff(x, y):
        return CLIFF
    d = math.hypot(x - SUN_X, y - SUN_Y)
    if d <= SUN_R and y < HORIZON_Y:
        return mix(SUN_CORE, SUN_EDGE, (d / SUN_R) ** 2 * 0.9 + (y - SUN_Y + SUN_R) / (2 * SUN_R) * 0.25)
    return background(x, y)


def render(size):
    rows = []
    n = SUPERSAMPLE
    for py in range(size):
        row = bytearray([0])  # PNG-Filtertyp 0
        for px in range(size):
            r = g = b = 0.0
            for sy in range(n):
                y = (py + (sy + 0.5) / n) / size
                for sx in range(n):
                    x = (px + (sx + 0.5) / n) / size
                    c = sample(x, y)
                    r += c[0]
                    g += c[1]
                    b += c[2]
            k = n * n
            row += bytes((round(r / k), round(g / k), round(b / k)))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8 Bit, RGB
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "icons")
    os.makedirs(out, exist_ok=True)
    for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        path = os.path.join(out, name)
        write_png(path, size, render(size))
        print("geschrieben:", os.path.relpath(path, root))


if __name__ == "__main__":
    main()
