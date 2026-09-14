#include <pebble.h>
#include "plane_fx.h"
#include "theme.h"

// Das Flugzeug von vorn, nach einer Handzeichnung des Auftraggebers. Gebaut aus
// Polygonen und Kreisen, kein Bitmap - nur deshalb kann es beim Anflug vom
// Punkt auf das Dreifache der Bildbreite wachsen, ohne zu treppen.
//
// WAS DIE ZEICHNUNG VORGIBT, und worin sie vom vorigen Entwurf abweicht:
//
//   SECHSECKIGER RUMPF. Kantig, nicht rund: flache Oberkante, zwei kurze
//   Schultern nach aussen, zwei lange Flanken auf eine flache Unterkante.
//
//   WAAGRECHTE FLUEGEL. Lange duenne Balken fast ueber die volle Breite, ohne
//   V-Stellung. Der vorige Entwurf liess sie nach aussen ansteigen; die
//   Zeichnung tut das ausdruecklich nicht.
//
//   TRIEBWERKE AN PYLONEN. Sie haengen deutlich UNTER dem Fluegel an einem
//   sichtbaren Steg, statt mit ihm zu verschmelzen. Dadurch darf die Gondel
//   auch ihren dunklen Rand zurueckbekommen: sie liegt nicht mehr ueber dem
//   Fluegel und kann ihn nicht mehr durchtrennen.
//
//   EIN GESICHT. Zwei quadratische Fenster mit dunklen Pupillen und ein breites
//   V darunter. Das ist der Unterschied zwischen Flugzeug und
//   Zeichentrickflugzeug.
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
static const PPoint s_fin[]     = { {47,  4}, {53,  4}, {55, 26}, {45, 26} };
static const PPoint s_finline[] = { {49,  8}, {51,  8}, {51, 24}, {49, 24} };

// Waagrechte Fluegel. Sie reichen in den Rumpf hinein, damit keine Fuge bleibt;
// die Rumpfkontur wird darueber gezeichnet und schliesst sie ab.
static const PPoint s_wingR[] = { {63, 47}, {96, 48}, {99, 53}, {96, 59}, {63, 59} };
static const PPoint s_wingL[] = { {37, 47}, { 4, 48}, { 1, 53}, { 4, 59}, {37, 59} };

// Pylone: die Stege, an denen die Gondeln haengen
static const PPoint s_pylR[] = { {73, 57}, {79, 57}, {79, 67}, {73, 67} };
static const PPoint s_pylL[] = { {27, 57}, {21, 57}, {21, 67}, {27, 67} };

// Rumpf als Sechseck
static const PPoint s_body[] = { {41, 26}, {59, 26}, {68, 44}, {58, 78}, {42, 78}, {32, 44} };

// Das Gesicht. Jedes Auge ist dreilagig: dunkler Rahmen, helle Flaeche, dunkle
// Pupille - so, wie es die Zeichnung zeigt.
static const PPoint s_eyeLo[] = { {39, 35}, {48, 35}, {48, 47}, {39, 47} };
static const PPoint s_eyeLi[] = { {41, 37}, {46, 37}, {46, 45}, {41, 45} };
static const PPoint s_eyeLp[] = { {42, 39}, {45, 39}, {45, 43}, {42, 43} };
static const PPoint s_eyeRo[] = { {52, 35}, {61, 35}, {61, 47}, {52, 47} };
static const PPoint s_eyeRi[] = { {54, 37}, {59, 37}, {59, 45}, {54, 45} };
static const PPoint s_eyeRp[] = { {55, 39}, {58, 39}, {58, 43}, {55, 43} };
static const PPoint s_mouth[] = { {41, 54}, {50, 63}, {59, 54}, {59, 58}, {50, 68}, {41, 58} };

// Gondeln: Mitte 50 +/- ENG_DX, Scheibe ENG_R, dunkler Lufteinlass ENG_CORE.
// Sie haengen unter dem Fluegel (Unterkante 59) und beruehren ihn nicht.
#define ENG_DX   26
#define ENG_Y    76
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
  POLY(s_pylR, FN_COLOR_PLANE_FILL, true);
  POLY(s_pylL, FN_COLOR_PLANE_FILL, true);

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

  // Der Weg ist ein Bogen:   y = h * (3,35u - 4,7u^2),   u = p / pmax
  //
  //   u = 0      y = 0         oberer Rand, das Flugzeug ist dort ein Punkt
  //   u = 0,356  y = 0,60 h    tiefster Punkt, knapp unter der Bildmitte
  //   u = 0,5    y = 0,50 h    genau die Bildmitte, schon auf dem Weg nach oben
  //   u = 1      y = -1,35 h   weit darueber, alles draussen
  //
  // Warum 1,35 Bildhoehen und nicht eine wie zuvor: die Gondeln haengen seit der
  // Zeichnung tiefer, die Unterkante liegt bei 87 von 100 statt bei 75. Bei
  // dreifacher Bildbreite sind das gut 0,37 der Groesse unter der Mitte - mit
  // nur einer Bildhoehe Hub blieben sie am Ende sichtbar im Bild haengen.
  //
  // Gerechnet in zwei Schritten, sonst laeuft int32 ueber: erst der Faktor
  // (-135 bis +60), dann erst die Bildhoehe.
  const int32_t sq = (p * p) / pmax;
  const int32_t k = (335 * p - 470 * sq) / pmax;
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
