#pragma once
#include <pebble.h>

// Verbindung zur Telefonseite (src/pkjs/index.js). Die Uhr bekommt NIE JSON,
// sondern fuer jede Seite fuenf fertig formatierte Zeilen - auf flint bleiben
// von 64 KB nur wenige Kilobyte freier Heap.

#define FN_PAGE_COUNT 6
#define FN_LINE_LEN   28   // laengste Zeile, die auf emery in eine Zeile passt
#define FN_SHORT_LEN  16

typedef struct {
  char line[5][FN_LINE_LEN];
  char age[FN_SHORT_LEN];     // "vor 2 min"
  char quota[FN_SHORT_LEN];   // "3 / 100"
  char fno[12];               // "LH400"
  char status[FN_LINE_LEN];   // Fehlertext, sonst leer
  int  page;
  bool fresh;                 // true = gerade vom Telefon, false = gespeichert
} FnPage;

// on_update wird gerufen, sobald eine Seite eingetroffen ist oder ein Fehler
// gemeldet wurde.
typedef void (*FnPhoneUpdate)(void);

void phone_init(FnPhoneUpdate on_update);
void phone_deinit(void);

// Seite anfordern. Zeigt sofort den gespeicherten Stand, falls vorhanden.
// Die Flugnummer lebt auf der UHR, nicht in der Telefon-App: sie wird hier
// eingegeben und ueberdauert im persist, bis sie geaendert wird.
const char *phone_code(void);
void phone_set_code(const char *code);

void phone_request_page(int page);

// Frische Daten holen - kostet eine Abfrage beim Anbieter.
void phone_refresh(int page);

const FnPage *phone_page(void);
