# Appstore listing

Ready to paste. The short line is for the summary field, the rest for the
description.

---

## Short (summary field)

Track one flight and see only what matters right now — gate before departure,
progress in the air, baggage belt after landing.

---

## Description

**Type the flight number on the watch.** No hunting through the phone app: two
letters, up to four digits, done. It stays until you change it.

Flyn — the little plane with a face — flies in while the data loads, then the
screen shows what the moment calls for.

### Three pages, in the order you travel

**Before the flight** — the gate in large type, terminal, departure time,
countdown, delay.

**In flight** — time remaining, a segmented progress bar, arrival time, flight
time.

**At the destination** — temperature, weather, local time, baggage belt,
arrival gate.

The app opens on the page that matches the current phase of your flight. Up and
Down flip through all three.

### It tells you when something changes

Your flight goes into the Pebble timeline as a pin, carrying two reminders: two
hours and thirty minutes before departure. Those buzz on their own, without the
app running.

If the gate, terminal, status, baggage belt or a time changes by more than five
minutes, the pin goes out again and the watch lets you know — even with the app
closed. Countdowns and progress deliberately don't count as changes: they move
on every fetch and would be noise, not news.

Optionally the watch also checks by itself, but only close to departure: hourly
from three hours out, every 20 minutes in the last hour, then once at landing.

### You bring your own API key

Flight data costs money. Flynformer uses aviationstack, whose free tier allows
**100 requests per month**. You enter your own key once in the phone app, and it
never leaves the phone — it is not in the app package and not in the source.

The whole app is built around spending that budget carefully:

- One paid request serves all three pages. Route, weather and both time zones
  come from free sources.
- Opening the app costs nothing. The stored state appears immediately, with its
  age in the footer.
- The footer always shows how many requests this month has cost.
- Checking by itself costs about eight requests per flight — roughly twelve
  flights a month.

### What it cannot do

Worth knowing before you install it:

- **No silent background updates.** Pebble has no hidden launch. When the watch
  checks by itself, Flynformer briefly appears in front of the watchface and
  disappears again. You can switch that off in the settings; the timeline
  reminders keep working without it.
- **Arrival gate and baggage belt are often missing.** Measured across 20
  departures from Zurich, the arrival terminal was filled in 30 % of cases and
  the belt in 50 %. Missing values show as `?`, so you can tell it's the data
  and not the app.
- **No delay prediction.** What's freely available covers only the current US
  situation, nothing for Europe and nothing ahead of time.
- **One flight at a time.**

### Details

Runs on Emery, Flint and Gabbro. English and German, following the language of
your watch.

Light design — orange on white — because the Pebble display reflects rather than
glows. A light background reads better in sunlight, which is usually where you
are when you're flying somewhere good.
