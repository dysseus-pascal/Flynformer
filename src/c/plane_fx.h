#pragma once
#include <pebble.h>

// Das Flugzeug von vorn, als Polygonzug (kein Bitmap), plus der Anflug beim
// Start: aus der Tiefe nach vorn und oben aus dem Bild.

typedef void (*PlaneFxDone)(void);

// Flugzeug in gegebener Groesse um center zeichnen. size ist die Kantenlaenge
// des gedachten Quadrats; unter 6 px wird nichts gezeichnet, dort waere es nur
// ein Fleck.
void plane_fx_draw(GContext *ctx, GPoint center, int16_t size);

// Anflug starten. layer wird je Bild als schmutzig markiert; dessen
// update_proc muss plane_fx_draw_frame aufrufen, solange plane_fx_is_playing.
// done wird einmal am Ende gerufen, auch wenn kein Speicher fuer die Animation
// da war.
void plane_fx_play(Layer *layer, PlaneFxDone done);

// Aktuelles Bild des Anflugs zeichnen. Tut nichts, wenn nichts laeuft.
void plane_fx_draw_frame(GContext *ctx, GRect bounds);

bool plane_fx_is_playing(void);

// Vorzeitig abbrechen (Fenster wird geschlossen)
void plane_fx_stop(void);
