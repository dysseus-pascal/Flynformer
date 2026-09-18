#!/usr/bin/env python3
"""App-Symbol: der Flieger von oben.

Aufruf: make_app_icon.py <zielordner>          -> system_icon.png (25x25)
        make_app_icon.py --store <zielordner>  -> icon-144.png, icon-48.png

NICHT der Flyn aus src/c/plane_fx.c. Der hat Augen, Mund, Triebwerke und eine
eigene Kontur - bei 25 Punkten waere jedes davon ein bis zwei Punkte, und
uebrig bliebe ein Fleck. Hier steht die Silhouette von oben: Rumpf, gepfeilte
Tragflaechen, Hoehenleitwerk.

MASSSTAB IST DAS SYSTEMSYMBOL. Die Uhr-Kachel von "Watchfaces" im Starter wurde
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

DER STORE NIMMT NICHTS AUS DER .pbw. Im Entwicklerportal liegen zwei eigene
Bilder, `icon_large` und `icon_small`; angefordert werden sie in festen Massen
(gross 80 und 144, klein 28 und 48), jeweils mit `exact` in der Adresse, also
erzwungen statt eingepasst - etwas Nicht-Quadratisches kommt verzogen zurueck.
Darum hier eine gefuellte Kachel: das grosse Symbol legt der Store fuer sein
Teilen-Bild durch eine abgerundete Maske, und ueber einer durchsichtigen
Strichzeichnung taete die nichts.

DIE FORM STEHT NUR EINMAL DA. Alle Masse gelten auf einem Raster von 25
Punkten und werden mit s hochgerechnet; mit s = 1 kommt Punkt fuer Punkt das
alte Bild heraus.
"""
import os
import struct
import sys
import zlib

RASTER = 25                      # Bezugsraster, auf dem alle Masse gelten
SS = 4                           # Ueberabtastung je Achse
LINE = 2                         # Strichstaerke in Punkten, wie beim Vorbild

CX = 12.0                        # Mittelachse
SW = LINE / 2.0 + 0.4            # halbe Strichstaerke der Schraegen

# Store-Kachel. Der Wert stammt aus src/c/theme.h (FN_COLOR_ACCENT),
# nachgeschlagen in gcolor_definitions.h des SDK - nicht aus dem Gedaechtnis.
GRUND = (0xFF, 0x55, 0x00)       # GColorOrange
STRICH = (0xFF, 0xFF, 0xFF)      # weiss, wie der Flyn auf hellem Grund
FUELL = 0.72                     # wie viel der Kachel der Flieger einnimmt
STORE_GROESSEN = (144, 48)


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


def raster(test, n):
    """Vierfach ueberabtasten, bei halber Deckung schneiden. Harte Kanten."""
    grid = []
    for py in range(n):
        row = []
        for px in range(n):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    if test(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS):
                        hits += 1
            row.append(hits * 2 >= SS * SS)
        grid.append(row)
    return grid


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


def pruefer(s):
    """Der Formtest, auf den Massstab s gebracht."""
    cx, sw = CX * s, SW * s

    def p(a, b):
        return (a * s, b * s)

    def inside(x, y):
        return (
            # Rumpf: senkrechter Balken mit spitzer Nase
            bar(x, y, cx - 2.0 * s, 3.0 * s, cx + 1.0 * s, 21.0 * s)
            or in_triangle(x, y, (cx - 2.0 * s, 3.5 * s), (cx + 1.0 * s, 3.5 * s),
                           (cx - 0.5 * s, 0.5 * s))
            # Tragflaechen: nach hinten gepfeilt
            or seg(x, y, cx - 0.5 * s, 7.0 * s, 23.5 * s, 16.0 * s, sw)
            or seg(x, y, cx - 0.5 * s, 7.0 * s, -0.5 * s, 16.0 * s, sw)
            # Hoehenleitwerk: dasselbe in klein
            or seg(x, y, cx - 0.5 * s, 17.0 * s, 18.5 * s, 22.5 * s, sw)
            or seg(x, y, cx - 0.5 * s, 17.0 * s, 5.5 * s, 22.5 * s, sw)
        )
    return inside


def schreibe_uhr(dest):
    n = RASTER
    grid = raster(pruefer(1.0), n)
    rows = []
    for y in range(n):
        r = []
        for x in range(n):
            r += [0, 0, 0, 255] if grid[y][x] else [0, 0, 0, 0]
        rows.append(r)
    png(os.path.join(dest, "system_icon.png"), n, n, rows)
    old = os.path.join(dest, "system_icon~bw.png")
    if os.path.exists(old):
        os.remove(old)
        print("system_icon~bw.png entfernt - die Linie gilt fuer alle Uhren")
    punkte = sum(1 for r in grid for v in r if v)
    ys = [y for y in range(n) if any(grid[y])]
    print("system_icon.png: %d Punkte schwarz, %d hoch (Vorbild: 180 / 24)"
          % (punkte, (ys[-1] - ys[0] + 1) if ys else 0))


def schreibe_store(dest):
    for gross in STORE_GROESSEN:
        innen = int(round(gross * FUELL))
        grid = raster(pruefer(innen / float(RASTER)), innen)
        rand = (gross - innen) // 2
        rows = []
        for y in range(gross):
            r = []
            for x in range(gross):
                iy, ix = y - rand, x - rand
                treffer = 0 <= iy < innen and 0 <= ix < innen and grid[iy][ix]
                farbe = STRICH if treffer else GRUND
                r += [farbe[0], farbe[1], farbe[2], 255]
            rows.append(r)
        name = "icon-%d.png" % gross
        png(os.path.join(dest, name), gross, gross, rows)
        print("%s: Kachel %s, Flieger weiss" % (name, "#%02X%02X%02X" % GRUND))


def main():
    args = sys.argv[1:]
    store = "--store" in args
    if store:
        args.remove("--store")
    dest = args[0] if args else ("store" if store else "resources/images")
    os.makedirs(dest, exist_ok=True)
    if store:
        schreibe_store(dest)
    else:
        schreibe_uhr(dest)


if __name__ == "__main__":
    main()
