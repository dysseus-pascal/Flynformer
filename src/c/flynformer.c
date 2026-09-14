// Flynformer - Flugverfolgung fuer Pebble.
//
// Die Uhr zeigt an, die Telefonseite (src/pkjs/index.js) rechnet: sie holt den
// Flugstatus bei AviationStack, Flugzeug und Route bei zwei kostenlosen
// Diensten und das Wetter bei Open-Meteo, formatiert alles fertig und schickt
// je Seite fuenf kurze Zeilen herueber.
//
// Eingerichtet wird in der Telefon-App (Clay): eigener API-Schluessel und
// Einheiten. Der Schluessel bleibt auf dem Telefon. Die Flugnummer wird auf der
// UHR eingegeben.
//
// Die App startet auf zwei Wegen: weil jemand sie oeffnet, oder weil ein
// Wakeup sie weckt. Im zweiten Fall soll sie moeglichst wenig auffallen.
#include <pebble.h>
#include "flight_window.h"
#include "strings.h"

static void prv_init(void) {
  // Sprache der Uhr uebernehmen, bevor das Fenster den ersten Text holt
  strings_refresh();
  // Hat ein Wakeup gestartet, wollte niemand die App sehen. Sie sieht dann nur
  // nach, ob sich etwas geaendert hat, und verschwindet wieder.
  const bool woken = (launch_reason() == APP_LAUNCH_WAKEUP);
  flight_window_push(woken);
}

int main(void) {
  prv_init();
  app_event_loop();
  return 0;
}
