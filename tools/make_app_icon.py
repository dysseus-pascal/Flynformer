#!/usr/bin/env python3
"""App-Symbol: der Flieger von oben (25x25).

Aufruf: make_app_icon.py <zielordner>
Erzeugt system_icon.png - schwarze Linien auf durchsichtigem Grund.

NICHT der Flyn aus src/c/plane_fx.c. Der hat Augen, Mund, Triebwerke und eine
eigene Kontur - bei 25 Punkten waere jedes davon ein bis zwei Punkte, und
uebrig bliebe ein Fleck. Hier steht die Silhouette von oben: Rumpf, gepfeilte
Tragflaechen, Hoehenleitwerk.

MASSSTAB IST DAS SYSTEMSYMBOL. Die Uhr-Kachel von "Watchfeces" im Starter wurde
Punkt fuer Punkt nachgemessen: 24 von 25 Punkten hoch, Linien 2 bis 3 Punkte
stark, rund 180 schwarze Punkte. Danach richten sich Groesse und Strichstaerke
hier - eine duennere Linie sieht daneben aus wie ein Versehen.

NUR LINIEN, KEINE FLAECHE, und keine ~bw-Fassung. Der Starter zeichnet Symbole
einfarbig: eine farbige Flaeche kam dort als grauer Fleck heraus (im Emulator
nachgemessen - Rot 255,0,0 wurde zu Grau 171,171,171). Eine schwarze Linie ist
auf jeder Uhr dieselbe Datei.

AUS STRICHEN GEBAUT, nicht aus umrissenen Flaechen. Ein umrissenes Dreieck las
sich bei dieser Groesse als Pfeil: der Kreis des Vorbilds traegt als blosser
Rand, ein Dreieck nicht. Rumpf, Tragflaechen und Leitwerk sind deshalb Balken
und Strecken - jede Linie IST der Strich, es gibt nichts zu umranden.
"""
import os
import struct
import sys
import zlib

W = H = 25
SS = 4                           # Ueberabtastung je Achse
LINE = 2                         # Strichstaerke in Punkten, wie beim Vorbild

CX = 12.0                        # Mittelachse
SW = LINE / 2.0 + 0.4            # halbe Strichstaerke der Schraegen


def png(path, w, h, rows):
    """Minimaler PNG-Schreiber, 8 Bit RGBA, ohne Fremdbibliothek."""
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def raster(test):
    """Vierfach ueberabtasten, bei halber Deckung schneiden. Harte Kanten."""
    grid = []
    for py in range(H):
        row = []
        for px in range(W):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    if test(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS):
                        hits += 1
            row.append(hits * 2 >= SS * SS)
        grid.append(row)
    return grid


def write(dest, grid):
    rows = []
    for y in range(H):
        r = []
        for x in range(W):
            r += [0, 0, 0, 255] if grid[y][x] else [0, 0, 0, 0]
        rows.append(r)
    png(os.path.join(dest, "system_icon.png"), W, H, rows)
    old = os.path.join(dest, "system_icon~bw.png")
    if os.path.exists(old):
        os.remove(old)
        print("system_icon~bw.png entfernt - die Linie gilt fuer alle Uhren")
    n = sum(1 for r in grid for v in r if v)
    ys = [y for y in range(H) if any(grid[y])]
    print("system_icon.png: %d Punkte schwarz, %d hoch (Vorbild: 180 / 24)"
          % (n, (ys[-1] - ys[0] + 1) if ys else 0))


def seg(x, y, ax, ay, bx, by, r):
    """Liegt der Punkt hoechstens r von der Strecke a-b entfernt?"""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else ((x - ax) * dx + (y - ay) * dy) / L2
    t = max(0.0, min(1.0, t))
    ex, ey = x - (ax + t * dx), y - (ay + t * dy)
    return ex * ex + ey * ey <= r * r


def bar(x, y, x0, y0, x1, y1):
    """Ein gerades Balkenstueck, Ecken eingeschlossen."""
    return x0 <= x <= x1 and y0 <= y <= y1

def in_triangle(x, y, a, b, c):
    """Liegt der Punkt im Dreieck? Ueber das Vorzeichen der drei Kanten."""
    def side(p, q):
        return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    d1, d2, d3 = side(a, b), side(b, c), side(c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def inside(x, y):
    return (
        # Rumpf: senkrechter Balken mit spitzer Nase
        bar(x, y, CX - 2.0, 3.0, CX + 1.0, 21.0)
        or in_triangle(x, y, (CX - 2.0, 3.5), (CX + 1.0, 3.5), (CX - 0.5, 0.5))
        # Tragflaechen: nach hinten gepfeilt
        or seg(x, y, CX - 0.5, 7.0, 23.5, 16.0, SW)
        or seg(x, y, CX - 0.5, 7.0, -0.5, 16.0, SW)
        # Hoehenleitwerk: dasselbe in klein
        or seg(x, y, CX - 0.5, 17.0, 18.5, 22.5, SW)
        or seg(x, y, CX - 0.5, 17.0, 5.5, 22.5, SW)
    )


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "resources/images"
    os.makedirs(dest, exist_ok=True)
    write(dest, raster(inside))


if __name__ == "__main__":
    main()
