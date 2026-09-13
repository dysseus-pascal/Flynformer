// Alle Texte der Oberflaeche, eine Zeile je Text.
//
// ACHTUNG, ZWEI DINGE SIND ABSICHT:
//  1. KEIN #pragma once und keine Include-Waechter. Diese Datei wird MEHRFACH
//     eingebunden (X-Makro): einmal fuer die Aufzaehlung der Schluessel in
//     strings.h und einmal fuer die Tabelle in strings.c. Ein Waechter wuerde
//     die zweite Einbindung verschlucken und eine leere Tabelle erzeugen.
//  2. Endung .h, obwohl es kein gewoehnlicher Header ist. Build-Umgebungen, die
//     nur .c und .h in ihren Baum kopieren, finden eine .def-Datei nicht.
//
//   STR(schluessel, maxbytes, en, de)
//
// Die INHALTE der Seiten baut die Telefonseite (src/pkjs/index.js) und schickt
// sie fertig formatiert herueber - hier stehen nur die Texte, die die Uhr
// selbst kennt.

// ---- Seitennamen im Kopfband ----------------------------------------------
STR(STR_PAGE_TIMES,    0,  "Times",     "Zeiten")
STR(STR_PAGE_GATE,     0,  "Gate",      "Gate")
STR(STR_PAGE_ROUTE,    0,  "Route",     "Strecke")
STR(STR_PAGE_DEST,     0,  "Arrival",   "Ziel")

// Die Ueberschrift der Statusseite ist die Phase, in der der Flug gerade steckt.
// Sie ersetzt das fruehere feste "Uebersicht": wer aufs Gate schaut, will dort
// lesen, was gerade passiert, nicht wie die Seite heisst.
STR(STR_PH_PLANNED,    0,  "Scheduled",   "Geplant")
STR(STR_PH_BOARDING,   0,  "Boarding",    "Boarding")
STR(STR_PH_DEPARTED,   0,  "Departed",    "Gestartet")
STR(STR_PH_ENROUTE,    0,  "In flight",   "Im Flug")
STR(STR_PH_APPROACH,   0,  "Approaching", "Landeanflug")
STR(STR_PH_ARRIVED,    0,  "Arrived",     "Angekommen")
STR(STR_PH_OFF,        0,  "Status",      "Status")

// ---- Zustaende ------------------------------------------------------------
STR(STR_NO_FLIGHT,     0,  "No flight set",   "Kein Flug gesetzt")
STR(STR_SETUP_HINT,    0,  "Set it up in the phone app", "Im Telefon einrichten")
STR(STR_LOADING,       0,  "Loading…",        "Lade…")
STR(STR_NO_PHONE,      0,  "Phone not reachable", "Telefon nicht erreichbar")
STR(STR_STORED,        0,  "stored copy",     "gespeicherter Stand")
STR(STR_NEVER,         0,  "never loaded",    "nie geladen")

// ---- Flugnummer eingeben --------------------------------------------------
STR(STR_ENTER_FLIGHT,  0, "Enter flight",  "Flug eingeben")
STR(STR_INPUT_HINT,    0, "Up/Down change, Select next", "Hoch/Runter ändern, Mitte weiter")
STR(STR_INPUT_CONFIRM, 0, "Select confirms", "Mitte bestätigt")
