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
STR(STR_PAGE_OVERVIEW, 0,  "Overview",  "Übersicht")
STR(STR_PAGE_TIMES,    0,  "Times",     "Zeiten")
STR(STR_PAGE_GATE,     0,  "Gate",      "Gate")
STR(STR_PAGE_AIRCRAFT, 0,  "Aircraft",  "Flugzeug")
STR(STR_PAGE_ROUTE,    0,  "Route",     "Strecke")
STR(STR_PAGE_DEST,     0,  "Arrival",   "Ziel")

// ---- Zustaende ------------------------------------------------------------
STR(STR_NO_FLIGHT,     0,  "No flight set",   "Kein Flug gesetzt")
STR(STR_SETUP_HINT,    0,  "Set it up in the phone app", "Im Telefon einrichten")
STR(STR_LOADING,       0,  "Loading…",        "Lade…")
STR(STR_NO_PHONE,      0,  "Phone not reachable", "Telefon nicht erreichbar")
STR(STR_STORED,        0,  "stored copy",     "gespeicherter Stand")
STR(STR_NEVER,         0,  "never loaded",    "nie geladen")
