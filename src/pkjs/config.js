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
      { type: 'heading', defaultValue: 'Flüge' },
      {
        type: 'text',
        defaultValue:
          'Flugnummer wie auf dem Ticket, ohne Leerzeichen: LX100, EK88, LH1234.'
      },
      {
        type: 'input',
        messageKey: 'FLIGHT1',
        label: 'Flug 1',
        attributes: { placeholder: 'z. B. LX100', limit: 8 }
      },
      {
        type: 'input',
        messageKey: 'FLIGHT2',
        label: 'Flug 2',
        attributes: { placeholder: 'optional', limit: 8 }
      },
      {
        type: 'input',
        messageKey: 'FLIGHT3',
        label: 'Flug 3',
        attributes: { placeholder: 'optional', limit: 8 }
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
