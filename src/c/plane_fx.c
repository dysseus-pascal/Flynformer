#include <pebble.h>
#include "plane_fx.h"
#include "theme.h"

// Das Flugzeug von vorn, nach einer Handzeichnung des Auftraggebers. Gebaut aus
// Polygonen und Kreisen, kein Bitmap - nur deshalb kann es beim Anflug vom
// Punkt auf das Dreifache der Bildbreite wachsen, ohne zu treppen.
//
// WAS DIE ZEICHNUNG VORGIBT, und worin sie vom vorigen Entwurf abweicht:
//
//   GEDRUNGENER RUMPF mit gebrochenen Ecken. Ein Zwoelfeck, 40 breit und 48
//   hoch. Der erste Entwurf stand mit 36 zu 52 hochkant und zog damit das
//   Gesicht in die Laenge.
//
//   WAAGRECHTE FLUEGEL. Lange duenne Balken fast ueber die volle Breite, ohne
//   V-Stellung. Der vorige Entwurf liess sie nach aussen ansteigen; die
//   Zeichnung tut das ausdruecklich nicht.
//
//   TRIEBWERKE OHNE PYLONE, dicht am Fluegel. Die Stege waren zwei duenne
//   Striche, die nichts erklaerten und auf 144 Pixeln nur Unruhe machten. Die
//   Gondel ueberlappt den Fluegel jetzt und wird NACH ihm gezeichnet, liegt
//   also davor - so, wie das Triebwerk einer echten Maschine vor der
//   Fluegelvorderkante sitzt.
//
//   EIN GESICHT. Zwei quadratische Fenster mit dunklen Pupillen und darunter
//   ein flaches, weites Laecheln nach dem Vorbild des Glases aus Drinktervall.
//   Das ist der Unterschied zwischen Flugzeug und Zeichentrickflugzeug.
//
// DER ANFLUG IST EIN BOGEN. Das Flugzeug taucht als Punkt am oberen Rand auf,
// waechst gleichmaessig, zieht nach unten durch die Bildmitte und steigt gross
// wieder nach oben aus dem Bild. Die Formel steht in plane_fx_draw_frame.
//
// ZEICHENREIHENFOLGE: von hinten nach vorn. Leitwerk, Fluegel, Pylone und
// Gondeln, dann der Rumpf darueber - so laeuft seine Kontur sauber vor den
// Fluegelwurzeln durch, wie in der Zeichnung. Das Gesicht zuletzt.

#define FX_MS 1900
#define GRID  100     // Bezugsraster der Punkte unten

typedef struct { int8_t x, y; } PPoint;

// Seitenleitwerk, schmal und hoch, mit dunkler Mittellinie
static const PPoint s_fin[]     = { {47,  4}, {53,  4}, {55, 24}, {45, 24} };
static const PPoint s_finline[] = { {49,  7}, {51,  7}, {51, 22}, {49, 22} };

// Waagrechte Fluegel. Sie reichen in den Rumpf hinein, damit keine Fuge bleibt;
// die Rumpfkontur wird darueber gezeichnet und schliesst sie ab.
static const PPoint s_wingR[] = { {62, 46}, {96, 47}, {99, 52}, {96, 58}, {62, 58} };
static const PPoint s_wingL[] = { {38, 46}, { 4, 47}, { 1, 52}, { 4, 58}, {38, 58} };

// Rumpf als Zwoelfeck: dieselbe gedrungene Form wie ein Sechseck, aber mit
// gebrochenen Ecken. Breiter und kuerzer als der erste Entwurf (40 zu 48 statt
// 36 zu 52) - hochkant zog es das Gesicht in die Laenge.
static const PPoint s_body[] = {
  {44, 24}, {56, 24}, {65, 30}, {70, 42}, {68, 56}, {60, 68},
  {52, 72}, {48, 72}, {40, 68}, {32, 56}, {30, 42}, {35, 30},
};

// Das Gesicht. Jedes Auge ist dreilagig: dunkler Rahmen, helle Flaeche, dunkle
// Pupille - so, wie es die Zeichnung zeigt.
static const PPoint s_eyeLo[] = { {38, 33}, {47, 33}, {47, 44}, {38, 44} };
static const PPoint s_eyeLi[] = { {40, 35}, {45, 35}, {45, 42}, {40, 42} };
static const PPoint s_eyeLp[] = { {41, 36}, {44, 36}, {44, 41}, {41, 41} };
static const PPoint s_eyeRo[] = { {53, 33}, {62, 33}, {62, 44}, {53, 44} };
static const PPoint s_eyeRi[] = { {55, 35}, {60, 35}, {60, 42}, {55, 42} };
static const PPoint s_eyeRp[] = { {56, 36}, {59, 36}, {59, 41}, {56, 41} };

