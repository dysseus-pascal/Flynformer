// Flynformer - Telefonseite.
//
// Die Uhr bekommt NIEMALS JSON und niemals Rohzahlen, sondern ausschliesslich
// fertig formatierte Kurzzeilen: auf flint bleiben von 64 KB realistisch nur
// 10-25 KB freier Heap. Gerechnet und formatiert wird hier.
//
// DREI QUELLEN, nur eine kostet Kontingent:
//   AviationStack  Status, Zeiten, Gate, Terminal, Verspaetung   1 Abfrage
//   adsbdb         Route und Flughafenkoordinaten aus der Nummer gratis
//   Open-Meteo     Wetter am Ziel                                gratis
//
// Der Gratistarif von AviationStack erlaubt 100 Abfragen im MONAT. Deshalb wird
// nur auf ausdruecklichen Wunsch nachgeladen, nie automatisch, und die App
// zaehlt den Verbrauch mit.
//
// Der API-Schluessel steht nur im localStorage dieses Telefons. Er wird nie an
// die Uhr geschickt und steht nicht im Quelltext.

var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var AV_URL = 'https://api.aviationstack.com/v1/flights';
var ROUTE_URL = 'https://api.adsbdb.com/v0/callsign/';
var WX_URL = 'https://api.open-meteo.com/v1/forecast';

var S_SETTINGS = 'flynformer_settings';
var S_CACHE = 'flynformer_cache';     // Flugnummer -> zwischengespeicherter Stand
var S_QUOTA = 'flynformer_quota';     // { month: '2026-09', used: n }


// ---------------------------------------------------------------- Texte
//
// Die Uhr baut fast keinen Text selbst - alles, was auf dem Schirm steht, wird
// hier zusammengesetzt. Deshalb liegt die Uebersetzung hier und nicht nur in
// src/c/strings_table.h. Welche Spalte gilt, sagt die Uhr per MESSAGE_KEY_LANG
// (0 = Englisch und Rueckfall, 1 = Deutsch).
var TXT = {
  no_flight:  ["no flight",       "kein Flug"],
  no_data:    ["no data yet",     "keine Daten"],
  press:      ["press select",    "Mitte drücken"],
  dep:        ["Dep",             "Abflug"],
  arr:        ["Arr",             "Ankunft"],
  sched:      ["sched",           "plan"],
  revised:    ["new",             "neu"],
  delay:      ["Delay",           "Verspätung"],
  ontime:     ["on time",         "pünktlich"],
  terminal:   ["Terminal",        "Terminal"],
  gate:       ["Gate",            "Gate"],
  belt:       ["Belt",            "Band"],
  unknown:    ["unknown",         "unbekannt"],
  route:      ["Route",           "Strecke"],
  flighttime: ["Flight time",     "Flugzeit"],
  youare:     ["you:",            "du:"],
  todep:      ["to airport",      "zum Start"],
  dest:       ["Arrival",         "Ziel"],
  localtime:  ["local",           "Ortszeit"],
  nowx:       ["no weather",      "kein Wetter"],
  inn:        ["in",              "in"],
  dshort:     ["dep",             "ab"],
  ashort:     ["arr",             "an"],
  attime:     ["at",              "um"],
  remaining:  ["left",            "noch"],
  cancelled:  ["cancelled",       "storniert"],
  since:      ["left",            "ab vor"],
  justnow:    ["just now",        "gerade eben"],
  ago:        ["",                "vor "],
  agosuffix:  [" ago",            ""],
  never:      ["never loaded",    "nie geladen"],
  nokey:      ["no API key",      "kein API-Schlüssel"],
  quotaout:   ["quota used up",   "Kontingent erschöpft"],
  notfound:   ["flight not found","Flug nicht gefunden"],
  neterr:     ["network error",   "Netzwerkfehler"],
  timeout:    ["timed out",       "Zeitüberschreitung"],
  badjson:    ["bad response",    "kaputte Antwort"],
  apierr:     ["API error",       "API-Fehler"]
};
var STATUS_TXT = {
  scheduled: ["scheduled","geplant"], active: ["en route","unterwegs"],
  landed: ["landed","gelandet"],      cancelled: ["cancelled","annulliert"],
  incident: ["incident","Zwischenfall"], diverted: ["diverted","umgeleitet"]
};
var WMO_TXT = [
  ["clear","klar"], ["partly cloudy","leicht bewölkt"], ["overcast","bedeckt"],
  ["fog","Nebel"], ["drizzle","Niesel"], ["rain","Regen"], ["snow","Schnee"],
  ["showers","Schauer"], ["snow showers","Schneeschauer"], ["thunderstorm","Gewitter"]
];

