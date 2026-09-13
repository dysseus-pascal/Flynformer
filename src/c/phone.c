#include <pebble.h>
#include "phone.h"
#include "strings.h"

// Ein persist-Schluessel je Seite. Fuenf Zeilen sind 140 Byte und bleiben damit
// unter PERSIST_DATA_MAX_LENGTH (256) - ein Schluessel, ein Satz, kein
// Aufteilen. Bei sechs Seiten sind das 840 von rund 4096 Byte.
#define PERSIST_VERSION_KEY 100
#define PERSIST_VERSION     2   // 2: Phase und Fortschritt kamen dazu
#define PERSIST_PAGE_BASE   110   // 110..115
#define PERSIST_FNO_KEY     120
#define PERSIST_CODE_KEY    121

typedef struct {
  char line[5][FN_LINE_LEN];
  int8_t phase;
  int8_t progress;
} StoredPage;

static FnPage s_page;
static FnPhoneUpdate s_on_update;
static char s_code[12];

// Der Postausgang fasst genau EINE Nachricht. Zwei Anfragen kurz nacheinander -
// beim Start der gespeicherte Stand und gleich darauf die Auffrischung, oder
// schnelles Blaettern - und die zweite faellt lautlos unter den Tisch:
// app_message_outbox_begin meldet dann BUSY. Genau die Auffrischung ging so
// verloren, und in der Fusszeile blieb "Lade..." stehen, bis man erneut drueckte.
//
// Deshalb wird der Wunsch gemerkt statt weggeworfen und kurz darauf erneut
// versucht. Gemerkt wird nur der LETZTE Seitenwunsch - wer durch sechs Seiten
// blaettert, will die sechste sehen, nicht die vier dazwischen. Eine gewuenschte
// Auffrischung haftet dagegen, bis sie tatsaechlich hinausgegangen ist.
static bool s_want;
static int  s_want_page;
static bool s_want_refresh;
static bool s_sent_refresh;   // was in der Nachricht stand, die gerade unterwegs ist
static int  s_sent_page;
static AppTimer *s_retry;
static uint8_t s_tries;

// Ohne Grenze liefe der Wiederholer ewig, wenn das Telefon gar nicht da ist -
// achtmal in der Sekunde, bis der Akku leer ist. Nach knapp drei Sekunden ist
// klar, dass es nicht am Postausgang liegt, und die Uhr sagt es.
#define RETRY_MS   120
#define RETRY_MAX  24

const FnPage *phone_page(void) { return &s_page; }

const char *phone_code(void) { return s_code; }

void phone_set_code(const char *code) {
  if (!code) return;
  strncpy(s_code, code, sizeof(s_code) - 1);
  s_code[sizeof(s_code) - 1] = 0;
  persist_write_string(PERSIST_CODE_KEY, s_code);
  // Neue Nummer, alter Stand ist wertlos - sonst zeigte die App die Daten des
  // vorigen Fluges unter der neuen Nummer.
  for (int i = 0; i < FN_PAGE_COUNT; i++) persist_delete(PERSIST_PAGE_BASE + i);
  memset(&s_page, 0, sizeof(s_page));
  strncpy(s_page.fno, s_code, sizeof(s_page.fno) - 1);
}

static void prv_copy(char *dst, size_t size, const Tuple *t) {
  if (!t) return;
  strncpy(dst, t->value->cstring, size);
  dst[size - 1] = '\0';
}

static void prv_store(int page) {
  if (page < 0 || page >= FN_PAGE_COUNT) return;
  StoredPage sp;
  memset(&sp, 0, sizeof(sp));
  for (int i = 0; i < 5; i++) strncpy(sp.line[i], s_page.line[i], FN_LINE_LEN - 1);
  sp.phase = (int8_t)s_page.phase;
  sp.progress = (int8_t)s_page.progress;
  persist_write_data(PERSIST_PAGE_BASE + page, &sp, sizeof(sp));
  persist_write_string(PERSIST_FNO_KEY, s_page.fno);
  persist_write_int(PERSIST_VERSION_KEY, PERSIST_VERSION);
}

