#pragma once
#include <pebble.h>

// Flugnummer auf der Uhr eingeben: zwei Buchstaben, bis zu vier Ziffern.
// done wird mit der fertigen Nummer gerufen, wenn bestaetigt wurde - und gar
// nicht, wenn abgebrochen wurde.
typedef void (*InputDone)(const char *code);

// preset darf NULL oder leer sein; sonst steht die bisherige Nummer schon da.
void input_window_push(const char *preset, InputDone done);
