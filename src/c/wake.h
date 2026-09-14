#pragma once
#include <pebble.h>

// Selbstweckung. Die Uhr startet die App zu einer Zeit, die die Telefonseite
// ausrechnet - nur sie kennt die echten Zeitzonen beider Flughaefen.
//
// WICHTIG UND UNSCHOEN: ein Wakeup startet die App im VORDERGRUND. Einen
// stillen Hintergrundlauf gibt es auf Pebble nicht; der Worker-Prozess kann
// kein AppMessage und erreicht das Telefon gar nicht. Jede Weckung schiebt
// also kurz Flynformer vor das Zifferblatt. Deshalb wird nur nahe am Abflug
// geweckt, und beim Wecken beendet sich die App sofort wieder, sobald sie
// nichts Meldenswertes gefunden hat.

// Weckzeit setzen. ts ist eine Unixzeit in Sekunden; 0 loescht den Plan.
// Liegt ts in der Vergangenheit oder zu nah (das SDK verlangt eine Minute
// Abstand), passiert nichts. Gibt true zurueck, wenn ein Wecker steht.
bool wake_set(time_t ts);

// Steht ein Wecker? Nur zur Anzeige und fuer Tests.
bool wake_pending(void);

// Geplante Weckzeit, 0 wenn keine.
time_t wake_next(void);