var s_lang = 0;   // von der Uhr gesetzt, 0 = Englisch
function T(id) { var r = TXT[id]; return r ? (r[s_lang] || r[0]) : ""; }

var QUOTA_LIMIT = 100;                 // Gratistarif AviationStack
var PAGE_COUNT = 5;   // Flugzeugseite entfallen: am Gate unnuetze Auskunft

// ---- Flugphasen -----------------------------------------------------------
// Der Statusschirm der Uhr zeigt nur, was in der laufenden Phase zaehlt. Die
// Phase wird hier ausgerechnet, weil nur das Telefon die echten Zeitzonen der
// beiden Flughaefen kennt (siehe utcOf und die aviationstack-Eigenheit oben).
// Die Reihenfolge entspricht FnPhase in src/c/phone.h - beide muessen gleich
// bleiben.
var PH_PLANNED = 0, PH_BOARDING = 1, PH_DEPARTED = 2,
    PH_ENROUTE = 3, PH_APPROACH = 4, PH_ARRIVED = 5, PH_OFF = 6;

// Fenster in Minuten. Grosszuegig gewaehlt: lieber zu frueh "Boarding" als eine
// Uhr, die am Gate noch "Geplant" behauptet.
var BOARDING_MIN = 50;   // so lange vor dem Abflug gilt Boarding
var DEPARTED_MIN = 20;   // so lange nach dem Abflug gilt Gestartet
var APPROACH_MIN = 30;   // so lange vor der Ankunft gilt Landeanflug

function phaseOf(av, oOff, dOff) {
  var dep = av.departure || {}, arr = av.arrival || {};
  var st = av.flight_status;
  var out = { phase: PH_OFF, progress: 0, d: NaN, a: NaN };
  if (st === 'cancelled' || st === 'incident' || st === 'diverted') return out;

  // Tatsaechlich schlaegt Geschaetzt schlaegt Geplant.
  var d = utcOf(dep.actual || dep.estimated || dep.scheduled, oOff);
  var a = utcOf(arr.actual || arr.estimated || arr.scheduled, dOff);
  var now = Date.now();
  out.d = d; out.a = a;

  if (st === 'landed' || (!isNaN(a) && now >= a)) {
    out.phase = PH_ARRIVED; out.progress = 100; return out;
  }
  if (isNaN(d)) return out;                       // ohne Abflugzeit keine Phase

  if (now < d - BOARDING_MIN * 60000) { out.phase = PH_PLANNED; return out; }
  if (now < d)                        { out.phase = PH_BOARDING; return out; }

  // In der Luft. Erst der Start, dann der Anflug, dazwischen die Strecke.
  if (now < d + DEPARTED_MIN * 60000) out.phase = PH_DEPARTED;
  else if (!isNaN(a) && now >= a - APPROACH_MIN * 60000) out.phase = PH_APPROACH;
  else out.phase = PH_ENROUTE;

  if (!isNaN(a) && a > d) {
    var pc = Math.round((now - d) * 100 / (a - d));
    out.progress = pc < 0 ? 0 : (pc > 100 ? 100 : pc);
  }
  return out;
}

// ---------------------------------------------------------------- Speicher

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function settings() {
  return load(S_SETTINGS, { key: '', units: 'metric' });
}

// Der Zaehler laeuft je Kalendermonat, weil AviationStack so abrechnet.
function monthKey() {
  var d = new Date();
  return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1);
}
function quota() {
  var q = load(S_QUOTA, { month: monthKey(), used: 0 });
  if (q.month !== monthKey()) q = { month: monthKey(), used: 0 };
  return q;
}
function quotaSpend() {
  var q = quota();
  q.used += 1;
  save(S_QUOTA, q);
  return q;
}

