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
//   STR(schluessel, maxbytes, en, de, fr, it, es)
//
// maxbytes ist der Platz im Zielpuffer ohne die abschliessende Null, 0 heisst
// "kein fester Puffer, wird direkt gezeichnet". tools/strings_check.js prueft
// das je Spalte - Franzoesisch und Spanisch sind oft laenger als Deutsch.
//
// Die INHALTE der Seiten baut die Telefonseite (src/pkjs/index.js) und schickt
// sie fertig formatiert herueber - hier stehen nur die Texte, die die Uhr
// selbst kennt.

// ---- Seitennamen -----------------------------------------------------------
// Es gibt keine mehr: das Kopfband traegt die Flugphase, und welche der drei
// Seiten man liest, sagen die Marken an der Seitenleiste.

// Die Ueberschrift der Statusseite ist die Phase, in der der Flug gerade steckt.
// Sie ersetzt das fruehere feste "Uebersicht": wer aufs Gate schaut, will dort
// lesen, was gerade passiert, nicht wie die Seite heisst.
STR(STR_PH_PLANNED,    0,  "Scheduled",   "Geplant",     "Prévu",        "Previsto",    "Programado")
STR(STR_PH_BOARDING,   0,  "Boarding",    "Boarding",    "Embarquement", "Imbarco",     "Embarque")
STR(STR_PH_DEPARTED,   0,  "Departed",    "Gestartet",   "Décollé",      "Decollato",   "Despegado")
STR(STR_PH_ENROUTE,    0,  "In flight",   "Im Flug",     "En vol",       "In volo",     "En vuelo")
STR(STR_PH_APPROACH,   0,  "Approaching", "Landeanflug", "En approche",  "In arrivo",   "Aproximación")
STR(STR_PH_ARRIVED,    0,  "Arrived",     "Angekommen",  "Arrivé",       "Arrivato",    "Llegado")
STR(STR_PH_OFF,        0,  "Status",      "Status",      "Statut",       "Stato",       "Estado")

// ---- Zustaende ------------------------------------------------------------
// STORED und NEVER landen im Fusszeilenpuffer (FN_SHORT_LEN 16), LOADING und
// NO_PHONE in der Statuszeile (FN_LINE_LEN 28). Laengeres schnitte strncpy
// mitten im Wort ab - "gespeicherter Stand" stand deshalb als
// "gespeicherter S" da.
STR(STR_NO_FLIGHT,     0,  "No flight set",   "Kein Flug gesetzt", "Aucun vol", "Nessun volo", "Sin vuelo")
STR(STR_SETUP_HINT,    0,  "Set it up in the phone app", "Im Telefon einrichten", "À régler sur le téléphone", "Imposta sul telefono", "Configurar en el teléfono")
STR(STR_LOADING,      27,  "Loading…",        "Lade…",        "Chargement…",   "Caricamento…",  "Cargando…")
STR(STR_NO_PHONE,     27,  "Phone not reachable", "Telefon nicht erreichbar", "Téléphone injoignable", "Telefono non raggiungibile", "Teléfono no disponible")
STR(STR_STORED,       15,  "stored copy",     "gespeichert",  "copie locale",  "copia salvata", "copia guardada")
STR(STR_NEVER,        15,  "never loaded",    "nie geladen",  "jamais chargé", "mai caricato",  "nunca cargado")

// ---- Flugnummer eingeben --------------------------------------------------
STR(STR_ENTER_FLIGHT,  0, "Enter flight",  "Flug eingeben", "Saisir le vol", "Inserisci volo", "Introducir vuelo")
STR(STR_INPUT_HINT,    0, "Up/Down change, Select next", "Hoch/Runter ändern, Mitte weiter", "Haut/Bas changer, Centre suivant", "Su/Giù cambia, Centro avanti", "Arriba/Abajo cambia, Centro sigue")
STR(STR_INPUT_CONFIRM, 0, "Select confirms", "Mitte bestätigt", "Centre valide", "Centro conferma", "Centro confirma")
