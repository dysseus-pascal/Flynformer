#include <pebble.h>
#include "plane_fx.h"
#include "theme.h"

// Das Flugzeug von vorn, aus Polygonen und Kreisen gezeichnet - kein Bitmap.
// Nur deshalb kann es beim Anflug vom Punkt auf das Dreifache der Bildbreite
// wachsen, ohne zu treppen.
//
// GEFUELLTE FLAECHE, keine Kontur. Frueh im Anflug ist es nur ein paar Pixel
// gross; von einer Strichzeichnung bliebe dort nichts als Gekrakel. Erst die
// Aussparungen machen daraus eine Figur: zwei Kanzelfenster und der dunkle
// Lufteinlass in jeder Gondel.
//
// DIE GONDELN SIND KREISE. Von vorn gesehen ist eine Triebwerksgondel rund -
// die frueheren schraegen Vierecke sassen flach auf dem Fluegel und lasen sich
// als Landeklappen. Die Kreise haengen unter dem Fluegel und ueberlappen ihn.
// graphics_fill_circle gibt es fertig, das ist billiger als ein Vieleck.
//
// DIE FLUEGEL STEIGEN NACH AUSSEN AN. Diese V-Stellung ist das Merkmal, an dem
// man eine Frontansicht auf einen Blick erkennt; waagrechte Fluegel liessen
// offen, von wo man draufschaut.
//
// DER ANFLUG IST EIN BOGEN. Das Flugzeug taucht als Punkt am oberen Rand auf,
// waechst gleichmaessig, zieht dabei nach unten durch die Bildmitte und steigt
// gross wieder nach oben aus dem Bild - so, wie eine Maschine ueber einen
// hinwegzieht. Die Formel steht unten in plane_fx_draw_frame.
//
// ZEICHENREIHENFOLGE: von hinten nach vorn. Seiten- und Hoehenleitwerk liegen
// hinter dem Rumpf, die Gondeln davor, die Aussparungen zuletzt.

#define FX_MS 1900
#define GRID  100     // Bezugsraster der Punkte unten

typedef struct { int8_t x, y; } PPoint;

// Rumpf und Tragflaechen in einem geschlossenen Zug, im Uhrzeigersinn.
//
// Die Fluegel sind mit 10 bis 11 Rastereinheiten bewusst dick. Duenner ging
// nicht: der schwarze Umriss liegt mittig auf der Kante und frisst von beiden
// Seiten, sodass von einem duennen Fluegel nichts uebrig blieb.
static const PPoint s_body[] = {
  {44, 22}, {56, 22},                       // Rumpf oben, unter der Finne
  {60, 40}, {62, 46},                       // rechte Schulter
  {97, 36}, {98, 46},                       // rechter Fluegel, nach aussen hoch
  {65, 57},                                 // Fluegelwurzel unten
  {64, 62}, {58, 71}, {50, 75}, {42, 71}, {36, 62},   // runder Bauch
  {35, 57},                                 // linke Fluegelwurzel
  { 2, 46}, { 3, 36},                       // linker Fluegel
  {38, 46}, {40, 40},                       // linke Schulter
};
static const PPoint s_fin[]  = { {46,  7}, {54,  7}, {55, 25}, {45, 25} };
static const PPoint s_stab[] = { {33, 24}, {67, 24}, {68, 31}, {32, 31} };
// Kanzelfenster - erst sie machen aus der Form ein Gesicht
static const PPoint s_winL[] = { {42, 46}, {48, 45}, {48, 53}, {42, 53} };
static const PPoint s_winR[] = { {52, 45}, {58, 46}, {58, 53}, {52, 53} };

// Gondeln: Mitte 50 +/- ENG_DX, Scheibe ENG_R, dunkler Lufteinlass ENG_CORE.
//
// Der Abstand ist so gewaehlt, dass zwischen Rumpf und Gondel noch Fluegel zu
// sehen ist und aussen auch noch einer heraussteht. Sassen sie weiter innen und
// waren groesser, verschluckten sie den ganzen Innenfluegel: dann las sich die
// Form als Rumpf, Kreis, Stummel statt als Flugzeug. Und sie haengen UNTER dem
// Fluegel - die Scheibenoberkante liegt unterhalb der Fluegeloberkante, sodass
// sie sich nach unten herauswoelbt.
#define ENG_DX   28
#define ENG_Y    55
#define ENG_R    10
#define ENG_CORE  4

