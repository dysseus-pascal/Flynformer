// Der Statusschirm in allen Flugphasen.
//
//   node tools/pkjs_phase_test.js
//
// Die Festdaten zeigen einen einzigen Augenblick eines Fluges. Der Statusschirm
// muss aber in jeder Phase stimmen, und die Phasen haengen an der UHRZEIT. Also
// wird hier die Uhr verstellt statt der Flug: dieselbe aviationstack-Antwort,
// einmal vier Stunden vor dem Abflug, einmal am Gate, einmal in der Luft, einmal
// im Anflug, einmal nach der Landung.
//
// Geprueft wird dreierlei:
//   - die Phase stimmt fuer den jeweiligen Zeitpunkt,
//   - der Fortschritt ist nur unterwegs von Null verschieden und waechst,
//   - keine Zeile ist zu lang, und die grosse Zeile (L2) ist nie leer.
//
// Exitcode 0 = alle Phasen wie erwartet.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const FIX = path.join(__dirname, 'fixtures');
const SRC = path.join(__dirname, '..', 'src', 'pkjs', 'index.js');
const MAX_CHARS = 22;          // was auf flint (144 px) in eine Zeile passt

function fixtureFor(url) {
  if (url.indexOf('aviationstack') >= 0) return 'lh400.json';
  if (url.indexOf('adsbdb') >= 0) return 'route_LH400.json';
  if (url.indexOf('open-meteo') >= 0) return 'wx_jfk.json';
  return null;
}

// Die Abflug- und Ankunftszeit aus den Festdaten, als echte UTC-Zeitpunkte.
// Dieselbe Rechnung wie utcOf in index.js: die Zeitstempel sehen aus wie UTC,
// sind aber Ortszeiten, und die echten Versaetze stehen im Wetterabruf.
const av = JSON.parse(fs.readFileSync(path.join(FIX, 'lh400.json'), 'utf8')).data[0];
const wx = JSON.parse(fs.readFileSync(path.join(FIX, 'wx_jfk.json'), 'utf8'));
const offs = (Array.isArray(wx) ? wx : [wx]).map((w) => Math.round((w.utc_offset_seconds || 0) / 60));
const oOff = offs[0] || 0, dOff = offs[1] || 0;
const DEP = Date.parse(av.departure.scheduled) - oOff * 60000;
const ARR = Date.parse(av.arrival.scheduled) - dOff * 60000;
const MIN = 60000;

const PHASES = ['Geplant', 'Boarding', 'Gestartet', 'Im Flug', 'Landeanflug', 'Angekommen', 'Aus'];

// Zeitpunkt, erwartete Phase, erwarteter Fortschritt (null = egal)
const CASES = [
  { name: 'vier Stunden vor dem Abflug', at: DEP - 240 * MIN, phase: 0 },
  { name: 'eine halbe Stunde vor dem Abflug', at: DEP - 30 * MIN, phase: 1 },
  { name: 'zehn Minuten nach dem Abflug', at: DEP + 10 * MIN, phase: 2 },
  { name: 'auf halber Strecke', at: (DEP + ARR) / 2, phase: 3, prog: 50 },
  { name: 'kurz vor der Ankunft', at: ARR - 15 * MIN, phase: 4 },
  { name: 'nach der Landung', at: ARR + 20 * MIN, phase: 5, prog: 100 },
];

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok    ' : '  FEHLER ') + name + (ok ? '' : '   -> ' + detail));
  if (!ok) fails++;
}

