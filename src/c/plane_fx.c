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
// DER ANFLUG IST EIN BOGEN. Flyn taucht als Punkt am oberen Rand auf, waechst
// gleichmaessig, zieht nach unten durch die Bildmitte und verlaesst das Bild
// zuletzt oben RECHTS - dabei legt er sich in die Kurve. Die Formeln stehen in
// prv_pose.
//
// HINTER IHM EINE STAUBFAHNE. Sie wird nicht geraten: die Woelkchen sitzen dort,
// wo Flyn vorhin WAR. Dieselbe Bahnformel, nur mit einem frueheren Zeitpunkt
// gerechnet - damit stimmt die Fahne auch dann, wenn sich die Bahn spaeter
// aendert.
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

// Seitwaerts aus dem Bild: bei u = 1 liegt die Mitte eine ganze Bildbreite
// rechts von der Schirmmitte. Die Drift haengt an u hoch VIER, bleibt also
// lange bei null und schwenkt erst zum Schluss - sonst zoege Flyn schon durch
// die Bildmitte nach rechts, statt sie zu treffen.
#define DRIFT_W   100     // Prozent der Bildbreite bei u = 1

// Schraeglage, Grad bei u = 1. Sie folgt derselben spaeten Kurve wie die Drift:
// Flyn legt sich genau dann in die Kurve, wenn er sie auch fliegt.
#define TILT_DEG   28

// Staubfahne: sieben Woelkchen, je ein Sechzehntel der Laufzeit zurueck.
//
// Sichtbar wird sie erst im letzten Drittel, und das ist richtig so: solange
// Flyn frontal auf einen zukommt, liegt seine Spur hinter ihm und damit unter
// ihm. Erst wenn er nach rechts oben wegzieht, kommt sie frei.
#define DUST_N     6
#define DUST_STEP  (ANIMATION_NORMALIZED_MAX / 11)
#define DUST_R     10     // Radius in Prozent der damaligen Flugzeuggroesse

static Animation *s_anim;
static Layer *s_layer;
static PlaneFxDone s_done;
static int32_t s_progress;   // 0 .. ANIMATION_NORMALIZED_MAX

// Wo Flyn zu einem Zeitpunkt steht, wie gross er ist und wie schief er liegt.
// Einmal geschrieben, zweimal gebraucht: fuer ihn selbst und fuer jedes
// Staubwoelkchen mit einem frueheren Zeitpunkt.
typedef struct {
  int16_t cx, cy, size;
  int32_t angle;          // Pebble-Winkel, TRIG_MAX_ANGLE = voller Kreis
} FxPose;

// Die Bahn, in Worten:
//
//   Groesse   waechst GLEICHMAESSIG von einem Punkt auf gut das Dreifache der
//             Bildbreite. Keine Beschleunigung - das Ruhige an der Bewegung ist
//             das Wachsen, die Kurve macht der Weg.
//
//   Hoehe     y = h * (2,9u - 3,8u^2), also ein Bogen:
//               u = 0     oberer Rand, Flyn ist dort ein Punkt
//               u = 0,38  tiefster Punkt, knapp unter der Bildmitte
//               u = 0,5   genau die Bildmitte, schon auf dem Weg nach oben
//               u = 1     0,9 Bildhoehen darueber, alles draussen
//
//   Seite     x = w/2 + w * u^4. Die vierte Potenz haelt Flyn lange in der
//             Mitte und schwenkt ihn erst zum Schluss nach rechts - mit einer
//             flacheren Kurve zoege er schon durch die Bildmitte zur Seite,
//             statt sie zu treffen.
//
//   Neigung   folgt derselben spaeten Kurve: er legt sich genau dann in die
//             Kurve, wenn er sie auch fliegt.
static FxPose prv_pose(int32_t p, GRect bounds) {
  const int32_t pmax = ANIMATION_NORMALIZED_MAX;
  const int32_t w = bounds.size.w, h = bounds.size.h;
  if (p < 0) p = 0;

  const int32_t sq = (p * p) / pmax;          // u^2 * pmax
  // In Prozent rechnen, damit u hoch vier nicht ueberlaeuft: sq * sq waere
  // bei vollem Fortschritt rund 4,3 Milliarden und passt in kein int32.
  const int32_t u2 = (sq * 100) / pmax;       // 0..100
  const int32_t u4 = (u2 * u2) / 100;         // 0..100

  FxPose o;
  o.size  = (int16_t)(w * (2 + (300 * p) / pmax) / 100);
  o.cx    = (int16_t)(w / 2 + (w * DRIFT_W * u4) / 10000);
  o.cy    = (int16_t)((h * ((290 * p - 380 * sq) / pmax)) / 100);
  o.angle = (TRIG_MAX_ANGLE * TILT_DEG / 360) * u4 / 100;
  return o;
}