// ---------------------------------------------------------------- Werkzeug

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// ACHTUNG, das ist die wichtigste Eigenheit von AviationStack:
// Die Zeitstempel sehen aus wie UTC ("2026-09-13T10:55:00+00:00"), sind aber
// ORTSZEITEN am jeweiligen Flughafen. Nachgemessen an LH400: Abflug FRA 10:55
// und Ankunft JFK 13:35, beide mit "+00:00". Als UTC gelesen ergaebe das
// 2 h 40 Flugzeit statt der echten 8 h 40.
//
// Fuer die ANZEIGE ist das gleichgueltig - man will ohnehin die Ortszeit sehen,
// und die steht schon da. Falsch wird alles, was man daraus RECHNET: Countdown
// und Flugzeit. Dafuer braucht es den echten UTC-Versatz beider Flughaefen; den
// liefert Open-Meteo gratis mit (utc_offset_seconds).

// Uhrzeit so anzeigen, wie sie in der Zeichenkette steht - das IST die Ortszeit.
function hhmm(iso) {
  if (!iso) return '--:--';
  var m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? m[1] + ':' + m[2] : '--:--';
}

// Echter UTC-Zeitpunkt: die Zeichenkette als UTC lesen und den Ortsversatz
// wieder abziehen. offMin ist der Versatz des zugehoerigen Flughafens.
function utcOf(iso, offMin) {
  if (!iso) return NaN;
  var t = Date.parse(iso);
  if (isNaN(t)) return NaN;
  return t - (offMin || 0) * 60000;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  var R = 6371, rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function dist(km, units) {
  if (units === 'imperial') return Math.round(km * 0.621371) + ' mi';
  return Math.round(km) + ' km';
}

function dur(minutes) {
  if (minutes == null || isNaN(minutes)) return '--';
  var m = Math.round(minutes);
  var sign = m < 0 ? '-' : '';
  m = Math.abs(m);
  // Unter einer Stunde nur Minuten. "in 0 h 30" ist zwar richtig, liest sich
  // aber wie ein Formularfeld; am Gate will man "in 30 min" sehen.
  if (m < 60) return sign + m + ' min';
  return sign + Math.floor(m / 60) + ' h ' + pad2(m % 60);
}

// WMO-Wettercode zu Text.
function wmoText(c) {
  var i = 9;
  if (c === 0) i = 0; else if (c <= 2) i = 1; else if (c === 3) i = 2;
  else if (c <= 48) i = 3; else if (c <= 57) i = 4; else if (c <= 67) i = 5;
  else if (c <= 77) i = 6; else if (c <= 82) i = 7; else if (c <= 86) i = 8;
  return WMO_TXT[i][s_lang] || WMO_TXT[i][0];
}


function xhrJson(url, done) {
  var xhr = new XMLHttpRequest();
  xhr.timeout = 20000;
  xhr.onload = function () {
    if (this.status < 200 || this.status >= 300) { done(null, 'HTTP ' + this.status); return; }
    try { done(JSON.parse(this.responseText), null); }
    catch (e) { done(null, T('badjson')); }
  };
  xhr.onerror = function () { done(null, T('neterr')); };
  xhr.ontimeout = function () { done(null, T('timeout')); };
  xhr.open('GET', url);
  xhr.send();
}

// ---------------------------------------------------------------- Abrufe

// AviationStack liefert zu einer Flugnummer auch die Codeshares und aeltere
// Tage mit. Deshalb wird gefiltert: gesuchte Nummer, juengstes Datum.
function pickFlight(data, code) {
  var want = code.toUpperCase().replace(/\s+/g, '');
  var hits = data.filter(function (r) {
    return r.flight && r.flight.iata &&
           r.flight.iata.toUpperCase().replace(/\s+/g, '') === want;
  });
  if (!hits.length) hits = data;
  hits.sort(function (a, b) {
    return (b.flight_date || '').localeCompare(a.flight_date || '');
  });
  return hits[0] || null;
}

function fetchStatus(code, done) {
  var s = settings();
  if (!s.key) { done(null, T('nokey')); return; }
  var q = quota();
  if (q.used >= QUOTA_LIMIT) { done(null, T('quotaout')); return; }
  var url = AV_URL + '?access_key=' + encodeURIComponent(s.key) +
            '&flight_iata=' + encodeURIComponent(code) + '&limit=5';
  // Gezaehlt wird beim ABSENDEN, nicht beim Gelingen. aviationstack rechnet die
  // Anfrage ab, sobald sie dort ankommt - ob die Antwort ein Zeitfehler, ein
  // 500er oder unbrauchbares JSON ist, aendert daran nichts. Wer erst den Erfolg
  // zaehlte, meldete zu wenig, und die Sperre bei 100 haette nie gegriffen.
  //
  // Dasselbe schliesst die Luecke zwischen Pruefen und Zaehlen: zwei rasch
  // aufeinander folgende Auffrischungen lasen sonst beide denselben alten Stand
  // und kamen beide durch.
  quotaSpend();
  xhrJson(url, function (j, err) {
    if (err) { done(null, err); return; }
    if (j && j.error) { done(null, j.error.code || T('apierr')); return; }
    if (!j || !j.data || !j.data.length) { done(null, T('notfound')); return; }
    done(pickFlight(j.data, code), null);
  });
}

function fetchRoute(code, done) {
  xhrJson(ROUTE_URL + encodeURIComponent(code), function (j) {
    done((j && j.response && j.response.flightroute) || null);
  });
}

// Ein Aufruf fuer BEIDE Flughaefen: Open-Meteo nimmt mehrere Koordinaten und
// antwortet mit einem Array. Das liefert das Zielwetter UND - viel wichtiger -
// den echten UTC-Versatz von Start und Ziel, ohne den Countdown und Flugzeit
// falsch waeren. 780 Byte, kostenlos.
function fetchWeatherPair(rt, units, done) {
  if (!rt) { done(null); return; }
  var url = WX_URL + '?latitude=' + rt.oLat + ',' + rt.dLat +
            '&longitude=' + rt.oLon + ',' + rt.dLon +
            '&current=temperature_2m,weather_code&timezone=auto';
  if (units === 'imperial') url += '&temperature_unit=fahrenheit';
  xhrJson(url, function (j) {
    if (!j) { done(null); return; }
    var arr = Array.isArray(j) ? j : [j, j];
    done({ origin: arr[0], dest: arr[1] || arr[0] });
  });
}

// ---------------------------------------------------------------- Zusammenbau

// Holt alles fuer einen Flug und legt den Stand ab. Die drei kostenlosen
// Quellen laufen nacheinander, damit die Reihenfolge vorhersagbar bleibt und
// pkjs nicht mehrere Antworten gleichzeitig im Speicher halten muss.
function refresh(code, done) {
  var s = settings();
  var cache = load(S_CACHE, {});
  var rec = cache[code] || {};

  fetchStatus(code, function (av, err) {
    if (err) { done(err); return; }
    rec.av = av;
    rec.at = Date.now();

    // Der Abruf des Flugzeugmusters bei hexdb ist mit der Flugzeugseite
    // entfallen. Er war kostenlos, aber er kostete Zeit vor der ersten Anzeige,
    // und niemand wartet am Gate darauf, welcher Airbus da steht.

    function step2() {
      // Route und Koordinaten aendern sich praktisch nie - einmal reicht.
      if (rec.rt) { step3(); return; }
      fetchRoute(code, function (rt) {
        if (rt) rec.rt = {
          oLat: rt.origin.latitude, oLon: rt.origin.longitude,
          dLat: rt.destination.latitude, dLon: rt.destination.longitude,
          oCity: rt.origin.municipality, dCity: rt.destination.municipality,
          airline: rt.airline && rt.airline.name
        };
        step3();
      });
    }
    function step3() {
      fetchWeatherPair(rec.rt, s.units, function (w) {
        if (w) {
          // Die beiden Versaetze sind der eigentliche Zweck dieses Abrufs -
          // ohne sie waeren Countdown und Flugzeit falsch (siehe utcOf).
          rec.oOff = Math.round((w.origin.utc_offset_seconds || 0) / 60);
          rec.dOff = Math.round((w.dest.utc_offset_seconds || 0) / 60);
          if (w.dest.current) rec.wx = {
            t: w.dest.current.temperature_2m,
            c: w.dest.current.weather_code
          };
        }
        cache[code] = rec;
        save(S_CACHE, cache);
        done(null);
      });
    }

    step2();
  });
}

// ---------------------------------------------------------------- Seiten

// Jede Seite sind fuenf kurze Zeilen. Leere Zeilen bleiben leer, damit die Uhr
// nicht raten muss.
function buildPage(code, page) {
  var s = settings();
  var rec = (load(S_CACHE, {}))[code];
  var L = ['', '', '', '', ''];
  if (!rec || !rec.av) {
    L[0] = code || T('no_flight');
    L[1] = T('no_data');
    L[2] = T('press');
    return { lines: L, phase: PH_OFF, progress: 0 };
  }
  var av = rec.av, dep = av.departure || {}, arr = av.arrival || {};
  // Echte Versaetze aus dem Wetterabruf; ohne sie wird nur gerechnet, nicht
  // angezeigt, also ist 0 als Rueckfall harmlos genug.
  var oOff = rec.oOff || 0, dOff = rec.dOff || 0;

  if (page === 0) {
    // Der Statusschirm. Jede Phase bekommt genau die Zeilen, die in ihr etwas
    // nuetzen - Zeile 2 ist die grosse, und in PH_ENROUTE zeichnet die Uhr
    // zwischen Zeile 2 und 3 den Fortschrittsbalken.
    var ph = phaseOf(av, oOff, dOff);
    var route = (dep.iata || '???') + ' → ' + (arr.iata || '???');
    var gateLine = (dep.terminal || dep.gate)
        ? ((dep.terminal ? T('terminal') + ' ' + dep.terminal : '') +
           (dep.terminal && dep.gate ? '  ' : '') +
           (dep.gate ? T('gate') + ' ' + dep.gate : '')).trim()
        : '';
    var arrGate = (arr.terminal || arr.gate)
        ? ((arr.terminal ? T('terminal') + ' ' + arr.terminal : '') +
           (arr.terminal && arr.gate ? '  ' : '') +
           (arr.gate ? T('gate') + ' ' + arr.gate : '')).trim()
        : '';
    var belt = arr.baggage ? T('belt') + ' ' + arr.baggage : '';
    var delay = arr.delay || dep.delay;
    var delayLine = delay ? T('delay') + ' ' + delay + ' min' : T('ontime');
    var toDep = isNaN(ph.d) ? '' : dur((ph.d - Date.now()) / 60000);
    var toArr = isNaN(ph.a) ? '' : dur((ph.a - Date.now()) / 60000);
    var depAt = T('dshort') + ' ' + hhmm(dep.actual || dep.estimated || dep.scheduled);
    var arrAt = T('ashort') + ' ' + hhmm(arr.actual || arr.estimated || arr.scheduled);

    // Hoechstens VIER Eintraege je Phase, und mit Balken nur drei: auf flint
    // bleiben unter dem Kopfband und ueber der Fusszeile rund 105 Pixel, das
    // sind eine grosse und drei normale Zeilen. Eine fuenfte lief in die
    // Fusszeile hinein. Verspaetung haengt darum als "+13" an der Zeit, statt
    // eine eigene Zeile zu belegen.
    var delayTag = delay ? '  +' + delay : '';

    if (ph.phase === PH_BOARDING) {
      // Am Gate zaehlt das Gate.
      L[0] = route;
      L[1] = dep.gate ? T('gate') + ' ' + dep.gate : T('inn') + ' ' + toDep;
      L[2] = dep.terminal ? T('terminal') + ' ' + dep.terminal : '';
      L[3] = depAt + (dep.gate ? '  ' + T('inn') + ' ' + toDep : delayTag);
    } else if (ph.phase === PH_DEPARTED) {
      L[0] = route;
      L[1] = arrAt;
      L[2] = depAt + delayTag;
    } else if (ph.phase === PH_ENROUTE) {
      // Zeile 3 steht unter dem Balken, den die Uhr dazwischen zeichnet.
      L[0] = route;
      L[1] = T('remaining') + ' ' + toArr;
      L[2] = arrAt + delayTag;
    } else if (ph.phase === PH_APPROACH) {
      // Der Countdown steht schon gross da; die Ankunftszeit waere dieselbe
      // Auskunft zweimal. Wichtig ist jetzt, wohin man laeuft.
      L[0] = '→ ' + (arr.iata || '???');
      L[1] = T('inn') + ' ' + toArr;
      L[2] = arrGate;
      L[3] = belt;
    } else if (ph.phase === PH_ARRIVED) {
      L[0] = arr.iata || '???';
      L[1] = T('attime') + ' ' + hhmm(arr.actual || arr.estimated || arr.scheduled);
      L[2] = arrGate;
      L[3] = belt;
    } else if (ph.phase === PH_OFF) {
      var sto = STATUS_TXT[av.flight_status];
      L[0] = route;
      L[1] = sto ? (sto[s_lang] || sto[0]) : (av.flight_status || T('unknown'));
    } else {                              // PH_PLANNED
      L[0] = route;
      L[1] = T('inn') + ' ' + toDep;
      L[2] = depAt + delayTag;
      L[3] = gateLine;
    }
    return { lines: L, phase: ph.phase, progress: ph.progress };
  } else if (page === 1) {
    L[0] = T('dep') + ' ' + (dep.iata || '');
    L[1] = T('sched') + ' ' + hhmm(dep.scheduled) +
           (dep.estimated && dep.estimated !== dep.scheduled
              ? '  ' + T('revised') + ' ' + hhmm(dep.estimated) : '');
    L[2] = T('arr') + ' ' + (arr.iata || '');
    L[3] = T('sched') + ' ' + hhmm(arr.scheduled) +
           (arr.estimated && arr.estimated !== arr.scheduled
              ? '  ' + T('revised') + ' ' + hhmm(arr.estimated) : '');
    var d = arr.delay || dep.delay;
    L[4] = d ? T('delay') + ' ' + d + ' min' : T('ontime');
  } else if (page === 2) {
    L[0] = T('dep') + ' ' + (dep.iata || '');
    L[1] = T('terminal') + ' ' + (dep.terminal || '?') +
           '  ' + T('gate') + ' ' + (dep.gate || '?');
    L[2] = T('arr') + ' ' + (arr.iata || '');
    L[3] = T('terminal') + ' ' + (arr.terminal || '?') +
           '  ' + T('gate') + ' ' + (arr.gate || '?');
    L[4] = arr.baggage ? T('belt') + ' ' + arr.baggage : '';
  } else if (page === 3) {
    var rt = rec.rt;
    if (rt) {
      L[0] = dist(haversineKm(rt.oLat, rt.oLon, rt.dLat, rt.dLon), s.units);
      var ts = utcOf(dep.scheduled, oOff), ta = utcOf(arr.scheduled, dOff);
      if (!isNaN(ts) && !isNaN(ta)) L[1] = T('flighttime') + ' ' + dur((ta - ts) / 60000);
      L[2] = (rt.oCity || '') + ' →';
      L[3] = rt.dCity || '';
      if (rec.gps != null) L[4] = T('youare') + ' ' + dist(rec.gps, s.units) + ' ' + T('todep');
    } else {
      L[0] = T('route');
      L[1] = T('unknown');
    }
  } else if (page === 4) {
    var wx = rec.wx, rt2 = rec.rt;
    L[0] = T('dest') + ' ' + (arr.iata || '');
    if (wx) {
      L[1] = Math.round(wx.t) + (s.units === 'imperial' ? ' °F' : ' °C');
      L[2] = wmoText(wx.c);
      var now = new Date(Date.now() + dOff * 60000);
      L[3] = T('localtime') + ' ' + pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes());
    } else {
      L[1] = T('nowx');
    }
    if (rt2 && rt2.dCity) L[4] = rt2.dCity;
  }
  return { lines: L, phase: PH_OFF, progress: 0 };
}