// Der Mund folgt dem Glas aus Drinktervall: dort ist er eine offene Polylinie,
// 23 Einheiten breit und nur 3 tief - ein flacher, weiter Bogen. Hier 24 zu 4,
// also dasselbe Verhaeltnis. Vorher war er 18 breit und 14 tief und las sich
// damit als Schnabel statt als Laecheln.
//
// Zwei Unterschiede zur Vorlage, beide mit Grund: das Glas zieht einen STRICH,
// weil es selbst hell mit dunkler Kontur ist - hier wird der Mund in eine
// Flaeche geschnitten und braucht deshalb Dicke. Und die Zwischenpunkte machen
// aus dem Knick einen Bogen; ein gezogener Strich rundet an der Ecke von selbst.
static const PPoint s_mouth[] = {
  {38, 53}, {44, 56}, {50, 57}, {56, 56}, {62, 53},
  {62, 57}, {56, 60}, {50, 61}, {44, 60}, {38, 57},
};

// Gondeln: Mitte 50 +/- ENG_DX, Scheibe ENG_R, dunkler Lufteinlass ENG_CORE.
//
// Sie UEBERLAPPEN den Fluegel (Unterkante 58), statt ihn nur zu beruehren: bei
// blosser Beruehrung legen sich die dunkle Fluegelkante und der dunkle
// Gondelrand nebeneinander und lesen sich als Spalt. Weil die Gondel NACH dem
// Fluegel gezeichnet wird, liegt sie davor - genau wie an einer echten
// Maschine, deren Triebwerk vor der Fluegelvorderkante sitzt.
#define ENG_DX   26
#define ENG_Y    64
#define ENG_R    11
#define ENG_CORE  7

#define MAX_PTS 20

// Unterhalb dieser Groesse bleiben die Feinheiten weg: Mittellinie der Finne
// und die inneren Augenlagen. Klein gezeichnet wird daraus ohnehin nur Matsch,
// und der Anflug beginnt bei wenigen Pixeln.
#define DETAIL_MIN 70

static Animation *s_anim;
static Layer *s_layer;
static PlaneFxDone s_done;
static int32_t s_progress;   // 0 .. ANIMATION_NORMALIZED_MAX

static int16_t prv_map(int16_t center, int v, int16_t size) {
  return (int16_t)(center + ((int32_t)v - GRID / 2) * size / GRID);
}

static void prv_poly(GContext *ctx, const PPoint *pts, unsigned n,
                     int16_t cx, int16_t cy, int16_t size,
                     GColor fill, bool outline, uint8_t stroke) {
  GPoint buf[MAX_PTS];
  if (n > MAX_PTS) n = MAX_PTS;
  for (unsigned i = 0; i < n; i++) {
    buf[i].x = prv_map(cx, pts[i].x, size);
    buf[i].y = prv_map(cy, pts[i].y, size);
  }
  GPathInfo info = { .num_points = n, .points = buf };
  GPath *p = gpath_create(&info);
  if (!p) return;
  graphics_context_set_fill_color(ctx, fill);
  gpath_draw_filled(ctx, p);
  if (outline) {
    graphics_context_set_stroke_color(ctx, FN_COLOR_PLANE_LINE);
    graphics_context_set_stroke_width(ctx, stroke);
    gpath_draw_outline(ctx, p);
  }
  gpath_destroy(p);
}

#define POLY(arr, col, out) \
  prv_poly(ctx, arr, ARRAY_LENGTH(arr), cx, cy, size, col, out, stroke)

