// Konfigurationsseite fuer die Telefon-App (Clay).
//
// Clay baut daraus die Seite, die in der Pebble-App unter "Einstellungen"
// erscheint. Gespeichert wird im localStorage des Telefons - der API-Schluessel
// steht damit NIE im Quelltext und nie im ausgelieferten .pbw.
//
// Achtung: index.js sendet bewusst NICHT alle Felder an die Uhr. Der Schluessel
// bleibt auf dem Telefon, die Uhr bekommt nur fertige Anzeigetexte.

// Die Seite spricht die Sprache der Uhr: index.js ruft buildConfig mit der
// zuletzt gemeldeten LANG-Nummer auf (0 en, 1 de, 2 fr, 3 it, 4 es, wie
// StringLang in src/c/strings.h). Jeder Text ist darum eine Zeile mit fuenf
// Spalten in dieser Reihenfolge; eine fehlende faellt auf Englisch zurueck.

function buildConfig(lang) {
  function t(en, de, fr, it, es) {
    var r = [en, de, fr, it, es][lang];
    return r || en;
  }

  return [
    { type: 'heading', defaultValue: 'Flynformer' },
    {
      type: 'text',
      defaultValue: t(
        'Flight data from aviationstack.com. You need your own account - ' +
        'the free plan allows 100 requests a month. The key stays on this phone.',
        'Flugdaten von aviationstack.com. Du brauchst einen eigenen Zugang - ' +
        'der kostenlose Tarif erlaubt 100 Abfragen im Monat. Der Schlüssel bleibt ' +
        'auf diesem Telefon.',
        'Données de vol d’aviationstack.com. Il te faut ton propre compte - ' +
        'l’offre gratuite permet 100 requêtes par mois. La clé reste sur ce téléphone.',
        'Dati di volo da aviationstack.com. Serve un account personale - ' +
        'il piano gratuito consente 100 richieste al mese. La chiave resta su questo telefono.',
        'Datos de vuelo de aviationstack.com. Necesitas tu propia cuenta: ' +
        'el plan gratuito permite 100 consultas al mes. La clave se queda en este teléfono.')
    },

    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: t('Access', 'Zugang', 'Accès', 'Accesso', 'Acceso') },
        {
          type: 'input',
          messageKey: 'API_KEY',
          label: 'AviationStack Access Key',
          attributes: {
            placeholder: t('from your aviationstack account', 'aus deinem aviationstack-Konto',
                           'depuis ton compte aviationstack', 'dal tuo account aviationstack',
                           'de tu cuenta de aviationstack'),
            limit: 64
          }
        }
      ]
    },

    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: t('Flight', 'Flug', 'Vol', 'Volo', 'Vuelo') },
        {
          type: 'text',
          defaultValue: t(
            'You enter the flight number on the WATCH, not here. It asks on the ' +
            'first start; later a long press on the middle button changes the ' +
            'flight. There is always exactly one active flight, and it stays ' +
            'stored until you change it.',
            'Die Flugnummer gibst du auf der UHR ein, nicht hier. Beim ersten ' +
            'Start fragt sie danach; später ändert ein langer Druck auf die ' +
            'Mitteltaste den Flug. Es ist immer genau ein Flug aktiv, und er ' +
            'bleibt gespeichert, bis du ihn änderst.',
            'Le numéro de vol se saisit sur la MONTRE, pas ici. Elle le demande ' +
            'au premier lancement ; ensuite, un appui long sur le bouton central ' +
            'change le vol. Un seul vol est actif à la fois, et il reste ' +
            'enregistré jusqu’à ce que tu le changes.',
            'Il numero di volo si inserisce sull’OROLOGIO, non qui. Lo chiede ' +
            'al primo avvio; poi una pressione lunga sul tasto centrale cambia ' +
            'il volo. È sempre attivo un solo volo, che resta salvato finché ' +
            'non lo cambi.',
            'El número de vuelo se introduce en el RELOJ, no aquí. Lo pide al ' +
            'primer inicio; después, una pulsación larga en el botón central ' +
            'cambia el vuelo. Siempre hay un solo vuelo activo, y queda ' +
            'guardado hasta que lo cambies.')
        }
      ]
    },

    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: t('Before departure', 'Vor dem Abflug', 'Avant le départ',
                                           'Prima della partenza', 'Antes de la salida') },
        {
          type: 'text',
          defaultValue: t(
            'The flight appears as a pin in the timeline and reminds you on its ' +
            'own - two hours and half an hour before departure. If the gate, ' +
            'terminal, time or status changes, the watch alerts you as soon as ' +
            'it learns about it. Nothing to set up.',
            'Der Flug steht als Pin in der Timeline und erinnert von sich aus — ' +
            'zwei Stunden und eine halbe Stunde vor dem Abflug. Ändert sich Gate, ' +
            'Terminal, Zeit oder Status, meldet sich die Uhr, sobald sie davon ' +
            'erfährt. Dafür ist nichts einzustellen.',
            'Le vol apparaît comme pin dans la Timeline et te le rappelle de ' +
            'lui-même - deux heures et une demi-heure avant le départ. Si la ' +
            'porte, le terminal, l’heure ou le statut change, la montre te ' +
            'prévient dès qu’elle le sait. Rien à régler.',
            'Il volo compare come pin nella Timeline e ti avvisa da solo - due ' +
            'ore e mezz’ora prima della partenza. Se cambiano gate, terminal, ' +
            'orario o stato, l’orologio ti avvisa appena lo viene a sapere. ' +
            'Non c’è nulla da impostare.',
            'El vuelo aparece como pin en la Timeline y te avisa por sí solo: ' +
            'dos horas y media hora antes de la salida. Si cambian la puerta, ' +
            'la terminal, la hora o el estado, el reloj te avisa en cuanto lo ' +
            'sabe. No hay nada que configurar.')
        },
        {
          type: 'toggle',
          messageKey: 'WATCH_FLIGHT',
          label: t('Check by itself', 'Selbst nachsehen', 'Vérifier seule',
                   'Controlla da solo', 'Comprobar solo'),
          defaultValue: true
        },
        {
          type: 'text',
          defaultValue: t(
            'When on, the watch checks by itself from three hours before ' +
            'departure: hourly, every 20 minutes in the last hour, then once at ' +
            'landing. About eight requests per flight. NOTE: Pebble has no ' +
            'silent background run - each check makes Flynformer jump in front ' +
            'of the watchface briefly and disappear again. When off this never ' +
            'happens, but the watch only notices a gate change when you open the app.',
            'Eingeschaltet sieht die Uhr ab drei Stunden vor dem Abflug selbst ' +
            'nach: stündlich, in der letzten Stunde alle 20 Minuten, dann einmal ' +
            'bei der Landung. Rund acht Abfragen je Flug. ACHTUNG: Pebble kennt ' +
            'keinen stillen Hintergrundlauf — bei jedem Nachsehen springt ' +
            'Flynformer kurz vor das Zifferblatt und verschwindet wieder. ' +
            'Ausgeschaltet passiert das nie, dafür merkt die Uhr einen ' +
            'Gate-Wechsel erst, wenn du die App öffnest.',
            'Activée, la montre vérifie seule dès trois heures avant le départ : ' +
            'toutes les heures, toutes les 20 minutes la dernière heure, puis ' +
            'une fois à l’atterrissage. Environ huit requêtes par vol. ' +
            'ATTENTION : Pebble n’a pas d’exécution silencieuse en ' +
            'arrière-plan - à chaque vérification, Flynformer passe brièvement ' +
            'devant le cadran puis disparaît. Désactivée, cela n’arrive jamais, ' +
            'mais la montre ne voit un changement de porte qu’à l’ouverture de l’app.',
            'Se attivo, l’orologio controlla da solo da tre ore prima della ' +
            'partenza: ogni ora, ogni 20 minuti nell’ultima ora, poi una volta ' +
            'all’atterraggio. Circa otto richieste per volo. ATTENZIONE: ' +
            'Pebble non ha un’esecuzione silenziosa in background - a ogni ' +
            'controllo Flynformer compare per un attimo davanti al quadrante e ' +
            'poi sparisce. Se disattivo non succede mai, ma l’orologio nota un ' +
            'cambio di gate solo quando apri l’app.',
            'Activado, el reloj comprueba por sí solo desde tres horas antes de ' +
            'la salida: cada hora, cada 20 minutos en la última hora y una vez ' +
            'al aterrizar. Unas ocho consultas por vuelo. ATENCIÓN: Pebble no ' +
            'tiene ejecución silenciosa en segundo plano; en cada comprobación ' +
            'Flynformer aparece un momento delante de la esfera y vuelve a ' +
            'desaparecer. Desactivado nunca ocurre, pero el reloj solo nota un ' +
            'cambio de puerta cuando abres la app.')
        }
      ]
    },

    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: t('Display', 'Anzeige', 'Affichage', 'Visualizzazione', 'Pantalla') },
        {
          type: 'radiogroup',
          messageKey: 'UNITS',
          label: t('Units', 'Einheiten', 'Unités', 'Unità', 'Unidades'),
          defaultValue: 'metric',
          options: [
            { label: t('Metric (km, °C)', 'Metrisch (km, °C)', 'Métrique (km, °C)',
                       'Metrico (km, °C)', 'Métrico (km, °C)'), value: 'metric' },
            { label: t('Imperial (mi, °F)', 'Imperial (mi, °F)', 'Impérial (mi, °F)',
                       'Imperiale (mi, °F)', 'Imperial (mi, °F)'), value: 'imperial' }
          ]
        }
      ]
    },

    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: t('Quota', 'Kontingent', 'Quota', 'Quota', 'Cuota') },
        {
          type: 'text',
          defaultValue: t(
            'The app counts how many requests this month has cost and shows the ' +
            'count on the watch. It only refreshes on a button press - automatic ' +
            'reloading would use up the 100 requests in a few days. Route, ' +
            'aircraft and weather come from free sources and do not count.',
            'Die App zählt mit, wie viele Abfragen dieser Monat gekostet hat, und ' +
            'zeigt den Stand auf der Uhr. Aktualisiert wird nur auf Tastendruck - ' +
            'automatisches Nachladen würde die 100 Abfragen in wenigen Tagen ' +
            'aufbrauchen. Route, Flugzeug und Wetter kommen aus kostenlosen ' +
            'Quellen und zählen nicht mit.',
            'L’app compte les requêtes utilisées ce mois-ci et affiche le ' +
            'total sur la montre. Elle ne se met à jour que sur appui d’un ' +
            'bouton - un rechargement automatique épuiserait les 100 requêtes en ' +
            'quelques jours. Trajet, avion et météo viennent de sources gratuites ' +
            'et ne comptent pas.',
            'L’app conta quante richieste ha usato questo mese e mostra il ' +
            'totale sull’orologio. Si aggiorna solo premendo un tasto - un ' +
            'aggiornamento automatico esaurirebbe le 100 richieste in pochi ' +
            'giorni. Rotta, aereo e meteo vengono da fonti gratuite e non contano.',
            'La app cuenta cuántas consultas ha gastado este mes y muestra el ' +
            'total en el reloj. Solo se actualiza al pulsar un botón: una recarga ' +
            'automática agotaría las 100 consultas en pocos días. Ruta, avión y ' +
            'tiempo vienen de fuentes gratuitas y no cuentan.')
        },
        {
          type: 'toggle',
          messageKey: 'QUOTA_RESET',
          label: t('Reset counter now', 'Zähler jetzt zurücksetzen', 'Remettre le compteur à zéro',
                   'Azzera il contatore', 'Reiniciar contador ahora'),
          defaultValue: false
        }
      ]
    },

    { type: 'submit', defaultValue: t('Save', 'Speichern', 'Enregistrer', 'Salva', 'Guardar') }
  ];
}

module.exports = buildConfig;