function ageText(code) {
  var rec = (load(S_CACHE, {}))[code];
  if (!rec || !rec.at) return T('never');
  var min = Math.round((Date.now() - rec.at) / 60000);
  if (min < 1) return T('justnow');
  if (min < 60) return T('ago') + min + ' min' + T('agosuffix');
  return T('ago') + dur(min) + T('agosuffix');
}

function sendPage(code, page) {
  var b = buildPage(code, page);
  var L = b.lines;
  var q = quota();
  Pebble.sendAppMessage({
    PAGE: page,
    L1: L[0], L2: L[1], L3: L[2], L4: L[3], L5: L[4],
    // Die Uhr waehlt danach die Ueberschrift und zeichnet den Balken.
    PHASE: b.phase,
    PROGRESS: b.progress,
    AGE: ageText(code),
    QUOTA: q.used + ' / ' + QUOTA_LIMIT,
    // Zu welchem Flug diese Antwort gehoert. Die Uhr wirft sie weg, wenn die
    // Nummer inzwischen eine andere ist - sonst stuenden die Zeiten des vorigen
    // Fluges unter der neuen Nummer und wuerden dort auch noch gespeichert.
    FNO: String(code || '')
  }, function () {}, function () { console.log('AppMessage: Senden fehlgeschlagen'); });
}

