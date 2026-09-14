// Timeline-Pins, Aenderungsmeldungen und Weckplan.
//
//   node tools/pkjs_alert_test.js
//
// Drei Dinge haengen hier zusammen, und alle drei kosten etwas, wenn sie falsch
// sind:
//
//   - Der WECKPLAN bestimmt, wie oft die Uhr aufwacht. Jedes Aufwachen startet
//     die App im Vordergrund und kostet eine der 100 Monatsabfragen.
//   - Die AENDERUNGSERKENNUNG entscheidet, wann der Traeger gestoert wird. Wer
//     Countdowns mitvergleicht, meldet bei jedem Abruf etwas und wird ignoriert.
//   - Der PIN traegt die Erinnerungen, die ohne laufende App vibrieren. Ein Pin,
//     der bei jeder Auffrischung erneut hinausgeht, meldet jedes Mal eine
//     Aenderung, die keine ist.
//
// Exitcode 0 = alles wie zugesagt.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const FIX = path.join(__dirname, 'fixtures');
const SRC = process.env.FN_SRC || path.join(__dirname, '..', 'src', 'pkjs', 'index.js');
const MIN = 60000;

const base = JSON.parse(fs.readFileSync(path.join(FIX, 'lh400.json'), 'utf8'));
const wx = JSON.parse(fs.readFileSync(path.join(FIX, 'wx_jfk.json'), 'utf8'));
const offs = (Array.isArray(wx) ? wx : [wx]).map((w) => Math.round((w.utc_offset_seconds || 0) / 60));
const oOff = offs[0] || 0, dOff = offs[1] || 0;
const av0 = base.data[0];
const DEP = Date.parse(av0.departure.scheduled) - oOff * MIN;
const ARR = Date.parse(av0.arrival.scheduled) - dOff * MIN;

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok    ' : '  FEHLER ') + name + (ok ? '' : '   -> ' + detail));
  if (!ok) fails++;
}