// Gespeicherten Stand laden. Liefert false, wenn es keinen gibt - dann bleiben
// die Zeilen leer und das Fenster zeigt "nie geladen".
static bool prv_load(int page) {
  if (page < 0 || page >= FN_PAGE_COUNT) return false;
  if (!persist_exists(PERSIST_VERSION_KEY) ||
      persist_read_int(PERSIST_VERSION_KEY) != PERSIST_VERSION) return false;
  const uint32_t key = PERSIST_PAGE_BASE + page;
  if (!persist_exists(key) || persist_get_size(key) != (int)sizeof(StoredPage)) return false;
  StoredPage sp;
  if (persist_read_data(key, &sp, sizeof(sp)) != (int)sizeof(sp)) return false;
  for (int i = 0; i < 5; i++) {
    strncpy(s_page.line[i], sp.line[i], FN_LINE_LEN - 1);
    s_page.line[i][FN_LINE_LEN - 1] = '\0';
  }
  s_page.phase = sp.phase;
  s_page.progress = sp.progress;
  if (persist_exists(PERSIST_FNO_KEY)) {
    persist_read_string(PERSIST_FNO_KEY, s_page.fno, sizeof(s_page.fno));
    s_page.fno[sizeof(s_page.fno) - 1] = '\0';
  }
  s_page.page = page;
  s_page.fresh = false;
  strncpy(s_page.age, S(STR_STORED), FN_SHORT_LEN - 1);
  s_page.age[FN_SHORT_LEN - 1] = '\0';
  return true;
}

static void prv_inbox(DictionaryIterator *iter, void *context) {
  // Das Telefon schickt zurueck, zu welcher Flugnummer die Antwort gehoert.
  // Weicht sie ab, war die Antwort noch fuer den vorigen Flug gebaut und schon
  // unterwegs, als die Nummer wechselte. Angenommen staenden fremde Zeiten und
  // Gates unter der neuen Nummer - und wuerden auch noch so gespeichert.
  const Tuple *fno = dict_find(iter, MESSAGE_KEY_FNO);
  if (fno && s_code[0] && strcmp(fno->value->cstring, s_code) != 0) return;

  const Tuple *status = dict_find(iter, MESSAGE_KEY_STATUS);
  const Tuple *page = dict_find(iter, MESSAGE_KEY_PAGE);

  if (status && !page) {
    // Reine Fehlermeldung, die Zeilen bleiben stehen
    s_page.status[0] = '\0';
    prv_copy(s_page.status, sizeof(s_page.status), status);
    if (s_on_update) s_on_update();
    return;
  }
  if (!page) return;

  s_page.page = page->value->int32;
  s_page.status[0] = '\0';
  s_page.fresh = true;
  const uint32_t keys[5] = { MESSAGE_KEY_L1, MESSAGE_KEY_L2, MESSAGE_KEY_L3,
                             MESSAGE_KEY_L4, MESSAGE_KEY_L5 };
  for (int i = 0; i < 5; i++) {
    s_page.line[i][0] = '\0';
    prv_copy(s_page.line[i], FN_LINE_LEN, dict_find(iter, keys[i]));
  }
  // Phase und Fortschritt rechnet das Telefon aus - die Uhr kennt weder die
  // Flugzeiten noch die Zeitzonen der beiden Flughaefen.
  const Tuple *ph = dict_find(iter, MESSAGE_KEY_PHASE);
  const Tuple *pr = dict_find(iter, MESSAGE_KEY_PROGRESS);
  s_page.phase = ph ? (int)ph->value->int32 : FN_PHASE_OFF;
  if (s_page.phase < 0 || s_page.phase >= FN_PHASE_COUNT) s_page.phase = FN_PHASE_OFF;
  s_page.progress = pr ? (int)pr->value->int32 : 0;
  if (s_page.progress < 0) s_page.progress = 0;
  if (s_page.progress > 100) s_page.progress = 100;
  prv_copy(s_page.age, sizeof(s_page.age), dict_find(iter, MESSAGE_KEY_AGE));
  prv_copy(s_page.quota, sizeof(s_page.quota), dict_find(iter, MESSAGE_KEY_QUOTA));
  // fno wird NICHT aus der Nachricht uebernommen: die Flugnummer gehoert seit
  // der Eingabe auf der Uhr ihr selbst, und das Kopfband soll immer die zeigen,
  // die gerade gilt.
  prv_store(s_page.page);
  if (s_on_update) s_on_update();
}

