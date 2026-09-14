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
  was:        ["was",             "war"],
  changed:    ["changed",         "geändert"],
  newflight:  ["flight added",    "Flug eingetragen"],
  open_app:   ["Open",            "Öffnen"],
  min:        ["min",             "min"],
  hrs:        ["h",               "h"],
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
// Was die letzte Auffrischung an Aenderungen ergab. Wird EINMAL mit der
// naechsten Statusseite zur Uhr geschickt und dabei geleert - sonst meldete
// jeder Seitenwechsel dieselbe Aenderung noch einmal.
var s_changes = [];
function T(id) { var r = TXT[id]; return r ? (r[s_lang] || r[0]) : ""; }

// Holt die Aenderungen ab UND leert sie dabei: sie sollen genau einmal ueber
// die Leitung gehen, sonst meldete jeder Seitenwechsel dieselbe Aenderung
// noch einmal.
function takeChanges() {
  var t = s_changes.join(', ');
  s_changes = [];
  return t;
}

var QUOTA_LIMIT = 100;                 // Gratistarif AviationStack
var PAGE_COUNT = 5;

// ---- Timeline ------------------------------------------------------------
// Derselbe Weg wie bei Drinktervall und ChronoKit, die beide auf der echten
// Uhr laufen: REST mit dem Token aus Pebble.getTimelineToken, die lokale
// Schnittstelle nur als Rueckfall. Der tote Host getpebble.com wird nicht
// benutzt.
var TIMELINE_API = 'https://timeline-api.rebble.io/v1/user/pins/';
var PIN_STORE = 'flynformer_pins';
var PIN_VERSION = 1;          // erhoehen, wenn sich das AUSSEHEN aendert
var LAUNCH_OPEN = 1;

// Nur Namen aus dem System-Satz erreichen die echte Uhr. app://-Symbole nicht:
// die Telefon-App setzt das Symbol ueber eine feste Tabelle, die ausschliesslich
// system://images/... kennt, und laesst alles andere stillschweigend weg - die
// Uhr zeichnet dann ihre Standardflagge.
var PIN_ICON = 'system://images/SCHEDULED_FLIGHT';
var PIN_BG = '#FFAA00';
var PIN_FG = '#000000';

// Erinnerungen vor dem Abflug. Sie vibrieren VON SELBST, ohne dass die App
// laeuft - das ist der eigentliche Grund, warum die Pins mehr wert sind als
// jedes Pollen. Hoechstens drei erlaubt das Schema.
var REMIND_BEFORE_MIN = [120, 30];

