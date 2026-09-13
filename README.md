# Flynformer

Flugverfolgung für Pebble (Emery, Flint, Gabbro). Flugnummer in der Telefon-App
hinterlegen, und die Uhr zeigt Status, Zeiten, Gate, Terminal, Flugzeug,
Strecke und das Wetter am Ziel — auf sechs Seiten, die man mit Hoch und Runter
durchblättert.

Farbschema Amber auf Schwarz im Stil einer Abflugtafel, Gliederung wie ein
Pebble-Timeline-Pin. Die Oberfläche folgt der **Sprache der Uhr** (Deutsch und
Englisch, Englisch als Rückfall).

## Der Kern der Sache: ein Abruf reicht

Flugdaten kosten Geld. Der kostenlose Tarif von
[aviationstack](https://aviationstack.com) erlaubt **100 Abfragen im Monat** —
gut drei pro Tag. Deshalb ist die App darauf gebaut, damit hauszuhalten:

| Seite | Inhalt | Quelle | Kosten |
|---|---|---|---|
| 1 Übersicht | Status, Route, Countdown | aviationstack | **1 Abfrage** |
| 2 Zeiten | Plan- und Neuzeiten, Verspätung | dieselbe Antwort | 0 |
| 3 Gate | Terminal, Gate, Gepäckband | dieselbe Antwort | 0 |
| 4 Flugzeug | Kennzeichen, Muster, Halter | [hexdb.io](https://hexdb.io) | 0 |
| 5 Strecke | Distanz, Flugzeit, GPS-Abstand | [adsbdb](https://api.adsbdb.com) | 0 |
| 6 Ziel | Wetter und Ortszeit | [Open-Meteo](https://open-meteo.com) | 0 |

Der Trick liegt in Seite 4: aviationstack liefert das Kennzeichen zwar nicht,
wohl aber den **Mode-S-Hex** des Flugzeugs — und damit beantworten hexdb und
adsbdb den Rest kostenlos. Gemessen an 20 Zürcher Abflügen ist
`aircraft.registration` zu 0 % gefüllt, `aircraft.icao24` dagegen zu 100 %.

Zwei Folgen für die Bedienung:

- **Kein automatisches Nachladen.** Aktualisiert wird nur mit der Mitteltaste.
  Beim Öffnen steht sofort der gespeicherte Stand da, mit seinem Alter in der
  Fusszeile.
- **Ein Zähler.** Die Fusszeile zeigt immer, wie viele Abfragen dieser Monat
  gekostet hat. Bei 100 im Monat gehört das ins Bild.

## Einrichten

1. In der Pebble-App auf dem Telefon: **Flynformer → Einstellungen**.
2. Eigenen aviationstack-Schlüssel eintragen (kostenloses Konto genügt).
3. Bis zu drei Flugnummern hinterlegen, wie auf dem Ticket: `LH400`, `LX100`.
4. Einheiten wählen, metrisch oder imperial.

Der **Schlüssel bleibt auf dem Telefon**. Er wird im localStorage der
Telefon-App abgelegt, nie an die Uhr geschickt und steht nicht im Quelltext —
sonst läge er in diesem öffentlichen Repository für jeden lesbar.

## Bedienung

| Taste | Aktion |
|---|---|
| Oben / Unten | Seite wechseln |
| Mitte | aktualisieren — **kostet eine Abfrage** |
| Zurück | beenden |

Beim Start fliegt einmal ein Flugzeug aus der Tiefe nach vorn und oben aus dem
Bild, dann steht die Seite da. Beim Aktualisieren läuft die Animation
bewusst nicht — dreimal am Tag ist sie Freude, bei jedem Tastendruck Ballast.

## Das Flugzeug

Von vorn gesehen, gezeichnet als vier geschlossene Polygone: Höhenleitwerk,
Hauptumriss mit 18 Punkten, zwei Triebwerksgondeln. Kein Bitmap — nur deshalb
kann es beim Anflug vom Achtzigstel auf das Vierfache wachsen, ohne zu treppen.
Erst die Triebwerke machen aus der Silhouette ein Verkehrsflugzeug.

Die Zeichenreihenfolge ist wesentlich: Höhenleitwerk zuerst (es liegt hinten),
dann der Hauptumriss darüber, zuletzt die Triebwerke.

Auf `flint` gibt es kein Amber. Dort ist das Kopfband weiss mit schwarzer
Schrift, und die Flugzeugkontur wird weiss auf schwarzem Grund — dasselbe
Verhältnis ohne Farbe.

## Was diese App nicht kann

Ehrlicher als es zu verschweigen:

- **Keine Aktualisierung im Hintergrund.** PebbleKit JS läuft nur, solange die
  App auf der Uhr läuft, und wird beim Beenden gestoppt. Ohne eigenen Server
  gibt es kein stilles Nachladen.
- **Keine Sitzzahl.** aviationstack liefert sie nicht, und die freien
  Flugzeugdatensätze haben sie für 2,5 % der Muster — und dann als *zertifizierte
  Maximalkapazität*, nicht als Bestuhlung der Airline.
- **Keine Verspätungsvorhersage.** Frei verfügbar gibt es nur den aktuellen
  US-Zustand (FAA), nichts für Europa und keine Prognose.
- **Ankunfts-Gate und Gepäckband fehlen oft.** Bei 20 gemessenen Zürcher
  Abflügen war das Ankunftsterminal zu 30 % gefüllt, das Gepäckband zu 50 %.
  Fehlende Angaben zeigt die App als `?`, damit man sieht, dass die Angabe
  fehlt und nicht die App.

## Eine Eigenheit von aviationstack, die man kennen muss

Die Zeitstempel sehen aus wie UTC, sind aber **Ortszeiten**:

```
"scheduled": "2026-09-13T10:55:00+00:00"   ← FRA, in Wahrheit 10:55 MESZ
"scheduled": "2026-09-13T13:35:00+00:00"   ← JFK, in Wahrheit 13:35 EDT
```

Für die Anzeige ist das gleichgültig — man will ohnehin die Ortszeit sehen.
Falsch wird alles, was man daraus **rechnet**: als UTC gelesen ergäbe
Frankfurt–New York 2 h 40 Flugzeit statt 8 h 40, und der Countdown zeigte auf
einen längst vergangenen Start.

Die echten UTC-Versätze beider Flughäfen kommen deshalb aus demselben
Open-Meteo-Abruf, der ohnehin für das Wetter läuft: ein Aufruf, zwei
Koordinaten, 780 Byte, kostenlos.

## Werkzeuge

```bash
node tools/pkjs_pages_test.js          # alle sechs Seiten, deutsch
FN_LANG=en node tools/pkjs_pages_test.js   # dasselbe auf englisch
node tools/strings_check.js            # prüft src/c/strings_table.h
```

`pkjs_pages_test.js` lädt die Telefonseite in einen Sandkasten mit gestubbtem
Pebble, localStorage und XMLHttpRequest, beantwortet jede Netzanfrage aus
aufgezeichneten Dateien in `tools/fixtures/` und druckt aus, was auf der Uhr
stünde. Ohne Emulator, ohne Telefon und **ohne Kontingent zu verbrauchen**. Die
Beispieldaten sind eine echte Messung von LH400 (Frankfurt–New York, Airbus
A340-642 D-AIHZ) vom 13.09.2026.

## Sprachen

Alle Texte der Uhr stehen in `src/c/strings_table.h`, eine Zeile je Text mit
den Spalten `en` und `de`. Die Datei wird zweimal eingebunden (X-Makro) — eine
Zeile mit einer Spalte zu wenig ist deshalb ein Präprozessorfehler.

Der Löwenanteil der Oberfläche wird jedoch **auf dem Telefon** gebaut, weil die
Uhr fertige Kurzzeilen bekommt und nie JSON. Die Übersetzung dieser Texte liegt
darum in `src/pkjs/index.js` in der Tabelle `TXT`. Welche Spalte gilt, sagt die
Uhr mit jeder Anfrage über `MESSAGE_KEY_LANG`.

## Bauen

```bash
# Quellen nach WSL spiegeln und bauen
cp -r src package.json wscript ~/flynformer/
cd ~/flynformer && pebble build && pebble install --emulator emery
```

Einmalig nötig: `pebble package install @rebble/clay` im Bauverzeichnis (die
Konfigurationsseite). `node_modules/` gehört nicht ins Repository.

Auf die echte Uhr: Developer Connection in der Telefon-App aktivieren, dann
`pebble install --phone <IP>`.

Werkzeuge: pebble-tool 5.0.40, SDK 4.33.1.

## Herkunft

Eigenentwicklung. Anlass war eine kostenpflichtige App im Pebble-Appstore;
übernommen wurde nur die Idee, welche Angaben zu einem Flug nützlich sind —
kein Code, keine Gestaltung, kein Name. Der Entwurf, das Flugzeug und die
Auswahl der Datenquellen sind eigen.

Datenquellen: aviationstack (Flugstatus, eigener Schlüssel nötig), hexdb.io und
adsbdb (Flugzeug und Route, kostenlos), Open-Meteo (Wetter, CC BY 4.0).
