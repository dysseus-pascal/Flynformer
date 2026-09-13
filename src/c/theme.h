#pragma once
#include <pebble.h>

// Farbschema: Amber auf Schwarz, im Stil einer Abflugtafel. Die Gliederung ist
// die eines Timeline-Pin-Details - Kopfband, 2-px-Linie, Karte, Seitenleiste.
//
//  BG          Grund aller Seiten, TEXT die Schrift darauf.
//  ACCENT      Kopfband und Seitenleiste. ON_ACCENT die Schrift darin.
//              S/W-Rueckfall ist WEISS, nicht Schwarz: das Band traegt schwarze
//              Schrift, ein schwarzes Band waere unlesbar. Genau daran krankte
//              der erste Anlauf fuer flint bei ChronoKit.
//  DIM         Nebentexte auf dem Grund.
//  PLANE_*     Das Flugzeug: Flaeche in Grundfarbe, Kontur in ACCENT
//              (Entwurf "Typ C"). Auf S/W ergibt das eine weisse Kontur auf
//              schwarzem Grund - dasselbe Verhaeltnis ohne Farbe.
//
// Pebble-Palette (Auswahl Gelb/Orange): ChromeYellow #FFAA00, Yellow #FFFF00,
// Orange #FF5500, Icterine #FFFF55, RajahYellow #FFAA55.
#define FN_COLOR_BG          GColorBlack
#define FN_COLOR_TEXT        GColorWhite
#define FN_COLOR_ACCENT      PBL_IF_COLOR_ELSE(GColorChromeYellow, GColorWhite)
#define FN_COLOR_ON_ACCENT   GColorBlack
#define FN_COLOR_DIM         PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite)
#define FN_COLOR_PLANE_FILL  FN_COLOR_BG
#define FN_COLOR_PLANE_LINE  FN_COLOR_ACCENT

// Masse der Timeline-Gliederung je Plattform
#define FN_BAND_H     PBL_IF_ROUND_ELSE(58, (PBL_DISPLAY_WIDTH >= 180 ? 60 : 46))
#define FN_SIDE_W     PBL_IF_ROUND_ELSE(46, (PBL_DISPLAY_WIDTH >= 180 ? 34 : 30))
#define FN_MARGIN     PBL_IF_ROUND_ELSE(30, 8)