// ---- Weckplan ------------------------------------------------------------
// Geweckt wird nur NAHE AM ABFLUG. Jedes Wecken startet die App im Vordergrund
// (einen stillen Hintergrundlauf gibt es auf Pebble nicht) und kostet eine der
// 100 Monatsabfragen. Darum so spaet wie moeglich und so selten wie noetig:
//
//   mehr als 3 h vorher   gar nicht - erst zum Beginn des Fensters
//   3 h bis 1 h vorher    stuendlich
//   letzte Stunde         alle 20 Minuten
//   nach dem Abflug       einmal zur Landung, dann Schluss
//
// Das sind rund acht Abrufe je Flug, also gut zwoelf Fluege im Monat.
var WAKE_LEAD_MS  = 3 * 3600000;
var WAKE_CLOSE_MS = 1 * 3600000;
var WAKE_STEP_FAR_MS = 3600000;
var WAKE_STEP_NEAR_MS = 20 * 60000;   // Flugzeugseite entfallen: am Gate unnuetze Auskunft

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
    // Die EINZIGE Stelle, an der alter und neuer Datensatz gleichzeitig da
    // sind. Danach ist der alte weg, und ein Vergleich waere nicht mehr
    // moeglich. Verglichen wird erst in step3, wenn die Zeitversaetze stehen -
    // ohne sie waere jede Zeitaenderung falsch gerechnet.
    var prev = rec.av;
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
        // Jetzt stehen die Versaetze, also kann verglichen werden.
        var changes = diffFlight(prev, av, rec.oOff || 0, rec.dOff || 0);
        s_changes = changes;
        cache[code] = rec;
        save(S_CACHE, cache);
        // Der Pin geht in die Timeline. Traegt er eine Aenderung, meldet sich
        // die Uhr von selbst - auch wenn die App laengst wieder zu ist.
        try { pushPin(code, av, rec.oOff || 0, rec.dOff || 0, changes); }
        catch (e) { console.log('timeline: ' + e); }
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
    return { lines: L, phase: PH_OFF, progress: 0, wake: 0, change: '' };
  }
  var av = rec.av, dep = av.departure || {}, arr = av.arrival || {};
  // Echte Versaetze aus dem Wetterabruf; ohne sie wird nur gerechnet, nicht
  // angezeigt, also ist 0 als Rueckfall harmlos genug.
  var oOff = rec.oOff || 0, dOff = rec.dOff || 0;

  // Drei Seiten, geordnet wie die Reise selbst. Vorher waren es fuenf, sortiert
  // nach Datenquelle - das ist die Ordnung des Programmierers, nicht die des
  // Reisenden.
  var ph = phaseOf(av, oOff, dOff);
  var route = (dep.iata || '???') + ' → ' + (arr.iata || '???');
  var delay = arr.delay || dep.delay;
  var delayTag = delay ? '  +' + delay : '';
  var depAt = T('dshort') + ' ' + hhmm(dep.actual || dep.estimated || dep.scheduled);
  var arrAt = T('ashort') + ' ' + hhmm(arr.actual || arr.estimated || arr.scheduled);
  // Countdowns nur, solange sie in der ZUKUNFT liegen. Ein abgelaufener zeigte
  // sonst "in -22 h 46" - richtig gerechnet und trotzdem Unsinn.
  var minDep = isNaN(ph.d) ? NaN : (ph.d - Date.now()) / 60000;
  var minArr = isNaN(ph.a) ? NaN : (ph.a - Date.now()) / 60000;
  var toDep = (!isNaN(minDep) && minDep > 0) ? dur(minDep) : '';
  var toArr = (!isNaN(minArr) && minArr > 0) ? dur(minArr) : '';
  // Die geplante Reisedauer - das, was auf der Flugseite gross dastehen soll,
  // solange noch nicht geflogen wird.
  var tsp = utcOf(dep.scheduled, oOff), tap = utcOf(arr.scheduled, dOff);
  var travel = (!isNaN(tsp) && !isNaN(tap) && tap > tsp) ? dur((tap - tsp) / 60000) : '';

  function place(t, g) {
    return ((t ? T('terminal') + ' ' + t : '') + (t && g ? '  ' : '') +
            (g ? T('gate') + ' ' + g : '')).trim();
  }

  if (page === 0) {
    // VOR DEM FLUG: wo muss ich hin, und wann. Das Gate ist die grosse Zeile,
    // sobald es eins gibt - danach sucht man am Flughafen.
    L[0] = route;
    L[1] = dep.gate ? (T('gate') + ' ' + dep.gate)
                    : (toDep ? (T('inn') + ' ' + toDep) : depAt);
    L[2] = dep.terminal ? T('terminal') + ' ' + dep.terminal : '';
    L[3] = depAt + ((dep.gate && toDep) ? ('  ' + T('inn') + ' ' + toDep) : delayTag);
    L[4] = delay ? T('delay') + ' ' + delay + ' min' : T('ontime');
  } else if (page === 1) {
    // IM FLUG: wie lange noch. Zwischen Zeile 2 und 3 zeichnet die Uhr den
    // Fortschrittsbalken, aber nur solange wirklich geflogen wird.
    var rt = rec.rt;
    var flying = (ph.phase === PH_ENROUTE || ph.phase === PH_APPROACH) && toArr;
    L[0] = route;
    // Unterwegs zaehlt die Restzeit, sonst die geplante Reisedauer.
    L[1] = flying ? (T('remaining') + ' ' + toArr) : travel;
    L[2] = arrAt + delayTag;
    // Die Flugzeit nur dann, wenn sie nicht schon gross oben steht.
    if (!flying) L[3] = depAt;
    else if (travel) L[3] = T('flighttime') + ' ' + travel;
    // Die Distanz nur, wenn KEIN Balken gezeichnet wird. Unterwegs nimmt der
    // Balken die Hoehe einer Zeile ein, und auf flint stiess die fuenfte Angabe
    // dann in die Fusszeile.
    if (rt && !flying) L[4] = dist(haversineKm(rt.oLat, rt.oLon, rt.dLat, rt.dLon), s.units);
  } else {
    // AM ZIEL: Wetter und Ortszeit, dann wohin man laeuft und wo der Koffer
    // herauskommt.
    var wx = rec.wx, rt2 = rec.rt;
    L[0] = (arr.iata || '???') + (rt2 && rt2.dCity ? '  ' + rt2.dCity : '');
    if (wx) {
      L[1] = Math.round(wx.t) + (s.units === 'imperial' ? ' °F' : ' °C');
      L[2] = wmoText(wx.c);
    } else {
      L[1] = T('nowx');
    }
    var now2 = new Date(Date.now() + dOff * 60000);
    L[3] = T('localtime') + ' ' + pad2(now2.getUTCHours()) + ':' + pad2(now2.getUTCMinutes());
    var ag = place(arr.terminal, arr.gate);
    L[4] = arr.baggage ? (T('belt') + ' ' + arr.baggage + (ag ? '  ' + ag : '')) : ag;
  }

  return { lines: L, phase: ph.phase, progress: ph.progress,
           wake: s.watch === false ? 0 : nextWakeAt(ph, Date.now()),
           change: takeChanges() };
}