// ---------------------------------------------------------------- Standort

// Nur auf Wunsch und mit sauberem Fehlerweg: die Berechtigung kann in der
// Telefon-App oder im Betriebssystem fehlen.
function updateGps(code, done) {
  if (!navigator.geolocation) { done(); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    var cache = load(S_CACHE, {}), rec = cache[code];
    if (rec && rec.rt) {
      rec.gps = haversineKm(pos.coords.latitude, pos.coords.longitude,
                            rec.rt.oLat, rec.rt.oLon);
      cache[code] = rec;
      save(S_CACHE, cache);
    }
    done();
  }, function (err) {
    console.log('Standort nicht verfügbar: ' + (err && err.message));
    done();
  }, { timeout: 15000, maximumAge: 600000 });
}

// ---------------------------------------------------------------- Ereignisse

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) return;
  // false = Clay soll NICHTS von sich aus an die Uhr schicken. Der API-
  // Schluessel darf die Uhr nie erreichen; sie bekommt nur Anzeigetexte.
  var dict = clay.getSettings(e.response, false);
  var s = settings();
  if (dict.API_KEY !== undefined) s.key = String(dict.API_KEY.value || '').trim();
  if (dict.UNITS !== undefined) s.units = String(dict.UNITS.value || 'metric');
  // Die Flugnummer steht bewusst NICHT mehr hier: sie wird auf der Uhr
  // eingegeben und mit jeder Anfrage mitgeschickt.
  // Der Zaehler wird nur beim UMLEGEN des Schalters zurueckgesetzt, nicht bei
  // jedem Speichern. Clay zeigt die Konfigseite mit den zuletzt gesendeten
  // Werten wieder an, der Schalter steht also weiterhin auf ein - und ohne
  // diese Flanke nullte jedes spaetere Speichern den Zaehler still mit. Die
  // Fusszeile zeigte dann 0 von 100, waehrend das Kontingent schon fast weg war.
  // Nur wenn der Schalter ueberhaupt mitgeschickt wurde, darf seine Stellung
  // gemerkt werden. Sonst loeschte eine unvollstaendige Antwort - etwa eine
  // abgebrochene Konfigseite - die Erinnerung, und das naechste gewoehnliche
  // Speichern nullte den Zaehler erneut: genau der Fehler, den die Flanke
  // beheben soll.
  if (dict.QUOTA_RESET !== undefined) {
    var wantReset = !!dict.QUOTA_RESET.value;
    if (wantReset && !s.resetSeen) save(S_QUOTA, { month: monthKey(), used: 0 });
    s.resetSeen = wantReset;
  }
  save(S_SETTINGS, s);
  console.log('Einstellungen gespeichert, Schluessel ' +
              (s.key ? 'gesetzt' : 'FEHLT'));
});