// Rasterpunkt in Bildschirmkoordinaten, um die Flugzeugmitte gedreht.
static GPoint prv_pt(const FxPose *o, int gx, int gy) {
  const int32_t dx = ((int32_t)gx - GRID / 2) * o->size / GRID;
  const int32_t dy = ((int32_t)gy - GRID / 2) * o->size / GRID;
  if (o->angle == 0) return GPoint(o->cx + dx, o->cy + dy);
  const int32_t cs = cos_lookup(o->angle), sn = sin_lookup(o->angle);
  return GPoint((int16_t)(o->cx + (dx * cs - dy * sn) / TRIG_MAX_RATIO),
                (int16_t)(o->cy + (dx * sn + dy * cs) / TRIG_MAX_RATIO));
}

static void prv_poly(GContext *ctx, const PPoint *pts, unsigned n,
                     const FxPose *o, GColor fill, bool outline, uint8_t stroke) {
  GPoint buf[MAX_PTS];
  if (n > MAX_PTS) n = MAX_PTS;
  for (unsigned i = 0; i < n; i++) buf[i] = prv_pt(o, pts[i].x, pts[i].y);
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
  prv_poly(ctx, arr, ARRAY_LENGTH(arr), o, col, out, stroke)

static void prv_plane(GContext *ctx, const FxPose *o) {
  const int16_t size = o->size;
  if (size < 5) return;
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
      const GPoint c = prv_pt(o, 50 + s * ENG_DX, ENG_Y);
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

  // ZUERST DIE STAUBFAHNE, damit Flyn darueber liegt.
  //
  // Die Woelkchen werden nicht geschaetzt: fuer jedes wird dieselbe Bahnformel
  // mit einem frueheren Zeitpunkt gerechnet. Sie sitzen also genau dort, wo
  // Flyn vorhin war - und bleiben richtig, wenn sich die Bahn einmal aendert.
  // Ihr Radius haengt an seiner damaligen Groesse und schrumpft mit dem Alter,
  // denn ausblenden kann die Uhr nicht: es gibt keine Halbtransparenz.
  graphics_context_set_fill_color(ctx, FN_COLOR_PLANE_DUST);
  for (int i = DUST_N; i >= 1; i--) {
    const int32_t pk = s_progress - (int32_t)i * DUST_STEP;
    if (pk <= 0) continue;
    const FxPose d = prv_pose(pk, bounds);
    // Deutlich schrumpfend, und die Woelkchen liegen weit auseinander. Sanfter
    // geschrumpft ueberlappten sie einander zu einem einzigen Schmier - aus
    // Wolken wurde ein Fleck.
    const int16_t r = (int16_t)(((int32_t)d.size * DUST_R) / 100 / (i + 1));
    if (r < 2) continue;
    // Etwas unter die damalige Mitte: die Fahne haengt hinter und unter Flyn,
    // nicht in seiner Flugbahn.
    graphics_fill_circle(ctx, GPoint(d.cx, d.cy + d.size / 8), r);
  }

  const FxPose o = prv_pose(s_progress, bounds);
  prv_plane(ctx, &o);
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