function ageText(code) {
  var rec = (load(S_CACHE, {}))[code];
  if (!rec || !rec.at) return T('never');
  var min = Math.round((Date.now() - rec.at) / 60000);
  if (min < 1) return T('justnow');
  if (min < 60) return T('ago') + min + ' min' + T('agosuffix');
  return T('ago') + dur(min) + T('agosuffix');
}

// ---------------------------------------------------------------- Timeline --

function pinStore() {
  try { return JSON.parse(localStorage.getItem(PIN_STORE)) || {}; } catch (e) { return {}; }
}
function pinStoreSave(o) {
  try { localStorage.setItem(PIN_STORE, JSON.stringify(o)); } catch (e) {}
}

// Die Kennung ist FEST, nicht zufaellig: derselbe Flug am selben Tag bekommt
// immer dieselbe, und ein erneutes PUT ueberschreibt den Pin, statt einen
// zweiten anzulegen. Der Flugtag gehoert hinein, sonst liefe der Pin von
// gestern in den von heute.
function pinId(code, av) {
  var day = String((av && av.flight_date) || '').replace(/-/g, '');
  return 'flynformer-' + String(code || '').toLowerCase() + '-' + (day || 'x');
}

function isoOf(ms) { return new Date(ms).toISOString(); }

// Was sich geaendert hat, in kurzen Saetzen. Leere Liste heisst: nichts
// Meldenswertes. Countdown und Fortschritt stehen bewusst NICHT drin - die
// aendern sich bei jedem Abruf und waeren keine Nachricht, sondern Laerm.
function diffFlight(prev, av, oOff, dOff) {
  var out = [];
  if (!prev || !av) return out;
  // Verschiedene Flugtage sind kein Wechsel, sondern ein anderer Flug.
  if (prev.flight_date && av.flight_date && prev.flight_date !== av.flight_date) return out;

  var pd = prev.departure || {}, nd = av.departure || {};
  var pa = prev.arrival || {}, na = av.arrival || {};

  if (prev.flight_status !== av.flight_status && av.flight_status) {
    var st = STATUS_TXT[av.flight_status];
    out.push(st ? (st[s_lang] || st[0]) : av.flight_status);
  }
  if (nd.gate && nd.gate !== pd.gate) {
    out.push(T('gate') + ' ' + nd.gate + (pd.gate ? ' (' + T('was') + ' ' + pd.gate + ')' : ''));
  }
  if (nd.terminal && nd.terminal !== pd.terminal) {
    out.push(T('terminal') + ' ' + nd.terminal + (pd.terminal ? ' (' + T('was') + ' ' + pd.terminal + ')' : ''));
  }
  if (na.gate && na.gate !== pa.gate) {
    out.push(T('arr') + ' ' + T('gate') + ' ' + na.gate);
  }
  if (na.baggage && na.baggage !== pa.baggage) {
    out.push(T('belt') + ' ' + na.baggage);
  }
  // Zeiten erst ab fuenf Minuten. Eine Minute hin oder her ist Rauschen im
  // Datenbestand, keine Auskunft.
  function shifted(o, n, off, label) {
    var a = utcOf(o.actual || o.estimated || o.scheduled, off);
    var b = utcOf(n.actual || n.estimated || n.scheduled, off);
    if (isNaN(a) || isNaN(b)) return;
    if (Math.abs(b - a) < 5 * 60000) return;
    out.push(label + ' ' + hhmm(n.actual || n.estimated || n.scheduled));
  }
  shifted(pd, nd, oOff, T('dshort'));
  shifted(pa, na, dOff, T('ashort'));
  return out;
}

