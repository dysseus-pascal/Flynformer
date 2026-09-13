#include <pebble.h>
#include "flight_window.h"
#include "theme.h"
#include "phone.h"
#include "plane_fx.h"
#include "strings.h"

// Die sechs Seiten im Timeline-Look: Kopfband in Amber mit Flugnummer und
// Seitenname, schwarze 2-px-Linie, Karte mit fuenf Zeilen, Seitenleiste rechts
// mit sechs Marken. Fusszeile traegt Alter und Kontingent.
//
// Beim Start fliegt einmal das Flugzeug an (plane_fx). Solange das laeuft, ist
// die Seite ausgeblendet; danach steht sie da. Beim Aktualisieren laeuft der
// Anflug bewusst NICHT - dreimal am Tag ist er Freude, bei jedem Tastendruck
// Ballast.

static Window *s_window;
static Layer *s_canvas;
static int s_page;
static bool s_intro;      // Anflug laeuft gerade

static StringId prv_page_name(int page) {
  switch (page) {
    case 0: return STR_PAGE_OVERVIEW;
    case 1: return STR_PAGE_TIMES;
    case 2: return STR_PAGE_GATE;
    case 3: return STR_PAGE_AIRCRAFT;
    case 4: return STR_PAGE_ROUTE;
    default: return STR_PAGE_DEST;
  }
}

// Schriften je Plattform. flint ist schmal, dort eine Stufe kleiner.
#if PBL_DISPLAY_WIDTH >= 180
  #define F_FNO   FONT_KEY_GOTHIC_24_BOLD
  #define F_SUB   FONT_KEY_GOTHIC_18
  #define F_LINE  FONT_KEY_GOTHIC_18
  #define F_FOOT  FONT_KEY_GOTHIC_14
  #define LINE_H  25
  #define BIG_H   34
#else
  #define F_FNO   FONT_KEY_GOTHIC_18_BOLD
  #define F_SUB   FONT_KEY_GOTHIC_14
  #define F_LINE  FONT_KEY_GOTHIC_14
  #define F_FOOT  FONT_KEY_GOTHIC_14
  #define LINE_H  20
  #define BIG_H   28
#endif

static void prv_text(GContext *ctx, const char *s, const char *font,
                     GRect box, GTextAlignment align) {
  if (!s || !s[0]) return;
  graphics_draw_text(ctx, s, fonts_get_system_font(font), box,
                     GTextOverflowModeTrailingEllipsis, align, NULL);
}

