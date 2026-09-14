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

## Timeline und Meldungen

Der Flug steht als **Pin in der Timeline**, mit Gate, Terminal und beiden
Zeiten. Der Pin trägt zwei **Erinnerungen** — zwei Stunden und eine halbe Stunde
vor dem Abflug. Die vibrieren **von selbst**, ohne dass die App läuft; das ist
der eigentliche Grund, warum die Pins mehr wert sind als jedes Pollen.

Ändert sich etwas, geht der Pin mit einer `updateNotification` erneut hinaus,
und die Uhr meldet sich — auch wenn die App längst zu ist. Gemeldet werden:

| | |
|---|---|
| Status | annulliert, umgeleitet, Zwischenfall, gestartet, gelandet |
| Gate | am Abflug und an der Ankunft |
| Terminal | schwerer als ein Gate-Wechsel: anderes Gebäude |
| Zeiten | erst ab fünf Minuten Verschiebung |
| Gepäckband | sobald es zugeteilt ist |

Countdown und Fortschritt stehen bewusst **nicht** auf dieser Liste. Die ändern
sich bei jedem Abruf und wären keine Nachricht, sondern Lärm.

Der Pin hat eine feste Kennung aus Flugnummer und Flugtag. Ein erneutes Senden
überschreibt ihn also, statt einen zweiten anzulegen — und er geht nur hinaus,
wenn sich sein Inhalt wirklich geändert hat. Ohne diese Sperre erschiene die
Änderungsmeldung bei jeder Auffrischung.

## Selbst nachsehen — und was es kostet

Auf Wunsch sieht die Uhr vor dem Abflug selbst nach:

| Wann | Wie oft |
|---|---|
| mehr als 3 h vorher | gar nicht |
| 3 h bis 1 h vorher | stündlich |
| letzte Stunde | alle 20 Minuten |
| nach dem Abflug | einmal bei der Landung, dann Schluss |

Das sind rund **acht Abfragen je Flug**, also gut zwölf Flüge im Monat.

**Ein Vorbehalt, der nicht wegzudiskutieren ist:** Pebble kennt keinen stillen
Hintergrundlauf. Der Header sagt wörtlich *„schedule to be launched"* — ein
Wakeup **startet die App**, im Vordergrund. Der einzige echte Hintergrundprozess
(Worker) kann kein AppMessage und erreicht das Telefon gar nicht. Bei jedem
Nachsehen springt Flynformer also kurz vor das Zifferblatt und verschwindet
wieder. Genau deshalb wird nur nahe am Abflug geweckt, und genau deshalb
beendet sich die App sofort, sobald sie nichts Meldenswertes gefunden hat.

Wem das zu viel ist, schaltet *Selbst nachsehen* in den Einstellungen aus. Die
Pins und ihre Erinnerungen bleiben davon unberührt — die brauchen kein Wecken.

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
einer Eingabe und beim Aktualisieren. Kommen die Daten früher an, fliegt er
trotzdem zu Ende; dauert es länger, steht danach «Lade…» in der Fusszeile.

Der Weg ist ein **Bogen**: das Flugzeug taucht als Punkt am oberen Rand auf,
wächst gleichmässig, zieht dabei nach unten durch die Bildmitte und steigt gross
wieder nach oben aus dem Bild — so, wie eine Maschine über einen hinwegzieht.
Als Formel `y = h · (3,35u − 4,7u²)`, mit `u` als Fortschritt von 0 bis 1: bei
`u = 0` am oberen Rand, bei `u = 0,36` am tiefsten Punkt knapp unter der Mitte,
bei `u = 1` eineinhalb Bildhöhen darüber. Die Grösse wächst gleichmässig durch,
ohne Beschleunigung: das Ruhige an der Bewegung ist das Wachsen, die Kurve macht
der Weg.

Der Hub von 1,35 Bildhöhen ist nicht gegriffen: seit die Gondeln an Pylonen
tiefer hängen, liegt die Unterkante bei 87 von 100 Rastereinheiten. Bei
dreifacher Bildbreite sind das gut ein Drittel der Grösse unter der Mitte — mit
nur einer Bildhöhe blieben sie am Ende sichtbar im Bild hängen.