// Eine Runde: index.js frisch in einen Sandkasten laden, die Uhr auf 'now'
// stellen und eine Auffrischung samt Seitenabruf durchspielen.
function run(now, lang, cb) {
  const store = {};
  const sent = [];
  function XHR() { this.status = 200; }
  XHR.prototype.open = function (m, u) { this._u = u; };
  XHR.prototype.send = function () {
    const f = fixtureFor(this._u);
    const self = this;
    setTimeout(function () {
      if (!f) { self.status = 404; self.responseText = '{}'; self.onload && self.onload.call(self); return; }
      self.status = 200;
      self.responseText = fs.readFileSync(path.join(FIX, f), 'utf8');
      self.onload && self.onload.call(self);
    }, 0);
  };

  // Eine Date-Klasse, deren "jetzt" wir bestimmen. Alles andere bleibt echt,
  // damit Date.parse und die Formatierung unveraendert arbeiten.
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }

  const sandbox = {
    console: { log: () => {} },
    Date: FakeDate, Math, JSON, parseInt, parseFloat, isNaN,
    encodeURIComponent, String, Number, setTimeout, clearTimeout,
    XMLHttpRequest: XHR,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    navigator: { geolocation: { getCurrentPosition: (ok) =>
      setTimeout(() => ok({ coords: { latitude: 47.3769, longitude: 8.5417 } }), 0) } },
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
      return function Clay() { this.generateUrl = () => 'about:blank'; this.getSettings = () => ({}); };
    }
    if (id === './config') return require(path.join(__dirname, '..', 'src', 'pkjs', 'config.js'));
    return Module.createRequire(SRC)(id);
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });

  store['flynformer_settings'] = JSON.stringify({ key: 'TESTKEY', units: 'metric' });
  const fire = (ev, arg) => (sandbox.__ev[ev] || []).forEach((fn) => fn(arg));
  fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: lang, CODE: 'LH400' } });
  setTimeout(() => cb(sent.filter((d) => d.PAGE === 0).pop()), 80);
}

(function next(i) {
  if (i >= CASES.length) {
    // Zum Schluss englisch gegenlesen: die Phase darf nicht an der Sprache haengen.
    run(CASES[3].at, 0, function (d) {
      check('Phase ist sprachunabhaengig (englisch, halbe Strecke)',
            d && d.PHASE === 3, d ? 'PHASE=' + d.PHASE : 'keine Seite');
      console.log('\n    englisch, halbe Strecke:');
      ['L1', 'L2', 'L3', 'L4', 'L5'].forEach((k) => { if (d && d[k]) console.log('      | ' + d[k]); });
      console.log('\nFehler: ' + fails + '\n');
      process.exit(fails === 0 ? 0 : 1);
    });
    return;
  }
  const c = CASES[i];
  run(c.at, 1, function (d) {
    if (!d) { check(c.name, false, 'keine Statusseite gesendet'); next(i + 1); return; }
    const got = PHASES[d.PHASE] || ('?' + d.PHASE);
    check(c.name + ' -> ' + got, d.PHASE === c.phase,
          'erwartet ' + PHASES[c.phase] + ', war ' + got);
    if (c.prog != null) {
      check('   Fortschritt ' + d.PROGRESS + ' %', Math.abs(d.PROGRESS - c.prog) <= 2,
            'erwartet rund ' + c.prog + ' %, war ' + d.PROGRESS);
    }
    // Vor dem Abflug gibt es keinen Fortschritt. Ab dem Start schon - auch in
    // der Start- und Anflugphase ist der Flug ja unterwegs; die Uhr ZEICHNET den
    // Balken aber nur im Reiseflug (siehe show_bar in flight_window.c).
    if (d.PHASE === 0 || d.PHASE === 1 || d.PHASE === 6) {
      check('   kein Fortschritt vor dem Abflug', !d.PROGRESS, 'PROGRESS=' + d.PROGRESS);
    }
    check('   grosse Zeile gefuellt', !!(d.L2 && d.L2.trim()), 'L2 ist leer');
    const long = ['L1', 'L2', 'L3', 'L4', 'L5'].filter((k) => (d[k] || '').length > MAX_CHARS);
    check('   keine zu lange Zeile', long.length === 0,
          long.map((k) => k + '=' + d[k]).join(', '));
    ['L1', 'L2', 'L3', 'L4', 'L5'].forEach((k) => { if (d[k]) console.log('      | ' + d[k]); });
    next(i + 1);
  });
})(0);
