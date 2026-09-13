// Was kostet was? Der Test, der das Monatskontingent bewacht.
//
//   node tools/pkjs_quota_test.js
//
// Flugdaten kosten Geld: 100 Abfragen im Monat im kostenlosen Tarif. Genau
// deshalb ist jede Stelle, an der eine bezahlte Abfrage entstehen kann, hier
// festgenagelt. Drei Fehler, die ohne diesen Test unbemerkt blieben, haben ihn
// veranlasst:
//
//   - Der App-Start holte frische Daten und kostete damit bei JEDEM Oeffnen
//     eine Abfrage. Viermal am Tag hinsehen = 120 im Monat bei 100 erlaubten.
//   - Eine wiederholte Sendung der Uhr loeste eine ZWEITE bezahlte Abfrage aus,
//     weil die Telefonseite nicht erkennen kann, dass es dieselbe Bitte ist.
//   - Der Ruecksetz-Schalter nullte den Zaehler bei jedem spaeteren Speichern
//     erneut, sodass die Fusszeile 0 von 100 zeigte, waehrend fast nichts uebrig war.
//
// Exitcode 0 = alle Zusagen gehalten.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const FIX = path.join(__dirname, 'fixtures');
const SRC = process.env.FN_SRC || path.join(__dirname, '..', 'src', 'pkjs', 'index.js');

function fixtureFor(url) {
  if (url.indexOf('aviationstack') >= 0) return 'lh400.json';
  if (url.indexOf('hexdb.io') >= 0) return 'hex_3C651A.json';
  if (url.indexOf('adsbdb') >= 0) return 'route_LH400.json';
  if (url.indexOf('open-meteo') >= 0) return 'wx_jfk.json';
  return null;
}

let calls = [];
let sent = [];
let failPaid = false;      // laesst den aviationstack-Abruf scheitern
const store = {};
let clayDict = {};

function XHR() { this.status = 200; }
XHR.prototype.open = function (m, u) { this._u = u; };
XHR.prototype.send = function () {
  const f = fixtureFor(this._u);
  calls.push(this._u.replace(/access_key=[^&]*/, 'access_key=***'));
  const self = this;
  setTimeout(function () {
    if (failPaid && self._u.indexOf('aviationstack') >= 0) {
      self.status = 500; self.responseText = 'boom';
      self.onload && self.onload.call(self);
      return;
    }
    if (!f) { self.status = 404; self.responseText = '{}'; self.onload && self.onload.call(self); return; }
    self.status = 200;
    self.responseText = fs.readFileSync(path.join(FIX, f), 'utf8');
    self.onload && self.onload.call(self);
  }, 0);
};

const sandbox = {
  console: { log: () => {} },
  Date, Math, JSON, parseInt, parseFloat, isNaN, encodeURIComponent, String, Number,
  setTimeout, clearTimeout,
  XMLHttpRequest: XHR,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  navigator: {
    geolocation: {
      getCurrentPosition: (ok) => setTimeout(
        () => ok({ coords: { latitude: 47.3769, longitude: 8.5417 } }), 0),
    },
  },
  Pebble: {
    addEventListener: (ev, fn) => { (sandbox.__ev[ev] = sandbox.__ev[ev] || []).push(fn); },
    sendAppMessage: (d) => { sent.push(d); },
    openURL: () => {},
  },
  __ev: {},
};
sandbox.module = { exports: {} };
sandbox.require = function (id) {
  if (id === '@rebble/clay') {
    return function Clay() {
      this.generateUrl = () => 'about:blank';
      // Gibt zurueck, was der Test gerade als Formulareingabe gesetzt hat
      this.getSettings = () => clayDict;
    };
  }
  if (id === './config') return require(path.join(__dirname, '..', 'src', 'pkjs', 'config.js'));
  return Module.createRequire(SRC)(id);
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });

const fire = (ev, arg) => (sandbox.__ev[ev] || []).forEach((fn) => fn(arg));
const paid = () => calls.filter((u) => u.indexOf('aviationstack') >= 0).length;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

store['flynformer_settings'] = JSON.stringify({ key: 'TESTKEY', units: 'metric' });

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FEHLER ') + name + (ok ? '' : '   -> ' + detail));
  if (!ok) fails++;
}

