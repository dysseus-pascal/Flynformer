// Zeigt, was auf der Uhr steht - ohne Emulator, ohne Telefon, ohne Kontingent.
//
//   node tools/pkjs_pages_test.js [fixtures-verzeichnis]
//
// Laedt src/pkjs/index.js in einen Sandkasten mit gestubbtem Pebble,
// localStorage, XMLHttpRequest und navigator, beantwortet jede Netzanfrage aus
// einer gespeicherten Datei und druckt danach alle sechs Seiten so aus, wie sie
// die Uhr bekommen wuerde.
//
// Die Beispieldaten in tools/fixtures/ sind echte Antworten (LH400,
// Frankfurt-New York), einmalig aufgezeichnet. AviationStack kostet damit beim
// Testen NICHTS.
//
// Exitcode 0 = alle Seiten gebaut und keine Zeile zu lang.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const FIX = process.argv[2] || path.join(__dirname, 'fixtures');
const SRC = path.join(__dirname, '..', 'src', 'pkjs', 'index.js');

// Laengstes, was auf flint (144 px) in die Zeile passt - grob geschaetzt ueber
// die Zeichenzahl, nicht pixelgenau. Dient als Warnschwelle.
const MAX_CHARS = 22;

// Welche Datei beantwortet welche URL
function fixtureFor(url) {
  if (url.indexOf('aviationstack') >= 0) return 'lh400.json';
  if (url.indexOf('hexdb.io') >= 0) return 'hex_3C651A.json';
  if (url.indexOf('adsbdb') >= 0) return 'route_LH400.json';
  if (url.indexOf('open-meteo') >= 0) return 'wx_jfk.json';
  return null;
}

const calls = [];
const store = {};
let sent = [];

function XHR() { this.status = 200; }
XHR.prototype.open = function (m, u) { this._u = u; };
XHR.prototype.send = function () {
  const f = fixtureFor(this._u);
  // Der Schluessel darf im Test gar nicht auftauchen
  calls.push(this._u.replace(/access_key=[^&]*/, 'access_key=***'));
  const self = this;
  setTimeout(function () {
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
        () => ok({ coords: { latitude: 47.3769, longitude: 8.5417 } }), 0),  // Zuerich
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
      this.getSettings = () => ({});
    };
  }
  if (id === './config') return require(path.join(__dirname, '..', 'src', 'pkjs', 'config.js'));
  return Module.createRequire(SRC)(id);
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });

function fire(ev, arg) {
  (sandbox.__ev[ev] || []).forEach((fn) => fn(arg));
}

// Einstellungen setzen, wie sie die Konfigseite hinterlassen wuerde. Die
// Flugnummer steht bewusst NICHT darin - die gibt die Uhr mit jeder Anfrage
// mit, seit sie dort eingetippt wird.
store['flynformer_settings'] = JSON.stringify({
  key: 'TESTKEY', units: 'metric',
});

// Was die Uhr mitschickt
const CODE = process.env.FN_CODE || 'LH400';

const PAGE_NAMES = ['Vor dem Flug', 'Im Flug', 'Am Ziel'];
const PHASE_NAMES = ['Geplant', 'Boarding', 'Gestartet', 'Im Flug', 'Landeanflug', 'Angekommen', 'Status'];
let tooLong = 0;

function dump(label) {
  console.log('\n===== ' + label + ' =====');
  sent.forEach((d) => {
    if (d.PAGE === undefined) { console.log('  [nur Status] ' + JSON.stringify(d)); return; }
    console.log('\n  Seite ' + (d.PAGE + 1) + '  ' + PAGE_NAMES[d.PAGE] +
                (d.PAGE === 0 ? '  [' + PHASE_NAMES[d.PHASE] + ' ' + d.PROGRESS + ' %]' : '') +
                '     (' + d.AGE + ', Kontingent ' + d.QUOTA + ')');
    ['L1', 'L2', 'L3', 'L4', 'L5'].forEach((k) => {
      const v = d[k] || '';
      const warn = v.length > MAX_CHARS ? '   <-- ' + v.length + ' Zeichen, auf flint zu lang' : '';
      if (v.length > MAX_CHARS) tooLong++;
      console.log('    | ' + v + warn);
    });
  });
}

// Die Sprache als LANG-Nummer, wie die Uhr sie mitschickt:
// 0 en, 1 de (Vorgabe), 2 fr, 3 it, 4 es.
const LANG_CODES = ['en', 'de', 'fr', 'it', 'es'];
const LANG = Math.max(0, LANG_CODES.indexOf(process.env.FN_LANG || 'de'));
sent = [];
fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: LANG, CODE: CODE } });

setTimeout(function () {
  for (let p = 0; p < 3; p++) fire('appmessage', { payload: { REQUEST_PAGE: p, LANG: LANG, CODE: CODE } });
  setTimeout(function () {
    dump(CODE + ', frisch geladen · ' + LANG_CODES[LANG]);
    console.log('\n===== Netzabrufe =====');
    calls.forEach((u) => console.log('  ' + u));
    const paid = calls.filter((u) => u.indexOf('aviationstack') >= 0).length;
    console.log('\n  davon kostenpflichtig: ' + paid + '  (kostenlos: ' + (calls.length - paid) + ')');
    console.log('\nZu lange Zeilen: ' + tooLong);
    process.exit(tooLong === 0 && paid === 1 ? 0 : 1);
  }, 50);
}, 50);