static void prv_dropped(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "AppMessage verworfen: %d", (int)reason);
}

static void prv_try_send(void);
static void prv_retry_soon(void);

// Was nicht hinausging, wird wieder zum Wunsch. Ein inzwischen eingetroffener
// neuerer Seitenwunsch hat Vorrang.
//
// keep_refresh entscheidet ueber Geld. Eine Auffrischung darf nur dann erneut
// gesendet werden, wenn feststeht, dass die Nachricht den Postausgang NIE
// verlassen hat. Ist sie einmal draussen, kann sie das Telefon erreicht haben,
// auch wenn die Quittung ausblieb - und der zweite Versuch bezahlte dann einen
// zweiten Abruf vom Monatskontingent.
static void prv_restore_wish(bool keep_refresh) {
  if (!s_want) { s_want = true; s_want_page = s_sent_page; }
  if (keep_refresh && s_sent_refresh) s_want_refresh = true;
  s_sent_refresh = false;
  prv_retry_soon();
}

static void prv_give_up(void) {
  s_want = false;
  s_want_refresh = false;
  strncpy(s_page.status, S(STR_NO_PHONE), sizeof(s_page.status) - 1);
  s_page.status[sizeof(s_page.status) - 1] = 0;
  if (s_on_update) s_on_update();
}

static void prv_timer_cb(void *data) {
  s_retry = NULL;              // dieser Zeitgeber ist gerade abgelaufen
  prv_try_send();
}

static void prv_retry_soon(void) {
  if (s_retry) return;
  if (++s_tries > RETRY_MAX) { prv_give_up(); return; }
  s_retry = app_timer_register(RETRY_MS, prv_timer_cb, NULL);
}

static void prv_try_send(void) {
  // Ruft prv_send direkt hierher, waehrend noch ein Zeitgeber laeuft, dann darf
  // dessen Kennung nicht einfach vergessen werden: er bliebe registriert, ohne
  // dass ihn noch jemand abbrechen koennte. Die Sperre in prv_retry_soon griffe
  // nicht mehr, zwei Wiederholketten liefen nebeneinander, s_tries braeuchte
  // sich doppelt so schnell auf - und phone_deinit koennte nur eine abbrechen.
  if (s_retry) { app_timer_cancel(s_retry); s_retry = NULL; }
  if (!s_want) return;
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) { prv_retry_soon(); return; }
  dict_write_int32(out, MESSAGE_KEY_REQUEST_PAGE, s_want_page);
  // Die Telefonseite baut ALLE Anzeigetexte und kann die Uhrsprache nicht von
  // sich aus erfahren (0 = Englisch, 1 = Deutsch).
  dict_write_int32(out, MESSAGE_KEY_LANG, (int32_t)strings_language());
  if (s_code[0]) dict_write_cstring(out, MESSAGE_KEY_CODE, s_code);
  if (s_want_refresh) dict_write_int32(out, MESSAGE_KEY_REFRESH, 1);
  dict_write_end(out);
  // Der Wunsch gilt als abgegeben, sobald er den Postausgang erreicht hat, und
  // wird dabei beiseitegelegt. Was danach hereinkommt, ist ein NEUER Wunsch -
  // wuerde stattdessen die Quittung "den Wunsch" loeschen, loeschte die Quittung
  // der ersten Nachricht die zweite, die noch gar nicht raus ist. Genau daran
  // blieb die Auffrischung beim Start haengen.
  s_sent_page = s_want_page;
  s_sent_refresh = s_want_refresh;
  s_want = false;
  s_want_refresh = false;
  // Hier meldet die Uhr selbst, dass nichts hinausging - die Nachricht hat den
  // Postausgang nie verlassen, ein erneuter Versuch kostet also nichts.
  if (app_message_outbox_send() != APP_MSG_OK) prv_restore_wish(true);
}

