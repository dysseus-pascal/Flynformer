#include <pebble.h>
#include "phone.h"
#include "strings.h"
#include "strings.h"

// Ein persist-Schluessel je Seite. Fuenf Zeilen sind 140 Byte und bleiben damit
// unter PERSIST_DATA_MAX_LENGTH (256) - ein Schluessel, ein Satz, kein
// Aufteilen. Bei sechs Seiten sind das 840 von rund 4096 Byte.
#define PERSIST_VERSION_KEY 100
#define PERSIST_VERSION     1
#define PERSIST_PAGE_BASE   110   // 110..115
#define PERSIST_FNO_KEY     120

typedef struct { char line[5][FN_LINE_LEN]; } StoredPage;

static FnPage s_page;
static FnPhoneUpdate s_on_update;

const FnPage *phone_page(void) { return &s_page; }

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
  prv_copy(s_page.age, sizeof(s_page.age), dict_find(iter, MESSAGE_KEY_AGE));
  prv_copy(s_page.quota, sizeof(s_page.quota), dict_find(iter, MESSAGE_KEY_QUOTA));
  prv_copy(s_page.fno, sizeof(s_page.fno), dict_find(iter, MESSAGE_KEY_FNO));
  prv_store(s_page.page);
  if (s_on_update) s_on_update();
}

static void prv_dropped(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "AppMessage verworfen: %d", (int)reason);
}

static void prv_send(int page, bool refresh) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
  dict_write_int32(out, MESSAGE_KEY_REQUEST_PAGE, page);
  // Die Telefonseite baut ALLE Anzeigetexte und kann die Uhrsprache nicht von
  // sich aus erfahren (0 = Englisch, 1 = Deutsch).
  dict_write_int32(out, MESSAGE_KEY_LANG, (int32_t)strings_language());
  if (refresh) dict_write_int32(out, MESSAGE_KEY_REFRESH, 1);
  dict_write_end(out);
  app_message_outbox_send();
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
  s_on_update = on_update;
  app_message_register_inbox_received(prv_inbox);
  app_message_register_inbox_dropped(prv_dropped);
  // Kleine Puffer mit Absicht: die Puffer kommen aus dem App-Heap, und auf
  // flint waere ein 8-KB-Posteingang ein Achtel des gesamten Budgets. Fuenf
  // Zeilen zu 28 Byte plus Kleinkram passen bequem in 512.
  app_message_open(512, 128);
}

void phone_deinit(void) {
  app_message_deregister_callbacks();
  s_on_update = NULL;
}