void plane_fx_draw(GContext *ctx, GPoint center, int16_t size) {
  if (size < 5) return;
  const int16_t cx = center.x, cy = center.y;
  // Strichstaerke rund 3,5 % der Groesse, mindestens 1 und immer ungerade -
  // graphics_context_set_stroke_width zeichnet nur ungerade Breiten mittig.
  const uint8_t stroke = (uint8_t)((size / 28) | 1);
  const bool detail = (size >= DETAIL_MIN);

  POLY(s_fin, FN_COLOR_PLANE_FILL, true);
  if (detail) POLY(s_finline, FN_COLOR_PLANE_HOLE, false);

  POLY(s_wingR, FN_COLOR_PLANE_FILL, true);
  POLY(s_wingL, FN_COLOR_PLANE_FILL, true);

  // Gondeln: helle Scheibe mit dunklem Rand, darin der Lufteinlass
  const int16_t r = (int16_t)(((int32_t)ENG_R * size) / GRID);
  if (r >= 2) {
    for (int s = -1; s <= 1; s += 2) {
      const GPoint c = GPoint(prv_map(cx, 50 + s * ENG_DX, size),
                              prv_map(cy, ENG_Y, size));
      graphics_context_set_fill_color(ctx, FN_COLOR_PLANE_FILL);
      graphics_fill_circle(ctx, c, r);
      graphics_context_set_stroke_color(ctx, FN_COLOR_PLANE_LINE);
      graphics_context_set_stroke_width(ctx, stroke);
      graphics_draw_circle(ctx, c, r);
      graphics_context_set_fill_color(ctx, FN_COLOR_PLANE_HOLE);
      graphics_fill_circle(ctx, c, (int16_t)(((int32_t)ENG_CORE * size) / GRID));
    }
  }

  // Der Rumpf zuletzt vor dem Gesicht: seine Kontur laeuft damit sauber vor den
  // Fluegelwurzeln durch, statt von ihnen durchschnitten zu werden.
  POLY(s_body, FN_COLOR_PLANE_FILL, true);

  POLY(s_eyeLo, FN_COLOR_PLANE_HOLE, false);
  POLY(s_eyeRo, FN_COLOR_PLANE_HOLE, false);
  if (detail) {
    POLY(s_eyeLi, FN_COLOR_PLANE_FILL, false);
    POLY(s_eyeLp, FN_COLOR_PLANE_HOLE, false);
    POLY(s_eyeRi, FN_COLOR_PLANE_FILL, false);
    POLY(s_eyeRp, FN_COLOR_PLANE_HOLE, false);
  }
  POLY(s_mouth, FN_COLOR_PLANE_HOLE, false);
}

bool plane_fx_is_playing(void) {
  return s_anim != NULL;
}

void plane_fx_draw_frame(GContext *ctx, GRect bounds) {
  if (!s_anim) return;
  const int32_t p = s_progress;                    // 0 .. 65536
  const int32_t pmax = ANIMATION_NORMALIZED_MAX;
  const int32_t h = bounds.size.h;

  // Die Groesse waechst GLEICHMAESSIG durch, von einem Punkt auf gut das
  // Dreifache der Bildbreite. Keine Beschleunigung: das Ruhige an der Bewegung
  // ist das Wachsen, die Kurve macht der Weg.
  const int16_t size = (int16_t)((int32_t)bounds.size.w * (2 + (300 * p) / pmax) / 100);

  // Der Weg ist ein Bogen:   y = h * (2,9u - 3,8u^2),   u = p / pmax
  //
  //   u = 0      y = 0         oberer Rand, das Flugzeug ist dort ein Punkt
  //   u = 0,38   y = 0,55 h    tiefster Punkt, knapp unter der Bildmitte
  //   u = 0,5    y = 0,50 h    genau die Bildmitte, schon auf dem Weg nach oben
  //   u = 1      y = -0,90 h   darueber, alles draussen
  //
  // Der Hub ist auf 0,90 Bildhoehen zurueckgegangen, weil die Gondeln ohne
  // Pylone hoeher sitzen: die Unterkante liegt bei 75 von 100 Rastereinheiten
  // statt bei 87. Ein groesserer Hub waere nicht falsch, aber das Flugzeug
  // waere dann schon fertig draussen, waehrend die Animation noch laeuft - und
  // der Schirm stuende die letzte Zehntelsekunde leer.
  //
  // Gerechnet in zwei Schritten, sonst laeuft int32 ueber: erst der Faktor
  // (-90 bis +55), dann erst die Bildhoehe.
  const int32_t sq = (p * p) / pmax;
  const int32_t k = (290 * p - 380 * sq) / pmax;
  const int16_t cy = (int16_t)((h * k) / 100);

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
  animation_set_curve(s_anim, AnimationCurveLinear);   // die Kurve steckt oben
  animation_schedule(s_anim);
}

void plane_fx_stop(void) {
  if (s_anim) animation_unschedule(s_anim);
}
