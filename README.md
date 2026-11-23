# Dog Days

A personal puppy app (PWA) for an English Staffy on the Gold Coast. It's built like the gym tracker: plain HTML, CSS and JS, no build step, and data kept in this phone's localStorage under `dd_` keys.

## What it does
- **Today:** quick log (fed x/meals for age, walk, wee, poo, accident, weight), a "next toilet break" estimate, care items coming up, training for today, walk weather and nearby fireworks.
- **Getting ready mode:** runs until the homecoming date. A checklist covers rescue vs breeder, the Qld supply number check, Staffy DNA tests (L-2-HGA, HC), insurance, supplies and cane toads.
- **Train:** five step-by-step plans (puppy basics, loose lead, recall, calm at home, calm on walks), a 2-minute timer, and Good/OK/Hard ratings. It suggests the next step after three good sessions and a step back after two hard ones. There's also a socialisation checklist with counts.
- **Care:** a schedule worked out from the birthday and homecoming date: first vet check, microchip transfer, 3 puppy vaccinations (4 weeks apart, the last at 16 weeks or older) and then a yearly check, worming (fortnightly to 12 weeks, monthly to 6 months, then every 3 months), flea/tick/heartworm on your product's interval, council registration (12 weeks + 14 days, renewal 31 Aug), a desexing chat and weigh-ins. It also exports an .ics calendar file.
- **Walk weather:** a live Open-Meteo hourly forecast for your suburb, run through Paw Window's heat model (dog apparent temperature + footpath heating). It shows a 5 am–9 pm strip and good walk times.
- **Fireworks:** the Qld open-data list of upcoming displays (RSHQ), filtered to within N km of your suburb over the next 14 days. Suburbs are geocoded with Open-Meteo and cached. It exports an .ics file with an alert 2 hours before each display.
- **Settings:** dog profile, contacts, an emergency card (tap to call), a sitter sheet (share/copy), the checklist, and backup save/restore.

## Files
- `logic.js`: pure rules and content (dates, care schedule, training plans, heat model, fireworks parsing, .ics, sitter text). It's also a CommonJS module for tests.
- `app.js`: storage, fetching and rendering.
- `index.html`, `style.css`, `manifest.json`, `icon.svg`, `sw.js` (cache-first for its own files; APIs always go to the network).
- `tests/logic.test.js`: `npm test` (node:test, no installs).

## Run
- Preview: the `dog-days` config in `code/.claude/launch.json` (port 5350). The service worker serves cached files first, so reload twice after an edit.
- Bump `CACHE_NAME` in `sw.js` when app.js, logic.js and index.html change together.

## Facts used (checked 23 Nov 2026)
- City of Gold Coast: microchip before 12 weeks; register within 14 days of 12 weeks old or of moving to the city; renew by 31 Aug. The free registration for dogs under 12 months covered the period to 31 Aug 2026, so check current fees.
- Vaccinations: RSPCA Australia / WSAVA. Worming: University of Sydney vet hospital calendar + Royal Canin. The vet's plan wins.
- Animal Poisons Helpline 1300 869 738. Sources disagree on hours and fees, and the app says so.
- Queensland Dog Breeder Register: qdbr.daf.qld.gov.au (supply number check).
- Fireworks API: `data.qld.gov.au` datastore, resource `346d58fc-b7c1-4c38-bf4d-c9d5fb43ce7b` (CORS open). Weather: `api.open-meteo.com` (CORS open, no key).

## Notes
- The care schedule needs both the birthday and the homecoming date; every date counts from them.
- Calendar exports: each reminder keeps the same UID while its date moves (UID = item + times done) and carries a rising SEQUENCE, so a re-import replaces it in calendars that honour UIDs (Google does; iOS import can still add a copy, so delete old ones there).
- Training advice only counts ratings logged since you last moved to the current step (`dd_stepStart`).
- A backup restore is checked key by key before anything is saved.

## Not done
- Not deployed. To use it on the phone it needs hosting, e.g. a GitHub repo with Pages like the gym tracker.
- Icons: `node build-icons.mjs` redraws apple-touch-icon.png (180 px, square; iOS rounds it) and icon-192/512.png from the same shapes as icon.svg. Re-run it if icon.svg changes.
