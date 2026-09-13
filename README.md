# Flynformer

Flugverfolgung für Pebble (Emery, Flint, Gabbro). Flugnummer **auf der Uhr**
eintippen, ein Flugzeug fliegt heran, während die Daten kommen — und dann steht
da, **was gerade zählt**: am Gate die Gate-Nummer, unterwegs der Fortschritt,
nach der Landung das Gepäckband. Wer mehr will, blättert mit Hoch und Runter
durch vier weitere Seiten.

Farbschema Amber auf Schwarz im Stil einer Abflugtafel, Gliederung wie ein
Pebble-Timeline-Pin. Die Oberfläche folgt der **Sprache der Uhr** (Deutsch und
Englisch, Englisch als Rückfall).

## Der Kern der Sache: ein Abruf reicht

Flugdaten kosten Geld. Der kostenlose Tarif von
[aviationstack](https://aviationstack.com) erlaubt **100 Abfragen im Monat** —
gut drei pro Tag. Deshalb ist die App darauf gebaut, damit hauszuhalten:

| Seite | Inhalt | Quelle | Kosten |
|---|---|---|---|
| 1 Status | was in dieser Flugphase zählt | aviationstack | **1 Abfrage** |
| 2 Zeiten | Plan- und Neuzeiten, Verspätung | dieselbe Antwort | 0 |
| 3 Gate | Terminal, Gate, Gepäckband | dieselbe Antwort | 0 |
| 4 Strecke | Distanz, Flugzeit, GPS-Abstand | [adsbdb](https://api.adsbdb.com) | 0 |
| 5 Ziel | Wetter und Ortszeit | [Open-Meteo](https://open-meteo.com) | 0 |

Eine einzige bezahlte Antwort trägt die ersten drei Seiten; Strecke, Wetter und
die beiden Zeitzonen kommen aus kostenlosen Quellen.

Zwei Folgen für die Bedienung:

- **Kein automatisches Nachladen.** Aktualisiert wird nur mit der Mitteltaste.
  Beim Öffnen steht sofort der gespeicherte Stand da, mit seinem Alter in der
  Fusszeile.
- **Ein Zähler.** Die Fusszeile zeigt immer, wie viele Abfragen dieser Monat
  gekostet hat. Bei 100 im Monat gehört das ins Bild.

## Der Statusschirm

Die erste Seite hat keinen festen Inhalt. Sie zeigt, was in der Phase zählt, in
der der Flug gerade steckt — und sonst nichts. Die Phase rechnet die Telefonseite
aus den Zeiten aus, weil nur sie die echten Zeitzonen beider Flughäfen kennt.

| Phase | Wann | Was gross dasteht | Was noch |
|---|---|---|---|
| Geplant | mehr als 50 min vor dem Abflug | Countdown | Abflugzeit, Gate falls bekannt |
| Boarding | ab 50 min vor dem Abflug | **Gate** | Terminal, Abflug, Countdown |
| Gestartet | erste 20 min in der Luft | Ankunftszeit | Abflug, Verspätung |
| Im Flug | dazwischen | Restzeit | **Fortschrittsbalken**, Ankunft |
| Landeanflug | letzte 30 min | Countdown | Ankunfts-Gate, Gepäckband |
| Angekommen | gelandet | Landezeit | Gate, Gepäckband |

Der Fortschritt ist eine Kette aus zwölf Kästchen, keine glatte Füllkante: auf
einem kleinen Schirm liest sich «sieben von zwölf» auf einen Blick, eine Kante
muss man schätzen. Er erscheint **nur im Reiseflug** — am Gate wäre ein Balken
bei 0 % keine Auskunft, sondern eine Irreführung.

Höchstens vier Angaben je Phase, mit Balken drei. Das ist keine Vorliebe,
sondern das, was auf `flint` zwischen Kopfband und Fusszeile passt; eine fünfte
Zeile lief in die Fusszeile hinein. Verspätung hängt darum als `+13` an der
Zeit, statt eine eigene Zeile zu belegen.

## Einrichten

**Einmal am Telefon**, in der Pebble-App unter *Flynformer → Einstellungen*:
eigenen aviationstack-Schlüssel eintragen (kostenloses Konto genügt) und
Einheiten wählen. Der Schlüssel gehört dorthin, weil 32 Zeichen auf der Uhr
einzutippen eine Strafe wäre.

**Alles Weitere auf der Uhr.** Beim ersten Start fragt sie nach der Flugnummer:
zweistelliges Kürzel, bis zu vier Ziffern. Hoch und Runter ändern die gewählte
Stelle, Mitte rückt weiter, auf der letzten Stelle bestätigt Mitte. Zurück geht
eine Stelle zurück statt gleich die halbe Eingabe zu verwerfen.

Das Kürzel darf eine Ziffer enthalten — `U2` ist easyJet, `W6` Wizz Air. Die
beiden ersten Stellen laufen deshalb durch A–Z **und** 0–9.

Es ist immer **genau ein Flug** aktiv, und er bleibt gespeichert, bis du ihn
änderst — ein langer Druck auf die Mitteltaste öffnet die Eingabe wieder, mit
der bisherigen Nummer vorbelegt.

Der **Schlüssel bleibt auf dem Telefon**. Er wird im localStorage der
Telefon-App abgelegt, nie an die Uhr geschickt und steht nicht im Quelltext —
sonst läge er in diesem öffentlichen Repository für jeden lesbar.

## Bedienung

| Taste | Aktion |
|---|---|
| Oben / Unten | Seite wechseln |
| Mitte | aktualisieren — **kostet eine Abfrage** |
| Mitte lang | Flugnummer ändern |
| Zurück | beenden |

**Der Anflug ist die Ladeanzeige.** Er läuft, wenn Daten geholt werden — nach
einer Eingabe und beim Aktualisieren: das Flugzeug fliegt aus der Tiefe nach vorn
und oben aus dem Bild und gibt die Seite frei. Kommen die Daten früher an, fliegt
es trotzdem zu Ende; dauert es länger, steht danach «Lade…» in der Fusszeile.

Wachsen und Steigen liegen dabei auf **derselben** Kurve. Vorher wuchs die Grösse
quadratisch, die Höhe aber kubisch, also deutlich später: das Flugzeug wurde erst
riesig und wurde dann nach oben gerissen, wobei seine Unterkante ein zweites Mal
durchs Bild fuhr — es sah aus, als flöge gleich noch eines hinterher.

**Beim Öffnen fliegt nichts und kostet nichts.** Da steht sofort der gespeicherte
Stand mit seinem Alter. Das ist Absicht: ein Anflug beim Start hiesse, dass
geholt wird, und Holen kostet eine der 100 Abfragen — viermal am Tag hinsehen
wäre das Kontingent in 25 Tagen.

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
- **Nichts zum Flugzeug selbst.** Kennzeichen, Muster und Halter waren einmal
  eine eigene Seite. Sie ist entfallen: am Gate will niemand wissen, welcher
  Airbus da steht, und der Umweg über den Mode-S-Hex kostete Zeit vor der ersten
  Anzeige.
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
node tools/pkjs_phase_test.js          # der Statusschirm in allen Flugphasen
node tools/pkjs_quota_test.js          # was kostet was
node tools/pkjs_pages_test.js          # alle sechs Seiten, deutsch
FN_LANG=en node tools/pkjs_pages_test.js   # dasselbe auf englisch
node tools/strings_check.js            # prüft src/c/strings_table.h
```

`pkjs_phase_test.js` stellt die Uhr statt den Flug: dieselbe aufgezeichnete
Antwort wird sechsmal ausgewertet — vier Stunden vor dem Abflug, am Gate, kurz
nach dem Start, auf halber Strecke, im Anflug und nach der Landung. Geprüft wird,
dass die Phase stimmt, der Fortschritt nur unterwegs von Null verschieden ist und
keine Zeile zu lang wird.

`pkjs_quota_test.js` bewacht das Monatskontingent. Es hält fest, dass ein
App-Start nichts kostet, die Mitteltaste genau eine Abfrage, Blättern wieder
nichts, und dass der Rücksetz-Schalter den Zähler nur beim Umlegen nullt. Drei
Fehler, die genau dort sassen, haben es veranlasst — und dass es sie wirklich
fängt, wurde geprüft, indem die Korrekturen versuchsweise zurückgebaut wurden.

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

Datenquellen: aviationstack (Flugstatus, eigener Schlüssel nötig), adsbdb (Strecke und Koordinaten, kostenlos), Open-Meteo (Wetter, CC BY 4.0).