**Beim Öffnen fliegt nichts und kostet nichts.** Da steht sofort der gespeicherte
Stand mit seinem Alter. Das ist Absicht: ein Anflug beim Start hiesse, dass
geholt wird, und Holen kostet eine der 100 Abfragen — viermal am Tag hinsehen
wäre das Kontingent in 25 Tagen.

## Das Flugzeug

Nach einer Handzeichnung gebaut, als **gefüllte Fläche** aus Polygonen und
Kreisen — kein Bitmap, nur deshalb kann es beim Anflug vom Punkt auf das
Dreifache der Bildbreite wachsen, ohne zu treppen.

Was die Zeichnung vorgibt:

- **Sechseckiger Rumpf.** Kantig, nicht rund: flache Oberkante, zwei kurze
  Schultern nach aussen, zwei lange Flanken auf eine flache Unterkante.
- **Waagrechte Flügel.** Lange dünne Balken fast über die volle Breite, ohne
  V-Stellung.
- **Triebwerke an Pylonen.** Sie hängen an einem sichtbaren Steg deutlich unter
  dem Flügel, statt mit ihm zu verschmelzen. Erst dadurch darf die Gondel ihren
  dunklen Rand behalten: sie liegt nicht mehr über dem Flügel und kann ihn nicht
  mehr durchtrennen — was sie in einem früheren Entwurf tat, mit einem Stummel
  innen und einem abgetrennten Balken aussen.
- **Ein Gesicht.** Zwei quadratische Fenster mit dunklen Pupillen und ein breites
  V darunter. Das ist der Unterschied zwischen Flugzeug und
  Zeichentrickflugzeug, und eine Fläche mit Aussparungen liest sich auf dem
  kleinen Schirm schneller als jede Strichzeichnung.

Unterhalb von 70 Pixeln Grösse bleiben die Feinheiten weg — Mittellinie der
Finne und die inneren Augenlagen. Klein gezeichnet würde daraus nur Matsch, und
der Anflug beginnt bei wenigen Pixeln.

Zeichenreihenfolge von hinten nach vorn: Leitwerk, Flügel, Pylone, Gondeln, dann
der Rumpf darüber — so läuft seine Kontur sauber vor den Flügelwurzeln durch,
wie in der Zeichnung. Das Gesicht zuletzt.

Auf `flint` gibt es kein Amber. Dort ist das Kopfband weiss mit schwarzer
Schrift, und das Flugzeug wird eine weisse Fläche mit schwarzen Aussparungen —
dasselbe Verhältnis ohne Farbe.

## Was diese App nicht kann

Ehrlicher als es zu verschweigen:

- **Kein stiller Hintergrundlauf.** PebbleKit JS läuft nur, solange die App
  läuft. Ein Wakeup kann sie zwar starten und dabei Daten holen — aber er
  startet sie sichtbar, vor dem Zifferblatt. Ohne eigenen Server gibt es kein
  lautloses Nachladen.
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
node tools/pkjs_alert_test.js          # Pins, Meldungen, Weckplan
node tools/pkjs_phase_test.js          # der Statusschirm in allen Flugphasen
node tools/pkjs_quota_test.js          # was kostet was
node tools/pkjs_pages_test.js          # alle sechs Seiten, deutsch
FN_LANG=en node tools/pkjs_pages_test.js   # dasselbe auf englisch
node tools/strings_check.js            # prüft src/c/strings_table.h
```

`pkjs_alert_test.js` nagelt die drei Dinge fest, die etwas kosten, wenn sie
falsch sind: den Weckplan (jedes Aufwachen kostet eine Abfrage), die
Änderungserkennung (wer Countdowns mitvergleicht, meldet bei jedem Abruf etwas)
und den Pin (einer, der bei jeder Auffrischung erneut hinausgeht, meldet jedes
Mal eine Änderung, die keine ist). Dass er wirklich fängt, wurde geprüft, indem
die Sperren versuchsweise zurückgebaut wurden.

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