#define MAX_PTS 20

static Animation *s_anim;
static Layer *s_layer;
static PlaneFxDone s_done;
static int32_t s_progress;   // 0 .. ANIMATION_NORMALIZED_MAX

// Rasterwert in Bildschirmkoordinaten. size ist die Kantenlaenge des Rasters.
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

static void prv_disc(GContext *ctx, int16_t cx, int16_t cy, int16_t size,
                     int gx, int gy, int gr, GColor fill) {
  const int16_t r = (int16_t)(((int32_t)gr * size) / GRID);
  if (r < 1) return;
  graphics_context_set_fill_color(ctx, fill);
  graphics_fill_circle(ctx, GPoint(prv_map(cx, gx, size), prv_map(cy, gy, size)), r);
}

void plane_fx_draw(GContext *ctx, GPoint center, int16_t size) {
  if (size < 5) return;
  const int16_t cx = center.x, cy = center.y;
  // Strichstaerke rund 3,5 % der Groesse, mindestens 1 und immer ungerade -
  // graphics_context_set_stroke_width zeichnet nur ungerade Breiten mittig.
  // Bei 5 % war sie so breit, dass sie die Fluegel von beiden Seiten auffrass.
  const uint8_t stroke = (uint8_t)((size / 28) | 1);

  prv_poly(ctx, s_fin,  ARRAY_LENGTH(s_fin),  cx, cy, size, FN_COLOR_PLANE_FILL, true, stroke);
  prv_poly(ctx, s_stab, ARRAY_LENGTH(s_stab), cx, cy, size, FN_COLOR_PLANE_FILL, true, stroke);
  prv_poly(ctx, s_body, ARRAY_LENGTH(s_body), cx, cy, size, FN_COLOR_PLANE_FILL, true, stroke);

  // Gondeln: helle Scheibe, darin der dunkle Lufteinlass. KEIN schwarzer Ring
  // aussen herum - der lag genau ueber dem Fluegel und durchtrennte ihn, sodass
  // innen ein Stummel und aussen ein abgetrennter Balken stehen blieb. Ohne Ring
  // verschmilzt die Scheibe mit dem Fluegel und woelbt sich nur nach unten
  // heraus; erkennbar bleibt sie durch den Kern.
  const int16_t r = (int16_t)(((int32_t)ENG_R * size) / GRID);
  if (r >= 2) {
    for (int s = -1; s <= 1; s += 2) {
      const int gx = 50 + s * ENG_DX;
      prv_disc(ctx, cx, cy, size, gx, ENG_Y, ENG_R, FN_COLOR_PLANE_FILL);
      prv_disc(ctx, cx, cy, size, gx, ENG_Y, ENG_CORE, FN_COLOR_PLANE_HOLE);
    }
  }

  prv_poly(ctx, s_winL, ARRAY_LENGTH(s_winL), cx, cy, size, FN_COLOR_PLANE_HOLE, false, 1);
  prv_poly(ctx, s_winR, ARRAY_LENGTH(s_winR), cx, cy, size, FN_COLOR_PLANE_HOLE, false, 1);
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
  // Dreifache der Bildbreite. Keine Beschleunigung: das Wachsen ist das Ruhige
  // an der Bewegung, die Kurve macht der Weg.
  const int16_t size = (int16_t)((int32_t)bounds.size.w * (2 + (300 * p) / pmax) / 100);

  // Der Weg ist ein Bogen:   y = h * u * (3 - 4u),   u = p / pmax
  //
  //   u = 0      y = 0        oberer Rand, das Flugzeug ist dort ein Punkt
  //   u = 0.375  y = 0.56 h   tiefster Punkt, knapp unter der Bildmitte
  //   u = 0.5    y = 0.5 h    genau die Bildmitte, schon auf dem Weg nach oben
  //   u = 1      y = -h       eine ganze Bildhoehe darueber, alles draussen
  //
  // Es kommt also von oben herein, senkt sich durch die Mitte und steigt wieder
  // hinaus - wie eine Maschine, die ueber einen hinwegzieht. Am Ende liegt die
  // Unterkante ein Viertel der Groesse unter der Mitte, also gut 0,75 h, und
  // damit auf allen drei Plattformen ueber dem oberen Rand.
  const int32_t sq = (p * p) / pmax;
  const int16_t cy = (int16_t)((h * (3 * p - 4 * sq)) / pmax);

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
