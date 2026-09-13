// Flynformer - Telefonseite.
//
// Die Uhr bekommt NIEMALS JSON und niemals Rohzahlen, sondern ausschliesslich
// fertig formatierte Kurzzeilen: auf flint bleiben von 64 KB realistisch nur
// 10-25 KB freier Heap. Gerechnet und formatiert wird hier.
//
// VIER QUELLEN, nur eine kostet Kontingent:
//   AviationStack  Status, Zeiten, Gate, Terminal, Verspaetung   1 Abfrage
//   hexdb.io       Flugzeug aus dem Mode-S-Hex                   gratis
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
var HEX_URL = 'https://hexdb.io/api/v1/aircraft/';
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
  hex:        ["Hex",             "Hex"],
  unknown:    ["unknown",         "unbekannt"],
  aircraft:   ["Aircraft",        "Flugzeug"],
  route:      ["Route",           "Strecke"],
  flighttime: ["Flight time",     "Flugzeit"],
  youare:     ["you:",            "du:"],
  todep:      ["to airport",      "zum Start"],
  dest:       ["Arrival",         "Ziel"],
  localtime:  ["local",           "Ortszeit"],
  nowx:       ["no weather",      "kein Wetter"],
  inn:        ["in",              "in"],
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
var PAGE_COUNT = 6;

// ---------------------------------------------------------------- Speicher

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function settings() {
  return load(S_SETTINGS, { key: '', flights: [], units: 'metric' });
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
  xhrJson(url, function (j, err) {
    if (err) { done(null, err); return; }
    if (j && j.error) { done(null, j.error.code || T('apierr')); return; }
    quotaSpend();
    if (!j || !j.data || !j.data.length) { done(null, T('notfound')); return; }
    done(pickFlight(j.data, code), null);
  });
}

function fetchAircraft(hex, done) {
  if (!hex) { done(null); return; }
  xhrJson(HEX_URL + encodeURIComponent(hex), function (j) { done(j || null); });
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

    var hex = av.aircraft && av.aircraft.icao24;
    // Das Flugzeug aendert sich nicht mehr, solange derselbe Hex kommt.
    var needAc = hex && (!rec.ac || rec.acHex !== hex);

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

    if (needAc) {
      fetchAircraft(hex, function (ac) {
        if (ac) { rec.ac = ac; rec.acHex = hex; }
        step2();
      });
    } else {
      step2();
    }
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
    return L;
  }
  var av = rec.av, dep = av.departure || {}, arr = av.arrival || {};
  // Echte Versaetze aus dem Wetterabruf; ohne sie wird nur gerechnet, nicht
  // angezeigt, also ist 0 als Rueckfall harmlos genug.
  var oOff = rec.oOff || 0, dOff = rec.dOff || 0;

  if (page === 0) {
    L[0] = (av.flight && av.flight.iata) || code;
    L[1] = (av.airline && av.airline.name) || '';
    var st = STATUS_TXT[av.flight_status];
    L[2] = st ? (st[s_lang] || st[0]) : (av.flight_status || '');
    L[3] = (dep.iata || '???') + ' → ' + (arr.iata || '???');
    var t = utcOf(dep.estimated || dep.scheduled, oOff);
    if (!isNaN(t)) {
      var minLeft = (t - Date.now()) / 60000;
      L[4] = minLeft > 0 ? T('inn') + ' ' + dur(minLeft)
                         : T('since') + ' ' + dur(-minLeft);
    }
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
    var ac = rec.ac;
    if (ac) {
      L[0] = ac.Registration || '';
      L[1] = ((ac.Manufacturer || '') + ' ' + (ac.Type || '')).trim();
      L[2] = ac.ICAOTypeCode || '';
      L[3] = ac.RegisteredOwners || '';
      L[4] = ac.ModeS ? T('hex') + ' ' + ac.ModeS : '';
    } else {
      L[0] = T('aircraft');
      L[1] = T('unknown');
    }
  } else if (page === 4) {
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
  } else if (page === 5) {
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
  return L;
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
  var L = buildPage(code, page);
  var q = quota();
  Pebble.sendAppMessage({
    PAGE: page,
    L1: L[0], L2: L[1], L3: L[2], L4: L[3], L5: L[4],
    AGE: ageText(code),
    QUOTA: q.used + ' / ' + QUOTA_LIMIT
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
  var f = [];
  ['FLIGHT1', 'FLIGHT2', 'FLIGHT3'].forEach(function (k) {
    if (dict[k] !== undefined) {
      var v = String(dict[k].value || '').toUpperCase().replace(/\s+/g, '');
      if (v) f.push(v);
    }
  });
  s.flights = f;
  save(S_SETTINGS, s);
  if (dict.QUOTA_RESET !== undefined && dict.QUOTA_RESET.value) {
    save(S_QUOTA, { month: monthKey(), used: 0 });
  }
  console.log('Einstellungen gespeichert: ' + f.length + ' Flug/Fluege, Schlüssel ' +
              (s.key ? 'gesetzt' : 'FEHLT'));
  sendPage(f[0] || '', 0);
});

Pebble.addEventListener('appmessage', function (e) {
  var p = e.payload, s = settings();
  // Die Uhr sagt, in welcher Sprache sie beschriftet ist.
  if (p.LANG !== undefined) s_lang = (p.LANG === 1) ? 1 : 0;
  var code = s.flights[0] || '';
  if (p.REFRESH !== undefined) {
    if (!code) { sendPage('', 0); return; }
    refresh(code, function (err) {
      if (err) {
        Pebble.sendAppMessage({ STATUS: err }, function () {}, function () {});
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
  console.log('Flynformer bereit. Schlüssel ' + (s.key ? 'gesetzt' : 'fehlt') +
              ', ' + s.flights.length + ' Flug/Fluege, Kontingent ' +
              quota().used + '/' + QUOTA_LIMIT);
  sendPage(s.flights[0] || '', 0);
});
