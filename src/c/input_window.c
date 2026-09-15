#include <pebble.h>
#include "input_window.h"
#include "theme.h"
#include "strings.h"

// Flugnummer auf der Uhr eingeben - zweistelliges Kuerzel und bis zu vier
// Ziffern, also LH400, LX100, EK88, LH1234 oder U21234.
//
// Die Uhr hat keine Tastatur. Bewaehrt ist deshalb das Muster, das auch der
// Timer benutzt: eine Stelle ist gewaehlt, Hoch und Runter blaettern durch die
// moeglichen Zeichen, Mitte rueckt eine Stelle weiter. Auf der letzten Stelle
// bestaetigt Mitte die Eingabe.
//
// Eine Regel haelt die Nummer gueltig: Leerstellen gibt es nur am ENDE. Wird
// eine Ziffer geleert, werden alle folgenden mitgeleert - so kann keine
// Flugnummer mit einem Loch in der Mitte entstehen.

#define SLOTS 6          // 2 Buchstaben + 4 Ziffern
#define FIRST_DIGIT 2    // ab hier Ziffern

static Window *s_window;
static Layer *s_canvas;
static char s_buf[SLOTS + 1];
static int s_slot;
static InputDone s_done;

// Zeichenvorrat je Stelle. Die erste Ziffer ist Pflicht, die drei danach
// duerfen leer bleiben - deshalb steht dort zusaetzlich das Leerzeichen.
static char prv_next(int slot, char c, int dir) {
  if (slot < FIRST_DIGIT) {
    // Die ersten beiden Stellen sind das IATA-Kuerzel - und das ist
    // alphanumerisch, nicht bloss Buchstaben: U2 ist easyJet, W6 Wizz Air,
    // 4U war Eurowings. Wer hier nur A-Z anbietet, sperrt diese Gesellschaften
    // komplett aus. Darum A-Z gefolgt von 0-9, 36 Zeichen im Kreis.
    int v;
    if (c >= 'A' && c <= 'Z') v = c - 'A';
    else if (c >= '0' && c <= '9') v = 26 + (c - '0');
    else v = 0;
    v += dir;
    if (v < 0) v = 35;
    if (v > 35) v = 0;
    return (v < 26) ? (char)('A' + v) : (char)('0' + (v - 26));
  }
  const bool blank_ok = (slot > FIRST_DIGIT);
  const int span = blank_ok ? 11 : 10;          // 0..9 und ggf. Leerzeichen
  int v = (c == ' ') ? 10 : (c >= '0' && c <= '9' ? c - '0' : 0);
  v += dir;
  if (v < 0) v = span - 1;
  if (v >= span) v = 0;
  return (v == 10) ? ' ' : (char)('0' + v);
}

// Leerstellen nach hinten durchziehen - fuer die Vorbelegung, die aus einer
// bereits gueltigen Nummer kommt.
static void prv_trim_tail(void) {
  bool blank = false;
  for (int i = FIRST_DIGIT; i < SLOTS; i++) {
    if (s_buf[i] == ' ') blank = true;
    if (blank) s_buf[i] = ' ';
  }
}

// Nach einer Aenderung an Stelle 'changed' die Regel "Leerstellen nur am Ende"
// wiederherstellen - und zwar in die Richtung, in die der Benutzer gerade
// gedrueckt hat:
//
//   geleert   -> alles dahinter faellt mit
//   belegt    -> Luecken davor werden mit 0 geschlossen
//
// Der zweite Fall ist der Grund fuer diese Unterscheidung. Vorher wurde immer
// nur nach hinten geraeumt, und damit waren Hoch und Runter auf jeder Stelle
// hinter einer Luecke tot: die Eingabe wurde im selben Atemzug wieder
// weggeraeumt, den Tastendruck sah man nie.
static void prv_normalise(int changed) {
  if (changed < FIRST_DIGIT) return;
  if (s_buf[changed] == ' ') {
    for (int i = changed; i < SLOTS; i++) s_buf[i] = ' ';
  } else {
    for (int i = FIRST_DIGIT; i < changed; i++) if (s_buf[i] == ' ') s_buf[i] = '0';
  }
}

