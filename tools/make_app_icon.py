#!/usr/bin/env python3
"""App-Symbol: der Flieger von oben (25x25).

Aufruf: make_app_icon.py <zielordner>
Erzeugt system_icon.png - schwarze Konturlinie auf durchsichtigem Grund.

NICHT der Flyn aus src/c/plane_fx.c. Der hat Augen, Mund, Triebwerke und eine
eigene Kontur - bei 25 Punkten waere jedes davon ein bis zwei Punkte, und
uebrig bliebe ein Fleck. Hier steht die Silhouette von oben: Rumpf, gepfeilte
Tragflaechen, Hoehenleitwerk.

NUR UMRISS, KEINE FLAECHE. Der Starter zeichnet Symbole einfarbig: eine rote
Kapsel und ein violettes Herz kamen dort beide als graue Flecken heraus
(nachgemessen im Emulator). Eine Linie traegt bei 25 Punkten mehr Form als
eine Flaeche - und alle Symbole der Familie sehen damit gleich aus.

DESHALB AUCH KEINE ~bw-FASSUNG: sie waere Punkt fuer Punkt dieselbe Datei.

Aus drei einfachen Formen zusammengesetzt statt aus einem Streckenzug - der
waere bei dieser Groesse schwerer zu treffen als drei Formen, die sich
ueberlappen duerfen. Die inneren Kanten verschwinden von selbst, weil nur der
Rand der VEREINIGUNG gezeichnet wird.
"""
import os
import struct
import sys
import zlib

W = H = 25
SS = 4                           # Ueberabtastung je Achse

CX = 12.0                        # Mittelachse
BODY_HW = 2.2                    # halbe Rumpfbreite
BODY_TOP, BODY_BOT = 3.0, 21.0
WING = ((CX, 6.5), (24.0, 17.0), (0.0, 17.0))
TAIL = ((CX, 15.5), (19.0, 22.5), (5.0, 22.5))



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


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_triangle(x, y, a, b, c):
    """Liegt der Punkt im Dreieck? Ueber das Vorzeichen der drei Kanten."""
    def side(p, q):
        return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    d1, d2, d3 = side(a, b), side(b, c), side(c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def in_body(x, y):
    """Rumpf: gerader Teil plus spitze Nase."""
    dx = abs(x - CX)
    if BODY_TOP <= y <= BODY_BOT:
        return dx <= BODY_HW
    if y < BODY_TOP:
        t = (BODY_TOP - y) / 3.0
        return t <= 1.0 and dx <= BODY_HW * (1.0 - t)
    return False


def inside(x, y):
    return in_body(x, y) or in_triangle(x, y, *WING) or in_triangle(x, y, *TAIL)



def solid():
    """Die gefuellte Form, vierfach ueberabgetastet und bei halber Deckung
    geschnitten. Harte Kanten, keine Zwischentoene - so halten es die
    Schwesterapps."""
    grid = []
    for py in range(H):
        row = []
        for px in range(W):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    if inside(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS):
                        hits += 1
            row.append(hits * 2 >= SS * SS)
        grid.append(row)
    return grid


def outline(grid):
    """Der Rand der Form: gefuellte Punkte, die an einen freien grenzen.

    Auf Bildpunktebene gerechnet, nicht durch Schrumpfen der Flaeche - so ist
    die Linie ueberall GENAU einen Punkt breit, auch in flachen Winkeln.
    """
    out = []
    for y in range(H):
        row = []
        for x in range(W):
            if not grid[y][x]:
                row.append(False)
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= W or ny >= H or not grid[ny][nx]:
                    edge = True
                    break
            row.append(edge)
        out.append(row)
    return out


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "resources/images"
    os.makedirs(dest, exist_ok=True)
    grid = solid()
    line = outline(grid)

    rows = []
    for y in range(H):
        r = []
        for x in range(W):
            r += [0, 0, 0, 255] if line[y][x] else [0, 0, 0, 0]
        rows.append(r)
    png(os.path.join(dest, "system_icon.png"), W, H, rows)
    # Eine alte ~bw-Fassung waere jetzt identisch und nur noch Ballast.
    old = os.path.join(dest, "system_icon~bw.png")
    if os.path.exists(old):
        os.remove(old)
        print("system_icon~bw.png entfernt - die Kontur gilt fuer alle Uhren")
    print("system_icon.png: %dx%d, %d Punkte Linie"
          % (W, H, sum(1 for r in line for v in r if v)))


if __name__ == "__main__":
    main()
