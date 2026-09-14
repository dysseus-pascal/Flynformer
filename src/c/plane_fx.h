#pragma once
#include <pebble.h>

// Flyn von vorn, aus Polygonen und Kreisen (kein Bitmap), plus sein Anflug:
// als Punkt oben herein, durch die Bildmitte, und mit Staubfahne und
// Schraeglage oben rechts wieder hinaus.
//
// Das Zeichnen selbst ist nicht mehr oeffentlich - Flyn erscheint nur im
// Anflug, und der kennt seine Bahn selbst.

typedef void (*PlaneFxDone)(void);

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
