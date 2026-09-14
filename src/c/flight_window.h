#pragma once
#include <pebble.h>

// Das einzige Fenster der App: sechs Seiten im Timeline-Look, mit Hoch und
// Runter durchgeblaettert, Mitte holt frische Daten.
// woken = true, wenn ein Wakeup die App gestartet hat. Dann zeigt sie sich
// nicht, sondern sieht nur nach und beendet sich wieder - es sei denn, es gibt
// etwas zu melden.
void flight_window_push(bool woken);