// Die naechste Weckzeit in Sekunden seit 1970, oder 0 fuer "nicht mehr wecken".
function nextWakeAt(ph, now) {
  if (!ph || isNaN(ph.d)) return 0;
  var d = ph.d, a = ph.a;
  if (!isNaN(a) && now >= a) return 0;                  // gelandet, fertig
  if (now < d - WAKE_LEAD_MS) return Math.floor((d - WAKE_LEAD_MS) / 1000);
  if (now < d - WAKE_CLOSE_MS) {
    var t = now + WAKE_STEP_FAR_MS;
    if (t > d - WAKE_CLOSE_MS) t = d - WAKE_CLOSE_MS;
    return Math.floor(t / 1000);
  }
  if (now < d) {
    var t2 = now + WAKE_STEP_NEAR_MS;
    if (t2 > d) t2 = d;
    return Math.floor(t2 / 1000);
  }
  if (!isNaN(a)) return Math.floor(a / 1000);           // einmal zur Landung
  return 0;
}

function buildFlightPin(code, av, oOff, dOff, changes, isNew) {
  var dep = av.departure || {}, arr = av.arrival || {};
  var d = utcOf(dep.actual || dep.estimated || dep.scheduled, oOff);
  if (isNaN(d)) return null;
  var route = (dep.iata || '???') + ' → ' + (arr.iata || '???');
  var gate = ((dep.terminal ? T('terminal') + ' ' + dep.terminal : '') +
              (dep.terminal && dep.gate ? '  ' : '') +
              (dep.gate ? T('gate') + ' ' + dep.gate : '')).trim();
  var body = T('dshort') + ' ' + hhmm(dep.actual || dep.estimated || dep.scheduled) +
             '   ' + T('ashort') + ' ' + hhmm(arr.actual || arr.estimated || arr.scheduled);
  var delay = arr.delay || dep.delay;
  if (delay) body += '\n' + T('delay') + ' ' + delay + ' min';

  var sub = gate;
  if (!sub) {
    var s0 = STATUS_TXT[av.flight_status];
    sub = s0 ? (s0[s_lang] || s0[0]) : '';
  }

  var pin = {
    id: pinId(code, av),
    time: isoOf(d),
    layout: {
      type: 'genericPin',
      title: String(code) + '  ' + route,
      subtitle: sub,
      tinyIcon: PIN_ICON,
      backgroundColor: PIN_BG,
      foregroundColor: PIN_FG,
      body: body
    },
    actions: [{ title: T('open_app'), type: 'openWatchApp', launchCode: LAUNCH_OPEN }]
  };

  // Erinnerungen: nur solche, die noch in der Zukunft liegen. Sie vibrieren VON
  // SELBST, ohne dass die App laeuft - das ist der eigentliche Gewinn der Pins.
  var now = Date.now();
  var rem = [];
  REMIND_BEFORE_MIN.forEach(function (m) {
    var t = d - m * 60000;
    if (t <= now) return;
    var wie = (m >= 60) ? ((m / 60) + ' ' + T('hrs')) : (m + ' ' + T('min'));
    rem.push({
      time: isoOf(t),
      layout: {
        type: 'genericReminder',
        title: String(code) + '  ' + T('inn') + ' ' + wie,
        tinyIcon: PIN_ICON,
        body: (gate ? gate + '\n' : '') + route
      }
    });
  });
  if (rem.length) pin.reminders = rem;

  if (isNew) {
    pin.createNotification = {
      layout: {
        type: 'genericNotification',
        title: String(code) + '  ' + T('newflight'),
        tinyIcon: PIN_ICON,
        body: route + '   ' + body.split('\n')[0]
      }
    };
  }
  // DAS ist die Benachrichtigung bei Aenderungen, und sie kommt ohne laufende
  // App an: die Uhr meldet sich, sobald der geaenderte Pin eintrifft.
  if (changes && changes.length) {
    pin.updateNotification = {
      time: isoOf(now),
      layout: {
        type: 'genericNotification',
        title: String(code) + '  ' + T('changed'),
        tinyIcon: PIN_ICON,
        body: changes.join('\n')
      }
    };
  }
  return pin;
}