Pebble.addEventListener('appmessage', function (e) {
  var p = e.payload, s = settings();
  // Die Uhr sagt, in welcher Sprache sie beschriftet ist.
  if (p.LANG !== undefined) s_lang = (p.LANG === 1) ? 1 : 0;
  // Die Flugnummer gehoert der UHR - sie wird dort eingegeben und mit jeder
  // Anfrage mitgeschickt. Die Telefon-App verwaltet sie nicht mehr.
  var code = (p.CODE !== undefined) ? String(p.CODE).toUpperCase() : '';
  if (p.REFRESH !== undefined) {
    if (!code) { sendPage('', 0); return; }
    refresh(code, function (err) {
      if (err) {
        // Auch die Fehlermeldung traegt die Flugnummer, sonst liesse der
        // Stale-Filter der Uhr den Fehler des VORIGEN Fluges unter der neuen
        // Nummer durch.
        Pebble.sendAppMessage({ STATUS: err, FNO: String(code || '') },
                              function () {}, function () {});
        return;
      }
      updateGps(code, function () {
        sendPage(code, p.REQUEST_PAGE !== undefined ? p.REQUEST_PAGE : 0);
      });
    });
    return;
  }
  if (p.REQUEST_PAGE !== undefined) {
    var page = p.REQUEST_PAGE;
    if (page < 0) page = PAGE_COUNT - 1;
    if (page >= PAGE_COUNT) page = 0;
    sendPage(code, page);
  }
});

Pebble.addEventListener('ready', function () {
  var s = settings();
  console.log('Flynformer bereit. Schluessel ' + (s.key ? 'gesetzt' : 'fehlt') +
              ', Kontingent ' + quota().used + '/' + QUOTA_LIMIT);
  // Kein Senden hier: die Uhr fragt von sich aus und schickt die Flugnummer mit.
});
