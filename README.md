# Flynformer

<img src="store/flyn-emery.gif" width="200" alt="Flyn im Anflug">

Flugverfolgung für Pebble (Emery, Flint, Gabbro). Flugnummer **auf der Uhr**
eintippen, ein Flugzeug fliegt heran, während die Daten kommen — und dann steht
da, **was gerade zählt**: am Gate die Gate-Nummer, unterwegs der Fortschritt,
nach der Landung das Gepäckband. Wer mehr will, blättert mit Hoch und Runter
durch vier weitere Seiten.

Orange auf Weiss — hell, nicht düster: man fliegt schliesslich in den Urlaub.
Die Oberfläche folgt der **Sprache der Uhr** (Deutsch und Englisch, Englisch als
Rückfall).

Dass der Grund hell ist, hat einen Grund über den Geschmack hinaus: das
Pebble-Display **leuchtet nicht, es reflektiert**. Ein heller Grund ist im
Sonnenlicht deutlich besser lesbar als ein dunkler — und genau das ist die Lage
am Gate.

## Der Kern der Sache: ein Abruf reicht

Flugdaten kosten Geld. Der kostenlose Tarif von
[aviationstack](https://aviationstack.com) erlaubt **100 Abfragen im Monat** —
gut drei pro Tag. Deshalb ist die App darauf gebaut, damit hauszuhalten:

| Seite | Inhalt | Quelle | Kosten |
|---|---|---|---|
| 1 Vor dem Flug | Gate, Terminal, Abflug, Countdown | aviationstack | **1 Abfrage** |
| 2 Im Flug | Restzeit, Fortschritt, Ankunft | dieselbe Antwort | 0 |
| 3 Am Ziel | Wetter, Ortszeit, Gepäckband | [Open-Meteo](https://open-meteo.com) + dieselbe Antwort | 0 |

Eine einzige bezahlte Antwort trägt alle drei Seiten; Strecke, Wetter und die
beiden Zeitzonen kommen aus kostenlosen Quellen.

Zwei Folgen für die Bedienung:

- **Kein automatisches Nachladen.** Aktualisiert wird nur mit der Mitteltaste.
  Beim Öffnen steht sofort der gespeicherte Stand da, mit seinem Alter in der
  Fusszeile.
- **Ein Zähler.** Die Fusszeile zeigt immer, wie viele Abfragen dieser Monat
  gekostet hat. Bei 100 im Monat gehört das ins Bild.

## Drei Seiten, geordnet wie die Reise

Vorher waren es fünf Seiten, sortiert nach Datenquelle — das ist die Ordnung des
Programmierers, nicht die des Reisenden. Jetzt sind es drei, und sie folgen dem
Ablauf:

| Seite | Was gross dasteht | Was noch |
|---|---|---|
| **Vor dem Flug** | Gate | Terminal, Abflugzeit, Countdown, Verspätung |
| **Im Flug** | Restzeit | **Fortschrittsbalken**, Ankunft, Flugzeit |
| **Am Ziel** | Temperatur | Wetter, Ortszeit, Gepäckband, Ankunfts-Gate |

Die App öffnet auf der Seite, die zur aktuellen Flugphase passt — am Gate also
auf der ersten, unterwegs auf der zweiten. Das geschieht **einmal je App-Start**:
wer danach blättert, wird nicht zurückgeworfen, sobald die nächste Antwort
eintrifft. Geblättert wird mit Hoch und Runter durch alle drei.

Das **Kopfband** ist auf eine Zeile geschrumpft, auf emery von 60 auf 34 Pixel —
von einem Viertel der Bildhöhe auf ein Siebtel. Links die Flugnummer, rechts die
Flugphase. Welche Seite man liest, sagen die Marken an der Seitenleiste; was
gerade passiert, ist die nützlichere Auskunft. Auf dem runden Schirm stehen die
beiden untereinander, weil der Kreis die Ränder abschneiden würde.

Der **Fortschritt** ist eine Kette aus zwölf Kästchen, keine glatte Füllkante:
auf einem kleinen Schirm liest sich «fünf von zwölf» auf einen Blick, eine Kante
muss man schätzen. Er erscheint nur im Reiseflug — am Gate wäre ein Balken bei
0 % keine Auskunft, sondern eine Irreführung. Solange er steht, entfällt die
Distanz: auf `flint` stiess die fünfte Angabe sonst in die Fusszeile.

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

Der Weg ist ein **Bogen**: Flyn taucht als Punkt am oberen Rand auf, wächst
gleichmässig, zieht nach unten durch die Bildmitte und verlässt das Bild zuletzt
oben **rechts** — dabei legt er sich in die Kurve, bis zu 28 Grad. Die Drift zur
Seite hängt an `u⁴`, bleibt also lange bei null und schwenkt erst zum Schluss;
mit einer flacheren Kurve zöge er schon durch die Bildmitte zur Seite, statt sie
zu treffen.

Hinter ihm eine **Staubfahne**. Die Wölkchen werden nicht geschätzt: für jedes
wird dieselbe Bahnformel mit einem früheren Zeitpunkt gerechnet, sie sitzen also
genau dort, wo Flyn vorhin war. Ihr Radius hängt an seiner damaligen Grösse und
schrumpft mit dem Alter — ausblenden kann die Uhr nicht, es gibt keine
Halbtransparenz. Sichtbar wird die Fahne erst im letzten Drittel, und das ist
richtig so: solange Flyn frontal auf einen zukommt, liegt seine Spur hinter ihm.
Als Formel `y = h · (2,9u − 3,8u²)`, mit `u` als Fortschritt von 0 bis 1: bei
`u = 0` am oberen Rand, bei `u = 0,38` am tiefsten Punkt knapp unter der Mitte,
bei `u = 1` knapp eine Bildhöhe darüber. Die Grösse wächst gleichmässig durch,
ohne Beschleunigung: das Ruhige an der Bewegung ist das Wachsen, die Kurve macht
der Weg.

Der Hub hängt an der Unterkante des Flugzeugs, und die wanderte mit jedem
Entwurf: mit Pylonen lag sie bei 87 von 100 Rastereinheiten und brauchte 1,35
Bildhöhen, ohne sie bei 75 und braucht 0,90. Zu viel Hub ist nicht falsch, aber
dann ist das Flugzeug längst draussen, während die Animation noch läuft — und
der Schirm steht die letzte Zehntelsekunde leer.

**Beim Öffnen fliegt nichts und kostet nichts.** Da steht sofort der gespeicherte
Stand mit seinem Alter. Das ist Absicht: ein Anflug beim Start hiesse, dass
geholt wird, und Holen kostet eine der 100 Abfragen — viermal am Tag hinsehen
wäre das Kontingent in 25 Tagen.

## Das Flugzeug

Nach einer Handzeichnung gebaut, als **gefüllte Fläche** aus Polygonen und
Kreisen — kein Bitmap, nur deshalb kann es beim Anflug vom Punkt auf das
Dreifache der Bildbreite wachsen, ohne zu treppen.

Was die Zeichnung vorgibt:

- **Gedrungener Rumpf mit gebrochenen Ecken.** Ein Zwölfeck, 40 breit und 48
  hoch. Der erste Entwurf stand mit 36 zu 52 hochkant und zog damit das Gesicht
  in die Länge.
- **Waagrechte Flügel.** Lange dünne Balken fast über die volle Breite, ohne
  V-Stellung.
- **Triebwerke ohne Pylone, dicht am Flügel.** Die Stege waren zwei dünne
  Striche, die nichts erklärten und auf 144 Pixeln nur Unruhe machten. Die
  Gondel überlappt den Flügel jetzt, statt ihn nur zu berühren — bei blosser
  Berührung legen sich die dunkle Flügelkante und der dunkle Gondelrand
  nebeneinander und lesen sich als Spalt. Gezeichnet wird sie **nach** dem
  Flügel, liegt also davor: so, wie das Triebwerk einer echten Maschine vor der
  Flügelvorderkante sitzt.
- **Ein Gesicht.** Zwei quadratische Fenster mit dunklen Pupillen und darunter
  ein flaches, weites Lächeln. Es folgt dem Glas aus Drinktervall: dort ist der
  Mund eine offene Polylinie, 23 Einheiten breit und nur 3 tief. Hier sind es 24
  zu 4, also dasselbe Verhältnis. Vorher war er 18 breit und 14 tief und las
  sich damit als Schnabel.

  Zwei Unterschiede zur Vorlage, beide mit Grund: das Glas zieht einen **Strich**,
  weil es selbst hell mit dunkler Kontur ist — hier wird der Mund in eine Fläche
  geschnitten und braucht deshalb Dicke. Und die Zwischenpunkte machen aus dem
  Knick einen Bogen; ein gezogener Strich rundet an der Ecke von selbst.

Unterhalb von 70 Pixeln Grösse bleiben die Feinheiten weg — Mittellinie der
Finne und die inneren Augenlagen. Klein gezeichnet würde daraus nur Matsch, und
der Anflug beginnt bei wenigen Pixeln.

Zeichenreihenfolge von hinten nach vorn: Leitwerk, Flügel, Pylone, Gondeln, dann
der Rumpf darüber — so läuft seine Kontur sauber vor den Flügelwurzeln durch,
wie in der Zeichnung. Das Gesicht zuletzt.

**Flyn ist weiss** — und weil der Seitengrund ebenfalls weiss ist, läuft der
Anflug auf einem orangen Feld. Sonst bliebe von ihm nur der Umriss, also wieder
eine Strichzeichnung. Der Farbwechsel macht den Anflug zugleich als Ladeanzeige
kenntlich: orange heisst, es wird geholt.

Auf `flint` gibt es kein Orange. Dort ist das Kopfband schwarz mit weisser
Schrift auf weissem Grund, und der Anflug läuft auf schwarzem Feld — dasselbe
Verhältnis ohne Farbe.

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

Auf GitHub baut jeder Push auf `main` die pbw neu, checkt sie ein und legt zu
einer neuen Fassung in `package.json` ein Release an — wie bei den
Schwesterapps (`.github/workflows/bauen.yml`). Die Notizen kommen aus
`.github/release/<fassung>.md`.

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

## Store-Symbole

Der Appstore nimmt **nichts aus der `.pbw`**. Das `menuIcon` darin ist das
Symbol im Starter der Uhr; für die Store-Liste liegen im Entwicklerportal zwei
eigene Bilder, `icon_large` und `icon_small`. Ein Watchface braucht sie nicht,
eine Watchapp schon.

Angefordert werden sie in festen Massen — gross **80×80** und **144×144**,
klein **28×28** und **48×48** —, jeweils mit `exact` in der Adresse: die Masse
werden **erzwungen, nicht eingepasst**. Etwas Nicht-Quadratisches kommt verzogen
zurück. Das grosse Symbol legt der Store ausserdem für sein Teilen-Bild durch
eine abgerundete Maske — darum eine gefüllte Kachel und keine freistehende
Linie.

In [store/](store/) liegen `icon-144.png` und `icon-48.png`:

```bash
python3 tools/make_app_icon.py --store store
```

Sie entstehen aus **derselben Formbeschreibung** wie das 25×25 der Uhr — alle
Masse gelten auf einem Raster von 25 Punkten und werden hochgerechnet. Ohne
`--store` erzeugt dasselbe Werkzeug weiterhin Punkt für Punkt das alte
`system_icon.png`; dass es das wirklich tut, ist byteweise nachgeprüft.

## Lizenz

Gemeinfrei, [CC0 1.0](LICENSE). Kopieren, ändern, verkaufen, einbauen — ohne
Bedingung, ohne Namensnennung, ohne Rückfrage.

CC0 statt der Unlicense, weil das Schweizer Urheberrecht einen Verzicht gar
nicht kennt; CC0 trägt für genau diesen Fall eine Ersatzlizenz in sich, die
dasselbe erlaubt. Nicht erfasst sind die mitgeschnittenen Testantworten fremder
Dienste, siehe [NOTICE](NOTICE).