function pinViaRest(pin, token, cb) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () { cb(this.status >= 200 && this.status < 300, 'REST ' + this.status); };
  xhr.onerror = function () { cb(false, 'REST Netzwerkfehler'); };
  xhr.open('PUT', TIMELINE_API + pin.id);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('X-User-Token', '' + token);
  xhr.send(JSON.stringify(pin));
}

function pinViaLocal(pin, cb) {
  try {
    if (Pebble.insertTimelinePin.length >= 3) {
      Pebble.insertTimelinePin(pin, function () { cb(true, 'lokal'); },
                               function (e) { cb(false, 'lokal ' + e); });
    } else {
      Pebble.insertTimelinePin(pin);
      cb(true, 'lokal synchron');
    }
  } catch (e) { cb(false, 'lokal ' + e); }
}

// Pin nur senden, wenn sich sein INHALT geaendert hat. Ohne diese Sperre ginge
// bei jeder Auffrischung derselbe Pin erneut hinaus - und mit ihm jedes Mal die
// Aenderungsmeldung, obwohl sich nichts geaendert hat.
function pushPin(code, av, oOff, dOff, changes) {
  if (!av) return;
  var store = pinStore();
  var id = pinId(code, av);
  var had = store[id];
  var pin = buildFlightPin(code, av, oOff, dOff, changes, !had);
  if (!pin) return;
  var sig = JSON.stringify([pin.time, pin.layout.subtitle, pin.layout.body, PIN_VERSION]);
  if (had && had.sig === sig && !(changes && changes.length)) return;

  function done(ok, how) {
    console.log('timeline: ' + id + ' ' + (ok ? 'gesendet' : 'FEHLGESCHLAGEN') + ' (' + how + ')');
    if (!ok) return;
    store[id] = { sig: sig, sentAt: Date.now() };
    pinStoreSave(store);
  }
  if (typeof Pebble.getTimelineToken !== 'function') {
    if (typeof Pebble.insertTimelinePin === 'function') pinViaLocal(pin, done);
    else console.log('timeline: kein Weg zur Timeline');
    return;
  }
  Pebble.getTimelineToken(function (token) {
    pinViaRest(pin, token, done);
  }, function (err) {
    console.log('timeline: kein Token (' + err + ')');
    if (typeof Pebble.insertTimelinePin === 'function') pinViaLocal(pin, done);
  });
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
    // Wann die Uhr sich das naechste Mal selbst wecken soll, in Sekunden seit
    // 1970. 0 heisst: nicht mehr wecken, -1 heisst: Plan unveraendert lassen.
    // Rechnen muss das die Telefonseite, weil nur sie die echten Zeitzonen
    // beider Flughaefen kennt.
    NEXT_WAKE: b.wake,
    // Leer, wenn sich nichts geaendert hat.
    CHANGE: b.change,
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
  // Selbstwecken. Aus heisst: die Uhr sieht nur nach, wenn du die App oeffnest.
  // Die Pins und ihre Erinnerungen bleiben davon unberuehrt - die brauchen kein
  // Wecken, sie liegen schon in der Timeline.
  if (dict.WATCH_FLIGHT !== undefined) s.watch = !!dict.WATCH_FLIGHT.value;
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