(async function () {
  console.log('\n=== Was kostet was ===\n');

  // 1. App-Start: nur den gespeicherten Stand abrufen, ohne REFRESH.
  //    Das ist, was flight_window.c prv_load seit v0.2.1 schickt.
  calls = []; sent = [];
  fire('appmessage', { payload: { REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(60);
  check('App-Start kostet nichts', paid() === 0, paid() + ' bezahlte Abrufe statt 0');
  check('App-Start liefert trotzdem eine Seite', sent.length > 0, 'keine Seite gesendet');

  // 2. Mitteltaste: genau eine bezahlte Abfrage, nicht mehr.
  calls = []; sent = [];
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  check('Mitteltaste kostet genau eine Abfrage', paid() === 1, paid() + ' statt 1');

  // 3. Jede Seite danach ist kostenlos - eine Antwort traegt alle sechs.
  calls = []; sent = [];
  for (let p = 0; p < 5; p++) fire('appmessage', { payload: { REQUEST_PAGE: p, LANG: 1, CODE: 'LH400' } });
  await wait(60);
  check('Blaettern kostet nichts', paid() === 0, paid() + ' bezahlte Abrufe beim Blaettern');

  // 4. Jede Antwort sagt, zu welchem Flug sie gehoert. Darauf stuetzt sich die
  //    Uhr, um eine verspaetete Antwort des vorigen Fluges wegzuwerfen.
  const pages = sent.filter((d) => d.PAGE !== undefined);
  check('Jede Seite traegt ihre Flugnummer',
        pages.length === 5 && pages.every((d) => d.FNO === 'LH400'),
        'FNO fehlt oder falsch: ' + JSON.stringify(pages.map((d) => d.FNO)));

  // 5. Eine WIEDERHOLTE Bitte kostet ein zweites Mal. Die Telefonseite kann
  //    nicht erkennen, dass es dieselbe war - genau deshalb darf die Uhr eine
  //    Auffrischung niemals erneut senden, sobald sie den Postausgang verliess.
  calls = [];
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  check('Zweite Bitte kostet wirklich erneut (Begruendung fuer die Regel auf der Uhr)',
        paid() === 1, 'erwartet 1 pro Bitte, war ' + paid());

  // 5b. Ein GESCHEITERTER Abruf kostet trotzdem. aviationstack rechnet ab,
  //     sobald die Anfrage ankommt - ein 500er, eine Zeitueberschreitung oder
  //     kaputtes JSON aendern daran nichts. Wer nur Erfolge zaehlt, meldet zu
  //     wenig, und die Sperre bei 100 greift nie.
  const beforeFail = JSON.parse(store['flynformer_quota']).used;
  failPaid = true;
  calls = [];
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  const afterFail = JSON.parse(store['flynformer_quota']).used;
  failPaid = false;
  check('Gescheiterter Abruf wird trotzdem gezaehlt',
        paid() === 1 && afterFail === beforeFail + 1,
        'Anfragen ' + paid() + ', Zaehler ' + beforeFail + ' -> ' + afterFail);

  // 6. Der Ruecksetz-Schalter wirkt beim Umlegen, nicht bei jedem Speichern.
  const usedNow = JSON.parse(store['flynformer_quota']).used;
  check('Zaehler hat mitgezaehlt', usedNow >= 2, 'used = ' + usedNow);

  clayDict = { API_KEY: { value: 'TESTKEY' }, UNITS: { value: 'metric' },
               QUOTA_RESET: { value: true } };
  fire('webviewclosed', { response: '{}' });
  check('Umlegen setzt den Zaehler zurueck',
        JSON.parse(store['flynformer_quota']).used === 0,
        'used = ' + JSON.parse(store['flynformer_quota']).used);

  // Erneut Abrufe verbrauchen, dann nur den Schluessel speichern - der Schalter
  // steht in Clays wiederhergestelltem Formular weiterhin auf ein.
  calls = [];
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  const before = JSON.parse(store['flynformer_quota']).used;
  clayDict = { API_KEY: { value: 'ANDERER' }, UNITS: { value: 'metric' },
               QUOTA_RESET: { value: true } };
  fire('webviewclosed', { response: '{}' });
  const after = JSON.parse(store['flynformer_quota']).used;
  check('Spaeteres Speichern nullt den Zaehler NICHT noch einmal',
        after === before && before > 0,
        'vorher ' + before + ', nachher ' + after);

  // 7. Eine unvollstaendige Antwort der Konfigseite - etwa eine abgebrochene -
  //    enthaelt den Schalter gar nicht. Sie darf die gemerkte Stellung NICHT
  //    loeschen, sonst nullt das naechste gewoehnliche Speichern den Zaehler
  //    wieder, und die Flanke haette nichts gebracht.
  calls = [];
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  const beforePartial = JSON.parse(store['flynformer_quota']).used;
  clayDict = { API_KEY: { value: 'TESTKEY' } };          // ohne QUOTA_RESET
  fire('webviewclosed', { response: '{}' });
  clayDict = { API_KEY: { value: 'TESTKEY' }, UNITS: { value: 'metric' },
               QUOTA_RESET: { value: true } };
  fire('webviewclosed', { response: '{}' });
  const afterPartial = JSON.parse(store['flynformer_quota']).used;
  check('Unvollstaendige Einstellungen entwaffnen die Flanke nicht',
        afterPartial === beforePartial && beforePartial > 0,
        'vorher ' + beforePartial + ', nachher ' + afterPartial);

  console.log('\nFehler: ' + fails + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