// Eine Welt: index.js frisch geladen, Uhr auf 'now' gestellt, aviationstack
// liefert 'av'. Timeline-PUTs werden abgefangen statt gesendet.
function world(now, av) {
  const store = {};
  const sent = [];
  const pins = [];
  const calls = [];

  function XHR() { this.status = 200; }
  XHR.prototype.open = function (m, u) { this._m = m; this._u = u; };
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.send = function (bodyText) {
    calls.push(this._u);
    const self = this;
    if (this._u.indexOf('timeline-api') >= 0) {
      pins.push({ method: this._m, id: this._u.split('/').pop(), body: JSON.parse(bodyText) });
      setTimeout(function () { self.status = 200; self.responseText = '{}'; self.onload && self.onload.call(self); }, 0);
      return;
    }
    let file = null;
    if (this._u.indexOf('aviationstack') >= 0) file = 'AV';
    else if (this._u.indexOf('adsbdb') >= 0) file = 'route_LH400.json';
    else if (this._u.indexOf('open-meteo') >= 0) file = 'wx_jfk.json';
    setTimeout(function () {
      if (!file) { self.status = 404; self.responseText = '{}'; self.onload && self.onload.call(self); return; }
      self.status = 200;
      self.responseText = (file === 'AV')
        ? JSON.stringify({ data: [av] })
        : fs.readFileSync(path.join(FIX, file), 'utf8');
      self.onload && self.onload.call(self);
    }, 0);
  };

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
      getTimelineToken: (ok) => setTimeout(() => ok('TESTTOKEN'), 0),
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

  return {
    store: store, sent: sent, pins: pins, calls: calls,
    fire: (ev, arg) => (sandbox.__ev[ev] || []).forEach((fn) => fn(arg)),
    page0: () => sent.filter((d) => d.PAGE === 0).pop(),
    paid: () => calls.filter((u) => u.indexOf('aviationstack') >= 0).length,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function clone(o) { return JSON.parse(JSON.stringify(o)); }

(async function () {
  console.log('\n=== Weckplan ===\n');

  // Der Plan: mehr als 3 h vorher gar nicht, dann stuendlich, in der letzten
  // Stunde alle 20 min, nach dem Abflug einmal zur Landung, danach Schluss.
  const WAKE = [
    { name: 'sechs Stunden vorher  -> zum Fensterbeginn', at: DEP - 360 * MIN, want: DEP - 180 * MIN },
    { name: 'zwei Stunden vorher   -> eine Stunde spaeter', at: DEP - 120 * MIN, want: DEP - 60 * MIN },
    { name: 'neunzig min vorher    -> gedeckelt auf T-60', at: DEP - 90 * MIN, want: DEP - 60 * MIN },
    { name: 'vierzig min vorher    -> zwanzig min spaeter', at: DEP - 40 * MIN, want: DEP - 20 * MIN },
    { name: 'zehn min vorher       -> gedeckelt auf Abflug', at: DEP - 10 * MIN, want: DEP },
    { name: 'im Flug               -> einmal zur Landung', at: DEP + 60 * MIN, want: ARR },
    { name: 'nach der Landung      -> gar nicht mehr', at: ARR + 30 * MIN, want: 0 },
  ];
  for (const c of WAKE) {
    const w = world(c.at, av0);
    w.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
    await wait(120);
    const d = w.page0();
    const got = d ? d.NEXT_WAKE : null;
    const want = c.want === 0 ? 0 : Math.floor(c.want / 1000);
    check(c.name, got === want,
          'erwartet ' + want + ', war ' + got + (got ? ' (' + Math.round((got * 1000 - c.at) / MIN) + ' min hin)' : ''));
  }

  console.log('\n=== Aenderungen ===\n');

  // Erster Abruf: alles neu, also keine Aenderung zu melden.
  const w1 = world(DEP - 200 * MIN, av0);
  w1.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  check('Erster Abruf meldet nichts', !w1.page0().CHANGE, 'CHANGE=' + w1.page0().CHANGE);
  check('Erster Abruf legt einen Pin an', w1.pins.length === 1, w1.pins.length + ' Pins');
  const p1 = w1.pins[0] && w1.pins[0].body;
  check('Pin meldet die Neuanlage', !!(p1 && p1.createNotification), 'keine createNotification');
  check('Pin traegt keine Aenderungsmeldung', !(p1 && p1.updateNotification), 'updateNotification vorhanden');

  // Zweiter Abruf mit UNVERAENDERTEN Daten: kein Pin, keine Meldung.
  w1.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  check('Gleiche Daten schicken keinen zweiten Pin', w1.pins.length === 1, w1.pins.length + ' Pins');
  check('Gleiche Daten melden nichts', !w1.page0().CHANGE, 'CHANGE=' + w1.page0().CHANGE);

  // Dritter Abruf mit geaendertem Gate.
  const avGate = clone(av0);
  const altesGate = av0.departure.gate;
  avGate.departure.gate = 'B12';
  const w2 = world(DEP - 200 * MIN, av0);
  w2.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  w2.avNext = avGate;
  // Zweiter Durchlauf in derselben Welt, jetzt mit neuem Gate
  const w3 = world(DEP - 200 * MIN, avGate);
  // Speicher der ersten Welt uebernehmen, damit ein ECHTER Vergleich entsteht
  Object.keys(w2.store).forEach((k) => { w3.store[k] = w2.store[k]; });
  w3.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  const d3 = w3.page0();
  check('Gate-Wechsel wird gemeldet', !!(d3 && d3.CHANGE && d3.CHANGE.indexOf('B12') >= 0),
        'CHANGE=' + (d3 && d3.CHANGE));
  check('Meldung nennt das alte Gate', !!(d3 && d3.CHANGE && d3.CHANGE.indexOf(altesGate) >= 0),
        'CHANGE=' + (d3 && d3.CHANGE));
  const p3 = w3.pins[w3.pins.length - 1] && w3.pins[w3.pins.length - 1].body;
  check('Pin traegt jetzt die Aenderungsmeldung', !!(p3 && p3.updateNotification),
        'keine updateNotification');
  check('Aenderungsmeldung nennt das neue Gate',
        !!(p3 && p3.updateNotification && JSON.stringify(p3.updateNotification).indexOf('B12') >= 0),
        JSON.stringify(p3 && p3.updateNotification));

  // Die Meldung darf nur EINMAL ueber die Leitung gehen.
  w3.fire('appmessage', { payload: { REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(60);
  check('Meldung geht nur einmal hinaus', !w3.page0().CHANGE, 'CHANGE=' + w3.page0().CHANGE);

  console.log('\n=== Pin-Aufbau ===\n');

  check('Feste Kennung mit Flugtag',
        !!(p1 && /^flynformer-lh400-\d{8}$/.test(p1.id)), 'id=' + (p1 && p1.id));
  check('Systemsymbol, kein app://',
        !!(p1 && p1.layout.tinyIcon.indexOf('system://images/') === 0),
        'tinyIcon=' + (p1 && p1.layout.tinyIcon));
  check('Erinnerungen vorhanden', !!(p1 && p1.reminders && p1.reminders.length), 'keine reminders');
  check('Hoechstens drei Erinnerungen', !(p1 && p1.reminders && p1.reminders.length > 3),
        (p1 && p1.reminders || []).length + ' Erinnerungen');
  const allFuture = (p1.reminders || []).every((r) => Date.parse(r.time) > DEP - 200 * MIN);
  check('Keine Erinnerung in der Vergangenheit', allFuture,
        JSON.stringify((p1.reminders || []).map((r) => r.time)));

  // Kurz vor dem Abflug darf keine 2-Stunden-Erinnerung mehr dabei sein.
  const w4 = world(DEP - 45 * MIN, av0);
  w4.fire('appmessage', { payload: { REFRESH: 1, REQUEST_PAGE: 0, LANG: 1, CODE: 'LH400' } });
  await wait(120);
  const p4 = w4.pins[0] && w4.pins[0].body;
  const rem4 = (p4 && p4.reminders) || [];
  check('Kurz vor Abflug nur noch kuenftige Erinnerungen',
        rem4.every((r) => Date.parse(r.time) > DEP - 45 * MIN),
        JSON.stringify(rem4.map((r) => r.time)));

  console.log('\n=== Kosten ===\n');
  check('Eine Auffrischung kostet genau eine Abfrage', w4.paid() === 1, w4.paid() + ' Abrufe');
  check('Der Pin kostet nichts beim Anbieter',
        w4.calls.filter((u) => u.indexOf('timeline-api') >= 0).length === 1 && w4.paid() === 1,
        JSON.stringify(w4.calls));

  console.log('\nFehler: ' + fails + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
