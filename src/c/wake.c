#include <pebble.h>
#include "wake.h"

// Es steht immer HOECHSTENS EIN Wecker. Das SDK erlaubt acht, aber mehr
// braucht es nicht: bei jeder Weckung rechnet die Telefonseite die naechste
// Zeit neu aus, und die haengt an Daten, die sich bis dahin geaendert haben
// koennen. Ein Vorrat geplanter Zeiten waere schon beim Stellen veraltet.
//
// Der Cookie unterscheidet nichts - es gibt nur einen Grund zu wecken.
#define WAKE_COOKIE 1

// Das SDK verlangt eine Minute Abstand zu einem bestehenden Wecker und lehnt
// Zeiten in der Vergangenheit ab (E_INVALID_ARGUMENT). Etwas Luft dazu.
#define WAKE_MIN_LEAD_S 90

static time_t s_next;

bool wake_set(time_t ts) {
  // Erst raeumen: ein alter Wecker stuende sonst der neuen Zeit im Weg, weil
  // das SDK Zeiten innerhalb einer Minute eines geplanten Weckers ablehnt.
  wakeup_cancel_all();
  s_next = 0;
  if (ts <= 0) return false;

  const time_t now = time(NULL);
  if (ts < now + WAKE_MIN_LEAD_S) {
    APP_LOG(APP_LOG_LEVEL_DEBUG, "Weckzeit zu nah oder vorbei (%d s)", (int)(ts - now));
    return false;
  }

  const WakeupId id = wakeup_schedule(ts, WAKE_COOKIE, false);
  if (id < 0) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "wakeup_schedule: %d", (int)id);
    return false;
  }
  s_next = ts;
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Wecker in %d min", (int)((ts - now) / 60));
  return true;
}

bool wake_pending(void) { return s_next != 0; }

time_t wake_next(void) { return s_next; }
