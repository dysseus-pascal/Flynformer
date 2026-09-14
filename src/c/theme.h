#pragma once
#include <pebble.h>

// Farbschema: Orange auf Weiss. Hell, nicht duester - man fliegt in den Urlaub.
//
// Dahinter steckt mehr als Geschmack: das Pebble-Display LEUCHTET NICHT, es
// reflektiert. Ein heller Grund ist im Sonnenlicht deutlich besser lesbar als
// ein dunkler, und das ist genau die Lage am Gate.
//
//  BG          Grund aller Seiten, TEXT die Schrift darauf.
//  ACCENT      Kopfband und Seitenleiste. ON_ACCENT die Schrift darin.
//              S/W-Rueckfall ist SCHWARZ, nicht Weiss: der Grund ist jetzt
//              weiss, ein weisses Band verschwaende darin.
//  BIG         Die grosse Zeile. Nicht ACCENT: Orange auf Weiss kommt nur auf
//              ein Kontrastverhaeltnis von 3,2, gemessen zu wenig fuer einen
//              reflektierenden Schirm. Windsor Tan schafft 5,2 und bleibt warm.
//  DIM         Nebentexte auf dem Grund.
//  PLANE_*     Flyn ist WEISS mit schwarzer Kontur und schwarzen Aussparungen.
//              Weil der Seitengrund ebenfalls weiss ist, laeuft der Anflug auf
//              einem ACCENT-farbenen Feld - sonst bliebe von Flyn nur der
//              Umriss, also wieder eine Strichzeichnung. Der Farbwechsel macht
//              den Anflug zugleich als Ladeanzeige kenntlich.
//
// Alle Farben aus der 64er-Palette (gcolor_definitions.h), also auf der Uhr
// wirklich darstellbar: Orange #FF5500, WindsorTan #AA5500, DarkGray #555555.
#define FN_COLOR_BG          GColorWhite
#define FN_COLOR_TEXT        GColorBlack
#define FN_COLOR_ACCENT      PBL_IF_COLOR_ELSE(GColorOrange, GColorBlack)
#define FN_COLOR_ON_ACCENT   PBL_IF_COLOR_ELSE(GColorBlack, GColorWhite)
#define FN_COLOR_BIG         PBL_IF_COLOR_ELSE(GColorWindsorTan, GColorBlack)
#define FN_COLOR_DIM         PBL_IF_COLOR_ELSE(GColorDarkGray, GColorBlack)
#define FN_COLOR_PLANE_FILL  GColorWhite
#define FN_COLOR_PLANE_LINE  GColorBlack
#define FN_COLOR_PLANE_HOLE  GColorBlack

// Masse je Plattform.
//
// Das Kopfband ist deutlich geschrumpft - auf emery von 60 auf 34 Pixel, also
// von einem Viertel der Bildhoehe auf ein Siebtel. Es traegt jetzt eine einzige
// Zeile: links die Flugnummer, rechts die Flugphase. Der gewonnene Platz geht
// an den Inhalt, und auf flint reicht es damit wieder fuer fuenf Zeilen statt
// vier.
//
// Auf dem runden Schirm bleibt das Band hoeher: dort schneidet der Kreis die
// Ecken weg, und ein zu flaches Band liesse links und rechts nichts uebrig.
#define FN_BAND_H     PBL_IF_ROUND_ELSE(46, (PBL_DISPLAY_WIDTH >= 180 ? 34 : 26))
#define FN_SIDE_W     PBL_IF_ROUND_ELSE(42, (PBL_DISPLAY_WIDTH >= 180 ? 28 : 24))
#define FN_MARGIN     PBL_IF_ROUND_ELSE(30, 8)