// Quittung: nichts zu tun. Kam zwischenzeitlich ein neuer Wunsch, wartet er
// schon mit seinem Zeitgeber.
static void prv_sent(DictionaryIterator *it, void *context) {
  if (s_want) prv_retry_soon();
}

// Hier ist die Nachricht bereits hinausgegangen und nur die Quittung blieb aus.
// APP_MSG_SEND_TIMEOUT heisst genau das: keine Bestaetigung - NICHT, dass das
// Telefon nichts bekommen hat. Eine Auffrischung wird darum nie wiederholt.
// Lieber einmal zu wenig geholt als einmal zu viel bezahlt; die Uhr sagt es,
// und ein Druck auf Mitte holt die Daten bewusst noch einmal.
static void prv_send_failed(DictionaryIterator *it, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Senden fehlgeschlagen: %d", (int)reason);
  const bool lost_refresh = s_sent_refresh;
  prv_restore_wish(false);
  if (lost_refresh) {
    strncpy(s_page.status, S(STR_NO_PHONE), sizeof(s_page.status) - 1);
    s_page.status[sizeof(s_page.status) - 1] = 0;
    if (s_on_update) s_on_update();
  }
}

static void prv_send(int page, bool refresh) {
  s_want = true;
  s_want_page = page;
  if (refresh) s_want_refresh = true;
  s_tries = 0;          // ein neuer Wunsch hat wieder alle Versuche frei
  prv_try_send();
}

void phone_request_page(int page) {
  // Erst den gespeicherten Stand zeigen, dann nachfragen: so steht sofort
  // etwas da, auch wenn das Telefon nicht antwortet.
  if (!prv_load(page)) {
    for (int i = 0; i < 5; i++) s_page.line[i][0] = '\0';
    s_page.page = page;
    s_page.fresh = false;
    strncpy(s_page.age, S(STR_NEVER), FN_SHORT_LEN - 1);
    s_page.age[FN_SHORT_LEN - 1] = '\0';
  }
  if (s_on_update) s_on_update();
  prv_send(page, false);
}

void phone_refresh(int page) {
  strncpy(s_page.status, S(STR_LOADING), sizeof(s_page.status) - 1);
  s_page.status[sizeof(s_page.status) - 1] = '\0';
  if (s_on_update) s_on_update();
  prv_send(page, true);
}

void phone_init(FnPhoneUpdate on_update) {
  memset(&s_page, 0, sizeof(s_page));
  s_code[0] = 0;
  if (persist_exists(PERSIST_CODE_KEY)) {
    persist_read_string(PERSIST_CODE_KEY, s_code, sizeof(s_code));
    s_code[sizeof(s_code) - 1] = 0;
    strncpy(s_page.fno, s_code, sizeof(s_page.fno) - 1);
  }
  s_on_update = on_update;
  s_want = false;
  s_want_refresh = false;
  s_sent_refresh = false;
  s_tries = 0;
  app_message_register_inbox_received(prv_inbox);
  app_message_register_inbox_dropped(prv_dropped);
  app_message_register_outbox_sent(prv_sent);
  app_message_register_outbox_failed(prv_send_failed);
  // Kleine Puffer mit Absicht: die Puffer kommen aus dem App-Heap, und auf
  // flint waere ein 8-KB-Posteingang ein Achtel des gesamten Budgets. Fuenf
  // Zeilen zu 28 Byte plus Kleinkram passen bequem in 512.
  app_message_open(512, 128);
}

void phone_deinit(void) {
  if (s_retry) { app_timer_cancel(s_retry); s_retry = NULL; }
  s_want = false;
  app_message_deregister_callbacks();
  s_on_update = NULL;
}
