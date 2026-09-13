// Flynformer - Flugverfolgung fuer Pebble.
//
// Die Uhr zeigt an, die Telefonseite (src/pkjs/index.js) rechnet: sie holt den
// Flugstatus bei AviationStack, Flugzeug und Route bei zwei kostenlosen
// Diensten und das Wetter bei Open-Meteo, formatiert alles fertig und schickt
// je Seite fuenf kurze Zeilen herueber.
//
// Eingerichtet wird in der Telefon-App (Clay): eigener API-Schluessel, bis zu
// drei Fluege, Einheiten. Der Schluessel bleibt auf dem Telefon.
#include <pebble.h>
#include "flight_window.h"
#include "strings.h"

static void prv_init(void) {
  // Sprache der Uhr uebernehmen, bevor das Fenster den ersten Text holt
  strings_refresh();
  flight_window_push();
}

int main(void) {
  prv_init();
  app_event_loop();
  return 0;
}