static void prv_update(Layer *layer, GContext *ctx) {
  const GRect b = layer_get_bounds(layer);
  const int16_t band = FN_BAND_H;

  // Kopfband wie auf den Datenseiten, damit es dieselbe App bleibt
  graphics_context_set_fill_color(ctx, FN_COLOR_ACCENT);
  graphics_fill_rect(ctx, GRect(0, 0, b.size.w, band), 0, GCornerNone);
  graphics_context_set_text_color(ctx, FN_COLOR_ON_ACCENT);
  graphics_draw_text(ctx, S(STR_ENTER_FLIGHT),
                     fonts_get_system_font(PBL_IF_RECT_ELSE(
                       (PBL_DISPLAY_WIDTH >= 180 ? FONT_KEY_GOTHIC_24_BOLD
                                                 : FONT_KEY_GOTHIC_18_BOLD),
                       FONT_KEY_GOTHIC_24_BOLD)),
                     GRect(FN_MARGIN, band / 2 - 16, b.size.w - 2 * FN_MARGIN, band),
                     GTextOverflowModeTrailingEllipsis,
                     PBL_IF_RECT_ELSE(GTextAlignmentLeft, GTextAlignmentCenter), NULL);
  graphics_context_set_fill_color(ctx, FN_COLOR_BG);
  graphics_fill_rect(ctx, GRect(0, band, b.size.w, 2), 0, GCornerNone);

  // Die sechs Stellen, gleichmaessig ueber die Breite
  const int16_t pad = PBL_IF_ROUND_ELSE(34, 6);
  const int16_t sw = (b.size.w - 2 * pad) / SLOTS;
  const int16_t sy = band + (b.size.h - band) / 2 - 26;
  const char *font = (PBL_DISPLAY_WIDTH >= 180) ? FONT_KEY_GOTHIC_28_BOLD
                                                : FONT_KEY_GOTHIC_24_BOLD;
  for (int i = 0; i < SLOTS; i++) {
    const int16_t x = pad + i * sw;
    const bool sel = (i == s_slot);
    if (sel) {
      graphics_context_set_fill_color(ctx, FN_COLOR_ACCENT);
      graphics_fill_rect(ctx, GRect(x, sy, sw - 2, 38), 2, GCornersAll);
    }
    char t[2] = { s_buf[i], '\0' };
    if (t[0] == ' ') t[0] = '\0';
    graphics_context_set_text_color(ctx, sel ? FN_COLOR_ON_ACCENT : FN_COLOR_TEXT);
    graphics_draw_text(ctx, t, fonts_get_system_font(font),
                       GRect(x, sy - 2, sw - 2, 38), GTextOverflowModeTrailingEllipsis,
                       GTextAlignmentCenter, NULL);
    // Grundstrich fuer die leeren Stellen, damit man sieht, dass da etwas hin kann
    if (!sel && s_buf[i] == ' ') {
      graphics_context_set_fill_color(ctx, FN_COLOR_DIM);
      graphics_fill_rect(ctx, GRect(x + 4, sy + 32, sw - 10, 2), 0, GCornerNone);
    }
  }

  // Hinweis unten. Auf dem grossen Schirm eine Stufe groesser - der Text bricht
  // ohnehin auf zwei Zeilen um, und zwischen den Stellen und dem unteren Rand
  // steht Platz dafuer bereit. Auf 144x168 bleibt es bei 14: dort reichen die
  // Stellen fast bis hinunter.
  const bool wide = (PBL_DISPLAY_WIDTH >= 180);
  graphics_context_set_text_color(ctx, FN_COLOR_DIM);
  graphics_draw_text(ctx, S(s_slot == SLOTS - 1 ? STR_INPUT_CONFIRM : STR_INPUT_HINT),
                     fonts_get_system_font(wide ? FONT_KEY_GOTHIC_18
                                                : FONT_KEY_GOTHIC_14),
                     GRect(FN_MARGIN, b.size.h - (wide ? 48 : 40),
                           b.size.w - 2 * FN_MARGIN, wide ? 46 : 36),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

static void prv_up(ClickRecognizerRef rec, void *ctx) {
  s_buf[s_slot] = prv_next(s_slot, s_buf[s_slot], +1);
  prv_normalise(s_slot);
  layer_mark_dirty(s_canvas);
}

static void prv_down(ClickRecognizerRef rec, void *ctx) {
  s_buf[s_slot] = prv_next(s_slot, s_buf[s_slot], -1);
  prv_normalise(s_slot);
  layer_mark_dirty(s_canvas);
}

static void prv_select(ClickRecognizerRef rec, void *ctx) {
  if (s_slot < SLOTS - 1) {
    s_slot++;
    layer_mark_dirty(s_canvas);
    return;
  }
  // Fertig: Leerstellen abschneiden und melden
  char out[SLOTS + 1];
  int n = 0;
  for (int i = 0; i < SLOTS; i++) if (s_buf[i] != ' ') out[n++] = s_buf[i];
  out[n] = '\0';
  InputDone done = s_done;
  window_stack_remove(s_window, true);
  if (done && n >= 3) done(out);   // mindestens zwei Buchstaben und eine Ziffer
}

// Zurueck geht erst eine Stelle zurueck und verlaesst das Fenster erst von der
// ersten Stelle aus - sonst verliert man die halbe Eingabe mit einem Tastendruck.
static void prv_back(ClickRecognizerRef rec, void *ctx) {
  if (s_slot > 0) {
    s_slot--;
    layer_mark_dirty(s_canvas);
    return;
  }
  window_stack_remove(s_window, true);
}

static void prv_click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP, prv_up);
  window_single_click_subscribe(BUTTON_ID_DOWN, prv_down);
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select);
  window_single_click_subscribe(BUTTON_ID_BACK, prv_back);
}

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_canvas = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_canvas, prv_update);
  layer_add_child(root, s_canvas);
}

static void prv_unload(Window *window) {
  layer_destroy(s_canvas);
  s_canvas = NULL;
  window_destroy(s_window);
  s_window = NULL;
}

void input_window_push(const char *preset, InputDone done) {
  if (s_window) return;
  s_done = done;
  s_slot = 0;
  // Vorbelegen: die bisherige Nummer steht schon da, damit ein Wechsel von
  // LH400 auf LH401 nicht bei A beginnt.
  memset(s_buf, ' ', SLOTS);
  s_buf[SLOTS] = '\0';
  s_buf[0] = 'A'; s_buf[1] = 'A'; s_buf[2] = '0';
  if (preset && preset[0]) {
    for (int i = 0; i < SLOTS && preset[i]; i++) s_buf[i] = preset[i];
  }
  prv_trim_tail();

  s_window = window_create();
  window_set_background_color(s_window, FN_COLOR_BG);
  window_set_click_config_provider(s_window, prv_click_config);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_load, .unload = prv_unload,
  });
  window_stack_push(s_window, true);
}
