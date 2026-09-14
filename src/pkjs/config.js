// Konfigurationsseite fuer die Telefon-App (Clay).
//
// Clay baut daraus die Seite, die in der Pebble-App unter "Einstellungen"
// erscheint. Gespeichert wird im localStorage des Telefons - der API-Schluessel
// steht damit NIE im Quelltext und nie im ausgelieferten .pbw.
//
// Achtung: index.js sendet bewusst NICHT alle Felder an die Uhr. Der Schluessel
// bleibt auf dem Telefon, die Uhr bekommt nur fertige Anzeigetexte.

module.exports = [
  { type: 'heading', defaultValue: 'Flynformer' },
  {
    type: 'text',
    defaultValue:
      'Flugdaten von aviationstack.com. Du brauchst einen eigenen Zugang - ' +
      'der kostenlose Tarif erlaubt 100 Abfragen im Monat. Der Schlüssel bleibt ' +
      'auf diesem Telefon.'
  },

  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Zugang' },
      {
        type: 'input',
        messageKey: 'API_KEY',
        label: 'AviationStack Access Key',
        attributes: { placeholder: 'aus deinem aviationstack-Konto', limit: 64 }
      }
    ]
  },

  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Flug' },
      {
        type: 'text',
        defaultValue:
          'Die Flugnummer gibst du auf der UHR ein, nicht hier. Beim ersten ' +
          'Start fragt sie danach; später ändert ein langer Druck auf die ' +
          'Mitteltaste den Flug. Es ist immer genau ein Flug aktiv, und er ' +
          'bleibt gespeichert, bis du ihn änderst.'
      }
    ]
  },

  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Vor dem Abflug' },
      {
        type: 'text',
        defaultValue:
          'Der Flug steht als Pin in der Timeline und erinnert von sich aus — ' +
          'zwei Stunden und eine halbe Stunde vor dem Abflug. Ändert sich Gate, ' +
          'Terminal, Zeit oder Status, meldet sich die Uhr, sobald sie davon ' +
          'erfährt. Dafür ist nichts einzustellen.'
      },
      {
        type: 'toggle',
        messageKey: 'WATCH_FLIGHT',
        label: 'Selbst nachsehen',
        defaultValue: true
      },
      {
        type: 'text',
        defaultValue:
          'Eingeschaltet sieht die Uhr ab drei Stunden vor dem Abflug selbst ' +
          'nach: stündlich, in der letzten Stunde alle 20 Minuten, dann einmal ' +
          'bei der Landung. Rund acht Abfragen je Flug. ACHTUNG: Pebble kennt ' +
          'keinen stillen Hintergrundlauf — bei jedem Nachsehen springt ' +
          'Flynformer kurz vor das Zifferblatt und verschwindet wieder. ' +
          'Ausgeschaltet passiert das nie, dafür merkt die Uhr einen ' +
          'Gate-Wechsel erst, wenn du die App öffnest.'
      }
    ]
  },

  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Anzeige' },
      {
        type: 'radiogroup',
        messageKey: 'UNITS',
        label: 'Einheiten',
        defaultValue: 'metric',
        options: [
          { label: 'Metrisch (km, °C)', value: 'metric' },
          { label: 'Imperial (mi, °F)', value: 'imperial' }
        ]
      }
    ]
  },

  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Kontingent' },
      {
        type: 'text',
        defaultValue:
          'Die App zählt mit, wie viele Abfragen dieser Monat gekostet hat, und ' +
          'zeigt den Stand auf der Uhr. Aktualisiert wird nur auf Tastendruck - ' +
          'automatisches Nachladen würde die 100 Abfragen in wenigen Tagen ' +
          'aufbrauchen. Route, Flugzeug und Wetter kommen aus kostenlosen ' +
          'Quellen und zählen nicht mit.'
      },
      {
        type: 'toggle',
        messageKey: 'QUOTA_RESET',
        label: 'Zähler jetzt zurücksetzen',
        defaultValue: false
      }
    ]
  },

  { type: 'submit', defaultValue: 'Speichern' }
];