static void prv_update(Layer *layer, GContext *ctx) {
  const GRect b = layer_get_bounds(layer);

  // Waehrend des Anflugs nur das Flugzeug auf leerem Grund
  if (s_intro && plane_fx_is_playing()) {
    plane_fx_draw_frame(ctx, b);
    return;
  }

  const FnPage *p = phone_page();
  const int16_t side = FN_SIDE_W;
  const int16_t band = FN_BAND_H;
  const int16_t m = FN_MARGIN;
  const int16_t cw = b.size.w - side;              // Inhaltsbreite
  const GTextAlignment al = PBL_IF_RECT_ELSE(GTextAlignmentLeft, GTextAlignmentCenter);

  // Kopfband
  graphics_context_set_fill_color(ctx, FN_COLOR_ACCENT);
  graphics_fill_rect(ctx, GRect(0, 0, b.size.w, band), 0, GCornerNone);
  graphics_context_set_text_color(ctx, FN_COLOR_ON_ACCENT);
  prv_text(ctx, p->fno[0] ? p->fno : S(STR_NO_FLIGHT), F_FNO,
           GRect(m, 2, b.size.w - m - 4, band / 2 + 6), al);
  prv_text(ctx, S(prv_page_name(s_page)), F_SUB,
           GRect(m, band / 2 + 2, b.size.w - m - 4, band / 2), al);

  // Schwarze Trennlinie wie im Timeline-Pin
  graphics_context_set_fill_color(ctx, FN_COLOR_BG);
  graphics_fill_rect(ctx, GRect(0, band, b.size.w, 2), 0, GCornerNone);

  // Seitenleiste mit sechs Marken
  graphics_context_set_fill_color(ctx, FN_COLOR_ACCENT);
  graphics_fill_rect(ctx, GRect(b.size.w - side, band + 2, side, b.size.h - band - 2),
                     0, GCornerNone);
  const int16_t dcx = b.size.w - side / 2;
  const int16_t dtop = band + 2 + (b.size.h - band - 2) / 2 - (FN_PAGE_COUNT * 11) / 2;
  for (int i = 0; i < FN_PAGE_COUNT; i++) {
    const bool on = (i == s_page);
    graphics_context_set_fill_color(ctx, on ? FN_COLOR_ON_ACCENT : FN_COLOR_BG);
    graphics_fill_circle(ctx, GPoint(dcx, dtop + i * 11 + 5), on ? 4 : 2);
  }

  // Karte
  int16_t y = band + 6;
  graphics_context_set_text_color(ctx, FN_COLOR_TEXT);
  for (int i = 0; i < 5; i++) {
    if (!p->line[i][0]) { y += LINE_H; continue; }
    // Zeile 2 auf der Uebersicht ist der Countdown und wird gross gesetzt.
    const bool big = (s_page == 0 && i == 1);
    if (big) graphics_context_set_text_color(ctx, FN_COLOR_ACCENT);
    prv_text(ctx, p->line[i], big ? FONT_KEY_GOTHIC_28_BOLD : F_LINE,
             GRect(m, y, cw - m - 4, big ? BIG_H + 6 : LINE_H + 4), al);
    if (big) graphics_context_set_text_color(ctx, FN_COLOR_TEXT);
    y += big ? BIG_H : LINE_H;
  }

  // Fusszeile: Alter links, Kontingent rechts. Ein Fehler verdraengt beides.
  graphics_context_set_text_color(ctx, FN_COLOR_DIM);
  const int16_t fy = b.size.h - 17;
  if (p->status[0]) {
    prv_text(ctx, p->status, F_FOOT, GRect(m, fy, cw - m - 4, 16), al);
  } else {
    prv_text(ctx, p->age, F_FOOT, GRect(m, fy, cw - m - 4, 16), GTextAlignmentLeft);
    prv_text(ctx, p->quota, F_FOOT, GRect(m, fy, cw - m - 4, 16), GTextAlignmentRight);
  }
}

static void prv_goto(int page) {
  if (page < 0) page = FN_PAGE_COUNT - 1;
  if (page >= FN_PAGE_COUNT) page = 0;
  s_page = page;
  phone_request_page(s_page);
}

static void prv_up(ClickRecognizerRef rec, void *ctx) { prv_goto(s_page - 1); }
static void prv_down(ClickRecognizerRef rec, void *ctx) { prv_goto(s_page + 1); }

// Mitte holt frische Daten - das ist die einzige Stelle, die beim Anbieter
// eine Abfrage kostet, deshalb passiert es nur auf ausdruecklichen Wunsch.
static void prv_select(ClickRecognizerRef rec, void *ctx) {
  vibes_short_pulse();
  phone_refresh(s_page);
}

static void prv_click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP, prv_up);
  window_single_click_subscribe(BUTTON_ID_DOWN, prv_down);
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select);
}

static void prv_on_update(void) {
  if (s_canvas) layer_mark_dirty(s_canvas);
}

static void prv_intro_done(void) {
  s_intro = false;
  if (s_canvas) layer_mark_dirty(s_canvas);
}

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_canvas = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_canvas, prv_update);
  layer_add_child(root, s_canvas);

  phone_init(prv_on_update);
  s_page = 0;
  phone_request_page(0);

  s_intro = true;
  plane_fx_play(s_canvas, prv_intro_done);
}

static void prv_unload(Window *window) {
  plane_fx_stop();
  phone_deinit();
  layer_destroy(s_canvas);
  s_canvas = NULL;
  window_destroy(s_window);
  s_window = NULL;
}

void flight_window_push(void) {
  if (s_window) return;
  s_window = window_create();
  window_set_background_color(s_window, FN_COLOR_BG);
  window_set_click_config_provider(s_window, prv_click_config);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_load, .unload = prv_unload,
  });
  window_stack_push(s_window, true);
}
