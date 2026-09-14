#pragma once
#include <pebble.h>

// Verbindung zur Telefonseite (src/pkjs/index.js). Die Uhr bekommt NIE JSON,
// sondern fuer jede Seite fuenf fertig formatierte Zeilen - auf flint bleiben
// von 64 KB nur wenige Kilobyte freier Heap.

// Fuenf Seiten. Die Flugzeugseite (Kennzeichen, Muster, Halter) ist entfallen:
// am Gate will niemand wissen, welcher Airbus da steht.
#define FN_PAGE_COUNT 5

// Flugphasen. Die Telefonseite rechnet sie aus den Zeiten aus und schickt sie
// mit; die Uhr waehlt danach die Ueberschrift und ob ein Fortschrittsbalken
// gezeichnet wird. Die Reihenfolge ist der zeitliche Ablauf.
typedef enum {
  FN_PHASE_PLANNED = 0,   // noch lange hin
  FN_PHASE_BOARDING,      // Gate offen
  FN_PHASE_DEPARTED,      // gerade gestartet
  FN_PHASE_ENROUTE,       // unterwegs - hier gibt es den Balken
  FN_PHASE_APPROACH,      // im Landeanflug
  FN_PHASE_ARRIVED,       // gelandet
  FN_PHASE_OFF,           // storniert, umgeleitet, unbekannt
  FN_PHASE_COUNT
} FnPhase;
#define FN_LINE_LEN   28   // laengste Zeile, die auf emery in eine Zeile passt
#define FN_SHORT_LEN  16

typedef struct {
  char line[5][FN_LINE_LEN];
  char age[FN_SHORT_LEN];     // "vor 2 min"
  char quota[FN_SHORT_LEN];   // "3 / 100"
  char fno[12];               // "LH400"
  char status[FN_LINE_LEN];   // Fehlertext, sonst leer
  int  page;
  int  phase;                 // FnPhase, nur auf Seite 0 von Belang
  int  progress;              // 0..100, nur in FN_PHASE_ENROUTE
  char change[FN_LINE_LEN];   // was sich seit dem letzten Abruf geaendert hat
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

// Weckzeit, die das Telefon zuletzt geschickt hat: Unixzeit in Sekunden,
// 0 = nicht mehr wecken, -1 = nichts gesagt (Plan unveraendert lassen).
int32_t phone_next_wake(void);
