#include <pebble.h>
#include "plane_fx.h"
#include "theme.h"

// Das Flugzeug von vorn, als Polygonzug gezeichnet - kein Bitmap. Nur deshalb
// kann es beim Anflug vom Achtzigstel auf das Vierfache wachsen, ohne zu
// treppen. Dieselbe Bauweise wie das Glas bei Drinktervall.
//
// ANFLUG: aus der Tiefe nach vorn und oben aus dem Bild. Die Beschleunigung ist
// absichtlich ungleichmaessig - lange klein und langsam, dann rasch gross. Eine
// gleichmaessige Skalierung wirkt wie ein Zoom, nicht wie ein Ueberflug.
//
// ZEICHENREIHENFOLGE: Hoehenleitwerk zuerst (es liegt hinten), dann der
// Hauptumriss darueber, zuletzt die Triebwerke. Andersherum verdeckt der Rumpf,
// was vor ihm liegen muesste.

#define FX_MS 1900
#define GRID  100     // Bezugsraster der Punkte unten

// Punkte im 100x100-Raster. Erst zur Zeichenzeit auf die gewuenschte Groesse
// gerechnet, damit jede Zwischengroesse sauber bleibt.
typedef struct { int8_t x, y; } PPoint;

// Seitenleitwerk, Rumpf und Tragflaechen in einem Zug
static const PPoint s_body[] = {
  {47, 7}, {53, 7}, {56, 36}, {61, 42}, {62, 47}, {98, 43}, {98, 50}, {63, 57},
  {60, 62}, {54, 68}, {46, 68}, {40, 62}, {37, 57}, {2, 50}, {2, 43}, {38, 47},
  {39, 42}, {44, 36},
};
// Hoehenleitwerk, liegt hinter dem Rumpf
static const PPoint s_tail[] = { {34, 30}, {66, 30}, {68, 35}, {32, 35} };
// Triebwerke - erst sie machen aus der Silhouette ein Verkehrsflugzeug
static const PPoint s_engR[] = { {68, 52}, {83, 49}, {84, 61}, {69, 63} };
static const PPoint s_engL[] = { {32, 52}, {17, 49}, {16, 61}, {31, 63} };

#define MAX_PTS 18

static Animation *s_anim;
static Layer *s_layer;
static PlaneFxDone s_done;
static int32_t s_progress;   // 0 .. ANIMATION_NORMALIZED_MAX

// Einen Polygonzug gefuellt und umrandet zeichnen. cx/cy ist die Bildmitte des
// Flugzeugs, size seine Kantenlaenge im Raster.
static void prv_draw_poly(GContext *ctx, const PPoint *pts, unsigned n,
                          int16_t cx, int16_t cy, int16_t size, uint8_t stroke) {
  GPoint buf[MAX_PTS];
  if (n > MAX_PTS) n = MAX_PTS;
  for (unsigned i = 0; i < n; i++) {
    buf[i].x = (int16_t)(cx + ((int32_t)pts[i].x - GRID / 2) * size / GRID);
    buf[i].y = (int16_t)(cy + ((int32_t)pts[i].y - GRID / 2) * size / GRID);
  }
  GPathInfo info = { .num_points = n, .points = buf };
  GPath *p = gpath_create(&info);
  if (!p) return;
  graphics_context_set_fill_color(ctx, FN_COLOR_PLANE_FILL);
  gpath_draw_filled(ctx, p);
  graphics_context_set_stroke_color(ctx, FN_COLOR_PLANE_LINE);
  graphics_context_set_stroke_width(ctx, stroke);
  gpath_draw_outline(ctx, p);
  gpath_destroy(p);
}

void plane_fx_draw(GContext *ctx, GPoint center, int16_t size) {
  if (size < 6) return;
  // Strichstaerke rund 5 % der Groesse, mindestens 1 und immer ungerade -
  // graphics_context_set_stroke_width zeichnet nur ungerade Breiten mittig.
  uint8_t stroke = (uint8_t)((size / 20) | 1);
  prv_draw_poly(ctx, s_tail, ARRAY_LENGTH(s_tail), center.x, center.y, size, stroke);
  prv_draw_poly(ctx, s_body, ARRAY_LENGTH(s_body), center.x, center.y, size, stroke);
  prv_draw_poly(ctx, s_engR, ARRAY_LENGTH(s_engR), center.x, center.y, size, stroke);
  prv_draw_poly(ctx, s_engL, ARRAY_LENGTH(s_engL), center.x, center.y, size, stroke);
}

bool plane_fx_is_playing(void) {
  return s_anim != NULL;
}

// Fortschritt in Groesse und Hoehe umsetzen. Beide Kurven sind bewusst nicht
// linear: die Groesse waechst quadratisch (Naeherung an eine Perspektive), der
// Weg nach oben erst spaet.
void plane_fx_draw_frame(GContext *ctx, GRect bounds) {
  if (!s_anim) return;
  const int32_t p = s_progress;                    // 0 .. 65536
  const int32_t pmax = ANIMATION_NORMALIZED_MAX;

  // Groesse: von 4 % auf 380 % der Bildbreite, quadratisch
  const int32_t base = bounds.size.w;
  const int32_t sq = (p * p) / pmax;               // 0 .. pmax, quadratisch
  int16_t size = (int16_t)(base * (4 + (376 * sq) / pmax) / 100);

  // Hoehe: startet knapp unter der Mitte, faehrt spaet nach oben hinaus
  const int32_t cube = (sq * p) / pmax;            // noch spaeter einsetzend
  int16_t cy = (int16_t)(bounds.size.h * 58 / 100 - (bounds.size.h * 4 * cube) / pmax);

  plane_fx_draw(ctx, GPoint(bounds.size.w / 2, cy), size);
}

static void prv_setup(Animation *animation) { }

static void prv_update(Animation *animation, const AnimationProgress progress) {
  s_progress = progress;
  if (s_layer) layer_mark_dirty(s_layer);
}

static void prv_teardown(Animation *animation) {
  // Das SDK gibt beendete Animationen nicht selbst frei; auch nach
  // animation_unschedule landet man hier.
  animation_destroy(animation);
  s_anim = NULL;
  s_progress = 0;
  PlaneFxDone done = s_done;
  s_done = NULL;
  s_layer = NULL;
  if (done) done();
}

static const AnimationImplementation s_impl = {
  .setup = prv_setup, .update = prv_update, .teardown = prv_teardown,
};

void plane_fx_play(Layer *layer, PlaneFxDone done) {
  if (s_anim) return;
  s_layer = layer;
  s_done = done;
  s_progress = 0;
  s_anim = animation_create();
  if (!s_anim) {                 // kein Speicher: ohne Anflug weitermachen
    s_layer = NULL;
    s_done = NULL;
    if (done) done();
    return;
  }
  animation_set_implementation(s_anim, &s_impl);
  animation_set_duration(s_anim, FX_MS);
  animation_set_curve(s_anim, AnimationCurveLinear);   // die Kurven stecken oben
  animation_schedule(s_anim);
}

void plane_fx_stop(void) {
  if (s_anim) animation_unschedule(s_anim);
}
