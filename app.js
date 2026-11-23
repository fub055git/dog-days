// Dog Days app: storage, fetching and rendering. Rules and content live in logic.js (window.DogLogic).
(function () {
  const L = window.DogLogic;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- storage ----------
  const P = 'dd_';
  function get(k, fallback) { try { const v = localStorage.getItem(P + k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
  function set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { toast('Could not save: storage is full or blocked'); } }
  const BACKUP_KEYS = ['profile', 'done', 'log', 'sessions', 'progress', 'stepStart', 'enabled', 'social', 'ready', 'notes', 'settings'];
  const ARRAY_KEYS = ['log', 'sessions', 'enabled'];

  const S = {
    profile: get('profile', { breed: 'English Staffy' }),
    done: get('done', {}),
    log: get('log', []),
    sessions: get('sessions', []),
    progress: get('progress', {}),
    stepStart: get('stepStart', {}), // plan → index in sessions where the current step was entered
    enabled: get('enabled', L.PLANS.map((p) => p.id)),
    social: get('social', {}),
    ready: get('ready', {}),
    notes: get('notes', {}),
    settings: get('settings', { surface: 'concrete', radius: 10, heatDay: 0 }),
  };
  const save = (k) => set(k, S[k]);

  // ---------- time ----------
  const pad = (n) => String(n).padStart(2, '0');
  const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localStamp = (d = new Date()) => `${localISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = () => localISO();
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const fmtHour = (h) => (h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`);
  const fmtTime = (stamp) => { const [h, m] = stamp.slice(11, 16).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };
  const relDays = (iso) => { const n = L.diffDays(today(), iso); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days ago` : `in ${n} days`; };

  // ---------- derived ----------
  const DEFAULT_HOME = { name: 'Gold Coast', lat: -28.0003, lon: 153.4309, postcode: '4217', isDefault: true };
  const home = () => (S.profile.suburb && S.profile.suburb.lat != null ? { ...S.profile.suburb, postcode: S.profile.postcode || S.profile.suburb.postcode } : DEFAULT_HOME);
  const ageW = () => L.ageWeeks(S.profile.birthday, today());
  const dogHome = () => L.hasDog(S.profile, today());
  const weightDates = () => S.log.filter((e) => e.type === 'weight').map((e) => e.t.slice(0, 10)).sort();
  const schedule = () => { const w = weightDates(); return L.careSchedule(S.profile, S.done, today(), { lastWeight: w[w.length - 1] || null, weightCount: w.length }); };
  const hasSchedule = () => !!(S.profile.birthday && S.profile.homeDate);
  const dogName = () => S.profile.name || 'Your dog';

  // ---------- UI shell ----------
  let tab = 'today';
  let openPlan = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function sheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').classList.add('open'); const f = $('#sheet-body input, #sheet-body select'); if (f) f.focus(); }
  function closeSheet() {
    $('#sheet').classList.remove('open');
    if (fullURL) { URL.revokeObjectURL(fullURL); fullURL = null; }
  }

  // ---------- photos (IndexedDB: photos are too big for localStorage) ----------
  // Record: { id, date 'YYYY-MM-DD', note, added (ms), full: Blob (≤1600 px JPEG), thumb: Blob (≤360 px) }.
  // Not in the backup file: the originals stay in the camera roll.
  const PhotoDB = (() => {
    let dbp = null;
    const open = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('dog-days', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('photos', mode);
        const req = fn(t.objectStore('photos'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('storage aborted'));
      });
    };
    return { all: () => run('readonly', (s) => s.getAll()), put: (o) => run('readwrite', (s) => s.put(o)), del: (id) => run('readwrite', (s) => s.delete(id)) };
  })();
  let photos = [];            // records, loaded once at start
  const thumbURLs = new Map(); // id → object URL of the thumbnail
  let fullURL = null;          // object URL of the photo open in the sheet
  const thumbURL = (id) => {
    const p = photos.find((x) => x.id === id); if (!p) return null;
    if (!thumbURLs.has(id)) thumbURLs.set(id, URL.createObjectURL(p.thumb));
    return thumbURLs.get(id);
  };
  const profilePhoto = () => (S.profile.photoId ? thumbURL(S.profile.photoId) : null);

  function loadImage(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image this browser can read')); };
      img.src = url;
    });
  }
  // Browsers apply the EXIF rotation when drawing, so portrait phone photos stay upright.
  function scaled(img, max, quality) {
    const { w, h } = L.fitSize(img.naturalWidth, img.naturalHeight, max);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not shrink the photo'))), 'image/jpeg', quality));
  }
  async function addPhotoFile(file) {
    const date = L.exifDate(await file.slice(0, 256 * 1024).arrayBuffer()) || today();
    const { img, url } = await loadImage(file);
    try {
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), date, note: '', added: Date.now(),
        full: await scaled(img, 1600, 0.85), thumb: await scaled(img, 360, 0.8) };
      await PhotoDB.put(rec);
      photos.push(rec);
      return rec;
    } finally { URL.revokeObjectURL(url); }
  }
  async function addPhotos(files, asProfile) {
    let ok = 0, last = null;
    const failed = [];
    for (const f of files) {
      try { last = await addPhotoFile(f); ok++; } catch (e) { failed.push(f.name || 'a photo'); }
    }
    if (asProfile && last) { S.profile.photoId = last.id; save('profile'); }
    // Ask the browser to keep this site's storage even when the phone is short on space.
    if (ok && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    toast(failed.length ? `Added ${ok}; couldn't read ${failed.join(', ')}` : asProfile ? 'Profile photo set' : `Added ${ok} photo${ok === 1 ? '' : 's'}`);
    render();
  }
  function openPhoto(id) {
    const p = photos.find((x) => x.id === id); if (!p) return;
    if (fullURL) URL.revokeObjectURL(fullURL);
    fullURL = URL.createObjectURL(p.full);
    const kg = L.nearestWeight(S.log, p.date);
    const age = S.profile.birthday && p.date >= S.profile.birthday ? L.ageText(S.profile.birthday, p.date) : '';
    sheet(`<img class="photo-full" src="${fullURL}" alt="">
      <p class="muted">${esc([fmtDate(p.date), age, kg ? `${kg} kg` : ''].filter(Boolean).join(' · '))}</p>
      <div class="form-row"><label class="block">Date<input id="ph-date" type="date" value="${p.date}" max="${today()}"></label></div>
      <label class="block">Note<input id="ph-note" value="${esc(p.note)}" placeholder="First beach trip, new collar…"></label>
      <div class="form-row"><button class="btn" data-act="photo-save" data-id="${p.id}">Save</button>
      <button class="btn ghost" data-act="photo-profile" data-id="${p.id}" ${S.profile.photoId === p.id ? 'disabled' : ''}>${S.profile.photoId === p.id ? 'Profile photo' : 'Use as profile photo'}</button></div>
      <button class="link danger" data-act="photo-del" data-id="${p.id}">Delete photo</button>`);
  }

  function header() {
    const p = S.profile;
    const sub = dogHome() ? L.ageText(p.birthday, today()) : p.homeDate ? `Comes home ${relDays(p.homeDate)}` : 'Getting ready';
    $('#title').textContent = p.name || 'Dog Days';
    $('#subtitle').textContent = sub;
    const src = profilePhoto(), av = $('#avatar');
    av.hidden = !src;
    if (src && av.getAttribute('src') !== src) av.src = src;
  }

  function render() {
    header();
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const v = { today: viewToday, train: viewTrain, care: viewCare, log: viewLog, more: viewMore }[tab]();
    $('#main').innerHTML = v;
    if (tab === 'today') { drawHeat(); drawFireworks(); }
  }

  // ---------- Today ----------
  function viewToday() {
    const out = [];
    if (!dogHome()) out.push(readyCard());
    else {
      out.push(quickLogCard());
      const due = schedule().filter((i) => ['overdue', 'due', 'soon'].includes(i.status)).slice(0, 4);
      if (due.length) out.push(`<section class="card"><h2>Care coming up</h2>${due.map(careRow).join('')}<button class="link" data-act="tab" data-tab="care">Full schedule</button></section>`);
      out.push(trainingCard());
    }
    out.push(`<section class="card" id="heat-card"><h2>Walk weather</h2><div id="heat">Loading forecast…</div></section>`);
    out.push(`<section class="card" id="fw-card"><h2>Fireworks nearby</h2><div id="fw">Loading the Qld fireworks list…</div></section>`);
    return out.join('');
  }

  function readyCard() {
    const total = L.READY.reduce((a, g) => a + g.items.length, 0);
    const done = Object.values(S.ready).filter(Boolean).length;
    const p = S.profile;
    const when = p.homeDate ? `Homecoming ${fmtDate(p.homeDate)} (${relDays(p.homeDate)}).` : 'Add a homecoming date in Settings when you know it. The care schedule starts that day.';
    return `<section class="card hero"><h2>Getting ready</h2><p>${esc(when)}</p>
      <div class="progress"><span style="width:${Math.round(100 * done / total)}%"></span></div>
      <p class="muted">${done} of ${total} things done</p>
      <button class="btn" data-act="tab" data-tab="more" data-scroll="ready">Open the checklist</button></section>`;
  }

  function quickLogCard() {
    const t = today();
    const todays = S.log.filter((e) => e.t.startsWith(t));
    const meals = todays.filter((e) => e.type === 'feed').length;
    const walks = todays.filter((e) => e.type === 'walk').length;
    const mpd = L.mealsPerDay(ageW());
    let toilet = '';
    if (ageW() != null && ageW() < 30) {
      const last = S.log.filter((e) => e.type === 'wee' || e.type === 'poo' || e.type === 'accident').map((e) => e.t).sort().pop();
      const gap = L.toiletGapHours(ageW());
      if (last) {
        const [d, hm] = last.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
        const next = new Date(y, mo - 1, da, h + gap, mi);
        const late = next < new Date();
        toilet = `<p class="${late ? 'warn' : 'muted'}">Toilet break ${late ? 'due now' : `next by about ${fmtTime(localStamp(next))}`}: every ${gap} h at this age, plus after sleeping, eating and play.</p>`;
      } else toilet = `<p class="muted">Log toilet trips to get a "next break" reminder here (every ${gap} h at this age).</p>`;
    }
    return `<section class="card"><h2>Quick log</h2>
      <div class="quick">
        <button data-act="q" data-type="feed"><b>🍽</b>Fed <small>${meals}/${mpd}</small></button>
        <button data-act="q" data-type="walk"><b>🦮</b>Walk <small>${walks}</small></button>
        <button data-act="q" data-type="wee"><b>💧</b>Wee</button>
        <button data-act="q" data-type="poo"><b>💩</b>Poo</button>
        <button data-act="q" data-type="accident"><b>🧻</b>Accident</button>
        <button data-act="weigh"><b>⚖️</b>Weight</button>
      </div>${toilet}</section>`;
  }

  function trainingCard() {
    const list = L.todaysTraining(S.sessions, S.progress, S.enabled, ageW(), today());
    if (!list.length) return '';
    return `<section class="card"><h2>Training today</h2><p class="muted">Two to five minutes each, ending on a win.</p>
      ${list.map((x) => `<button class="row-btn" data-act="plan" data-plan="${x.plan}"><span><b>${esc(x.title)}</b><br><small>Step ${x.step + 1}: ${esc(x.stepTitle)}</small></span><span class="chip ${x.done ? 'ok' : ''}">${x.done ? 'Done' : 'Go'}</span></button>`).join('')}</section>`;
  }

  // ---------- heat ----------
  async function fetchWeather(force) {
    const h = home();
    const c = get('wx', null);
    const fresh = c && c.lat === h.lat && c.lon === h.lon && Date.now() - c.at < 60 * 60e3 && c.hours[0].time.startsWith(today());
    if (fresh && !force) return c;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${h.lat}&longitude=${h.lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation&timezone=Australia%2FBrisbane&forecast_days=2`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('forecast ' + r.status);
    const j = await r.json();
    const H = j.hourly;
    const hours = H.time.map((t, i) => ({ time: t, temp: H.temperature_2m[i], rh: H.relative_humidity_2m[i], wind: H.wind_speed_10m[i], sw: H.shortwave_radiation[i] }));
    const out = { at: Date.now(), lat: h.lat, lon: h.lon, hours };
    set('wx', out);
    return out;
  }

  async function drawHeat(force) {
    const el = $('#heat'); if (!el) return;
    const noForecast = `<p class="muted">No forecast for this day (offline?). <button class="link" data-act="heat-refresh">Try again</button></p>`;
    let wx;
    try { wx = await fetchWeather(force); } catch (e) { wx = get('wx', null); }
    if (!$('#heat')) return;
    const day = S.settings.heatDay ? L.addDays(today(), 1) : today();
    // A cache from an earlier day may not cover the chosen day: say so rather than advising "no walk times".
    if (!wx || !wx.hours.some((h) => h.time.startsWith(day))) { el.innerHTML = noForecast; return; }
    const p = S.profile;
    const rated = L.hourlyHeat(wx.hours, { darkCoat: p.coat === 'dark', acclim: p.acclim, overweight: p.overweight }, ageW(), S.settings.surface);
    const hrs = rated.filter((r) => r.date === day && r.hour >= 5 && r.hour <= 20);
    const wins = L.walkWindows(rated, day, 1);
    const nowH = new Date().getHours();
    const winText = wins.length ? wins.map((w) => `${fmtHour(w.from)}–${fmtHour(w.to)}`).join(', ') : 'none: keep to toilet breaks in shade and play brain games inside';
    const hottest = hrs.reduce((a, r) => (r.level > a.level || (r.level === a.level && Math.max(r.dogAT, r.surf - 15) > Math.max(a.dogAT, a.surf - 15)) ? r : a), hrs[0] || { level: 0 });
    const peakSurf = Math.round(Math.max(...hrs.map((r) => r.surf)));
    el.innerHTML = `
      <div class="seg">${['Today', 'Tomorrow'].map((t, i) => `<button data-act="heat-day" data-day="${i}" class="${S.settings.heatDay === i ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="strip">${hrs.map((r) => `<div class="hr lv${r.level} ${!S.settings.heatDay && r.hour === nowH ? 'now' : ''}" title="${fmtHour(r.hour)}: ${L.LEVELS[r.level]}"><span>${r.hour % 12 || 12}</span></div>`).join('')}</div>
      <div class="legend">${L.LEVELS.map((l, i) => `<span><i class="lv${i}"></i>${l}</span>`).join('')}</div>
      <p><b>Good walk times:</b> ${esc(winText)}.</p>
      ${hottest.level >= 2 ? `<p class="warn">Hottest around ${fmtHour(hottest.hour)} (${L.LEVELS[hottest.level].toLowerCase()}, mostly ${hottest.by === 'paw' ? 'hot ground' : 'body heat'}). ${esc(S.settings.surface === 'grass' ? 'Grass' : L.SURFACES[S.settings.surface].label)} reaches about ${peakSurf}°C.</p>` : ''}
      <label class="inline">Walking on <select data-act="surface">${Object.entries(L.SURFACES).map(([k, s]) => `<option value="${k}" ${S.settings.surface === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
      <p class="tiny">Open-Meteo forecast for ${esc(home().name)}${home().isDefault ? ' (set your suburb in Settings)' : ''}, updated ${new Date(wx.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}. Paw Window's heat model. Estimates only. <button class="link" data-act="heat-refresh">Refresh</button></p>`;
  }

  // ---------- fireworks ----------
  const FW_URL = 'https://www.data.qld.gov.au/api/3/action/datastore_search?resource_id=346d58fc-b7c1-4c38-bf4d-c9d5fb43ce7b&limit=1000';
  async function fetchFireworks(force) {
    const c = get('fw', null);
    if (c && !force && Date.now() - c.at < 6 * 3600e3) return c.list;
    const r = await fetch(FW_URL);
    if (!r.ok) throw new Error('fireworks ' + r.status);
    const j = await r.json();
    const list = L.parseFireworks(j.result.records);
    set('fw', { at: Date.now(), list });
    return list;
  }
  async function geocode(name) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json&countryCode=AU`);
    if (!r.ok) throw new Error('geocode ' + r.status);
    const j = await r.json();
    return (j.results || []).filter((x) => x.admin1 === 'Queensland');
  }
  function bestMatch(results, name) {
    const exact = results.filter((x) => x.name.toLowerCase() === name.toLowerCase());
    const pool = exact.length ? exact : results;
    return pool.find((x) => /^PPL/.test(x.feature_code)) || pool[0] || null;
  }
  async function fillGeo(list) {
    const geo = get('geo', {});
    const need = [...new Set(list.map(L.fwKey))].filter((k) => !(k in geo));
    for (let i = 0; i < need.length; i += 6) {
      const batch = need.slice(i, i + 6);
      const res = await Promise.all(batch.map((k) => { const name = k.split('|')[0]; return geocode(name).then((r) => bestMatch(r, name)).catch(() => undefined); }));
      if (res.every((m) => m === undefined)) break; // offline: try again next time
      batch.forEach((k, j) => { if (res[j] !== undefined) geo[k] = res[j] ? { lat: res[j].latitude, lon: res[j].longitude } : null; });
    }
    set('geo', geo);
    return geo;
  }

  let fwNear = [];
  async function drawFireworks(force) {
    const el = $('#fw'); if (!el) return;
    let list;
    try { list = await fetchFireworks(force); } catch (e) {
      const c = get('fw', null);
      if (!c) { el.innerHTML = `<p class="muted">Couldn't load the list (offline?). <button class="link" data-act="fw-refresh">Try again</button></p>`; return; }
      list = c.list;
    }
    const soon = list.filter((f) => f.date >= today() && f.date <= L.addDays(today(), 14));
    const geo = await fillGeo(soon);
    if (!$('#fw')) return;
    const radius = Number(S.settings.radius) || 10;
    fwNear = L.nearbyFireworks(list, home(), geo, today(), 14, radius);
    const rows = fwNear.map((f) => `<li><b>${fmtDate(f.date)}, ${/^\d{1,2}:\d{2}$/.test(f.time) ? fmtTime(`${f.date}T${f.time.padStart(5, '0')}`) : esc(f.time)}</b> ${esc(f.suburb)}${f.km != null ? ` <small>${f.km < 1 ? '<1' : Math.round(f.km)} km</small>` : ' <small>distance unknown</small>'}<br><small>${esc(f.address)}${f.eventType ? ` · ${esc(f.eventType)}` : ''}</small></li>`).join('');
    el.innerHTML = `
      <label class="inline">Within <select data-act="radius">${[3, 5, 10, 20].map((n) => `<option ${radius === n ? 'selected' : ''} value="${n}">${n} km</option>`).join('')}</select> of ${esc(home().name)}, next 14 days</label>
      ${fwNear.length ? `<ul class="fw">${rows}</ul><button class="btn" data-act="fw-ics">Add to calendar (alert 2 h before)</button>` : '<p>None notified nearby. Illegal backyard fireworks won\'t show here, and New Year\'s Eve lists fill up late in December.</p>'}
      ${fwNear.some((f) => f.km == null) ? '<p class="tiny">"Distance unknown": the suburb couldn\'t be found on the map. Add your postcode in Settings to keep only ones in your postcode.</p>' : ''}
      <p class="tiny">Registered displays from the Qld Explosives Inspectorate (open data). Operators must notify at least 7 days ahead. <button class="link" data-act="fw-refresh">Refresh</button></p>`;
  }

  // ---------- Train ----------
  function viewTrain() {
    const out = [];
    const a = ageW();
    const phase = L.socialPhase(a);
    if (!dogHome() || (a != null && a < 30)) out.push(socialCard(phase));
    for (const p of L.PLANS) {
      if (p.puppyOnly && a != null && a > 30 && !S.enabled.includes(p.id)) continue;
      out.push(planCard(p));
    }
    return out.join('');
  }

  function socialCard(phase) {
    const total = L.SOCIAL.reduce((n, g) => n + g.items.length, 0);
    const done = L.SOCIAL.reduce((n, g) => n + g.items.filter((i) => (S.social[i] || 0) >= 1).length, 0);
    const open = openPlan === 'social';
    return `<section class="card"><button class="card-head" data-act="plan" data-plan="social"><h2>Socialisation</h2><span class="chip">${done}/${total}</span></button>
      <p class="muted">${esc(phase ? phase.text : 'Starts the day your puppy comes home. Calm, short and paired with treats; let them watch from a distance first.')}</p>
      ${open ? L.SOCIAL.map((g) => `<h3>${g.group}</h3><div class="tags">${g.items.map((i) => {
        const n = S.social[i] || 0;
        return `<button class="tag ${n >= 3 ? 'full' : n ? 'some' : ''}" data-act="soc" data-item="${esc(i)}">${esc(i)}${n ? ` <b>${n}</b>` : ''}</button>`;
      }).join('')}</div>`).join('') + `<p class="tiny">Tap after each good experience; aim for 3. Hold-press clears one. Before vaccinations are finished, carry the puppy and ask your vet which places are safe.</p>` : ''}
    </section>`;
  }

  function planCard(p) {
    const on = S.enabled.includes(p.id);
    const step = Math.min(S.progress[p.id] || 0, p.steps.length - 1);
    const s = p.steps[step];
    const open = openPlan === p.id;
    const advice = L.stepAdvice(S.sessions, p.id, step, S.stepStart[p.id] || 0);
    const recent = S.sessions.slice(S.stepStart[p.id] || 0).filter((x) => x.plan === p.id && x.step === step).slice(-6);
    let body = '';
    if (open) {
      body = `<div class="step"><div class="step-n">Step ${step + 1} of ${p.steps.length}</div><h3>${esc(s.t)}</h3><p>${esc(s.how)}</p><p class="goal"><b>Move on when:</b> ${esc(s.goal)}</p></div>
        ${advice === 'next' && step < p.steps.length - 1 ? `<p class="good">Three good sessions in a row. Ready for the next step. <button class="link" data-act="step" data-plan="${p.id}" data-d="1">Move on</button></p>` : ''}
        ${advice === 'back' ? `<p class="warn">Two hard sessions in a row. Go back a step for a few days to rebuild confidence. <button class="link" data-act="step" data-plan="${p.id}" data-d="-1">Step back</button></p>` : ''}
        <div class="timer" id="timer-${p.id}"><button class="btn" data-act="timer" data-plan="${p.id}">Start 2-minute timer</button></div>
        <p class="muted">How did it go?</p>
        <div class="rate">${['good', 'ok', 'hard'].map((r) => `<button data-act="rate" data-plan="${p.id}" data-r="${r}">${{ good: '👍 Good', ok: '👌 OK', hard: '😬 Hard' }[r]}</button>`).join('')}</div>
        ${recent.length ? `<p class="tiny">This step: ${recent.map((x) => ({ good: '👍', ok: '👌', hard: '😬' }[x.rating])).join(' ')}</p>` : ''}
        <div class="stepnav"><button class="link" data-act="step" data-plan="${p.id}" data-d="-1" ${step === 0 ? 'disabled' : ''}>‹ Previous step</button><button class="link" data-act="step" data-plan="${p.id}" data-d="1" ${step === p.steps.length - 1 ? 'disabled' : ''}>Next step ›</button></div>
        ${p.note ? `<p class="tiny">${esc(p.note)}</p>` : ''}
        <label class="block">Notes<textarea data-act="note" data-plan="${p.id}" rows="2" placeholder="What worked, distances, treats they love">${esc(S.notes[p.id] || '')}</textarea></label>
        <label class="inline"><input type="checkbox" data-act="enable" data-plan="${p.id}" ${on ? 'checked' : ''}> Include in "Training today"</label>`;
    }
    return `<section class="card ${on ? '' : 'off'}"><button class="card-head" data-act="plan" data-plan="${p.id}"><h2>${esc(p.title)}</h2><span class="chip">${step + 1}/${p.steps.length}</span></button>
      <p class="muted">${esc(open ? p.blurb : `Step ${step + 1}: ${s.t}`)}</p>${body}</section>`;
  }

  let timer = null;
  function startTimer(plan) {
    clearInterval(timer);
    let left = 120;
    const tick = () => {
      const el = $(`#timer-${plan}`);
      if (!el) { clearInterval(timer); return; }
      if (left <= 0) { clearInterval(timer); el.innerHTML = `<p class="good">Time's up. End on something easy they get right.</p>`; try { navigator.vibrate && navigator.vibrate(300); } catch (e) {} return; }
      el.innerHTML = `<div class="clock">${Math.floor(left / 60)}:${pad(left % 60)}</div><button class="link" data-act="timer-stop">Stop</button>`;
      left--;
    };
    tick(); timer = setInterval(tick, 1000);
  }

  // ---------- Care ----------
  function careRow(i) {
    const label = { overdue: 'Overdue', due: 'Due', soon: 'Soon', later: 'Later', done: 'Done' }[i.status];
    const when = i.status === 'done' ? `Done ${fmtDate(i.doneOn)}` : `${fmtDate(i.due)} · ${relDays(i.due)}`;
    return `<div class="care"><div><b>${esc(i.title)}</b><br><small>${esc(when)}</small></div>
      <span class="chip st-${i.status}">${label}</span>
      ${i.status !== 'done' ? `<button class="btn sm" data-act="${i.id === 'weigh' ? 'weigh' : 'done'}" data-id="${i.id}">${i.id === 'weigh' ? 'Weigh' : 'Done'}</button>` : ''}</div>`;
  }

  function viewCare() {
    if (!hasSchedule()) {
      return `<section class="card"><h2>Care schedule</h2><p>Add the puppy's birthday and homecoming date in Settings (both are needed: every date counts from them). Vaccinations, worming, flea and tick, council registration and weigh-ins are then worked out from them.</p><button class="btn" data-act="tab" data-tab="more">Open Settings</button></section>`;
    }
    const items = schedule();
    return `<section class="card"><h2>Care schedule</h2>${items.map((i) => `${careRow(i)}
        <details class="why"><summary>Why and history</summary><p>${esc(i.why || '')}</p>${i.src ? `<p class="tiny">Source: ${esc(i.src)}</p>` : ''}
        ${(S.done[i.id] || []).length ? `<p class="tiny">Logged: ${(S.done[i.id] || []).slice().sort().reverse().map((d) => `${fmtDate(d)} <button class="x" data-act="undone" data-id="${i.id}" data-date="${d}" aria-label="Remove">×</button>`).join(' · ')}</p>` : ''}</details>`).join('')}
        <button class="btn" data-act="care-ics">Add reminders to calendar</button>
        <p class="tiny">Your vet's advice wins over these defaults. The calendar file adds each upcoming item at 8 am with an alert; download it again after changes.</p></section>`;
  }

  // ---------- Log ----------
  const TYPES = { feed: '🍽 Fed', walk: '🦮 Walk', wee: '💧 Wee', poo: '💩 Poo', accident: '🧻 Accident', weight: '⚖️ Weight', note: '📝 Note' };
  function viewLog() {
    const weights = S.log.filter((e) => e.type === 'weight').sort((a, b) => (a.t < b.t ? -1 : 1));
    const days = {};
    S.log.slice().sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 200).forEach((e) => { (days[e.t.slice(0, 10)] ||= []).push(e); });
    const last7 = Object.keys(days).slice(0, 7);
    const toiletDays = last7.map((d) => ({ d, out: days[d].filter((e) => e.type === 'wee' || e.type === 'poo').length, acc: days[d].filter((e) => e.type === 'accident').length }));
    const diary = L.sortPhotos(photos);
    return `
      <section class="card"><h2>Photo diary</h2>
        <label class="btn">Choose photos<input id="photo-input" type="file" accept="image/*" multiple hidden></label>
        ${diary.length ? `<div class="photos">${diary.map((p) => `<button class="ph" data-act="photo-open" data-id="${p.id}"><img src="${thumbURL(p.id)}" alt="" loading="lazy"><small>${esc(fmtDate(p.date))}</small></button>`).join('')}</div>`
          : '<p class="muted">Pick photos from your library or take one. Each is dated from when it was taken and shown with the weight logged nearest that day.</p>'}
        <p class="tiny">Photos stay on this phone and aren't in the backup file; the originals stay in your camera roll.</p></section>
      <section class="card"><h2>Add an entry</h2>
        <div class="form-row"><select id="new-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input id="new-time" type="datetime-local" value="${localStamp()}"></div>
        <div class="form-row"><input id="new-kg" type="number" step="0.1" min="0" inputmode="decimal" placeholder="kg (weight only)"><input id="new-note" placeholder="Note (optional)"></div>
        <button class="btn" data-act="add-entry">Add</button></section>
      ${weights.length ? `<section class="card"><h2>Weight</h2>${weights.length > 1 ? weightChart(weights) : ''}<p class="muted">Latest ${weights[weights.length - 1].kg} kg on ${fmtDate(weights[weights.length - 1].t.slice(0, 10))}.</p></section>` : ''}
      ${toiletDays.some((x) => x.out || x.acc) ? `<section class="card"><h2>Toilet training</h2><div class="bars">${toiletDays.slice().reverse().map((x) => `<div><span class="b-out" style="height:${Math.min(60, x.out * 8)}px"></span><span class="b-acc" style="height:${Math.min(60, x.acc * 8)}px"></span><small>${x.d.slice(8)}</small></div>`).join('')}</div><p class="tiny"><i class="k-out"></i> outside · <i class="k-acc"></i> accidents</p></section>` : ''}
      <section class="card"><h2>History</h2>${last7.length ? last7.map((d) => `<h3>${fmtDate(d)}</h3><ul class="entries">${days[d].map((e) => `<li><span>${fmtTime(e.t)}</span> ${TYPES[e.type] || e.type}${e.kg ? ` ${e.kg} kg` : ''}${e.note ? ` <small>${esc(e.note)}</small>` : ''}<button class="x" data-act="del" data-id="${e.id}" aria-label="Delete">×</button></li>`).join('')}</ul>`).join('') : '<p class="muted">Nothing logged yet.</p>'}</section>`;
  }

  function weightChart(ws) {
    const W = 320, H = 110, pd = 24;
    const t0 = new Date(ws[0].t).getTime(), t1 = new Date(ws[ws.length - 1].t).getTime() || t0 + 1;
    const k0 = Math.min(...ws.map((w) => w.kg)), k1 = Math.max(...ws.map((w) => w.kg));
    const x = (t) => pd + (W - 2 * pd) * (t1 === t0 ? 0.5 : (new Date(t).getTime() - t0) / (t1 - t0));
    const y = (k) => H - pd - (H - 2 * pd) * (k1 === k0 ? 0.5 : (k - k0) / (k1 - k0));
    const pts = ws.map((w) => `${x(w.t).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
      ${ws.map((w) => `<circle cx="${x(w.t).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('')}
      <text x="${pd}" y="14" class="ax">${k1} kg</text><text x="${pd}" y="${H - 6}" class="ax">${k0} kg</text></svg>`;
  }

  // ---------- More ----------
  function field(id, label, type = 'text', extra = '') {
    const v = S.profile[id] ?? '';
    return `<label class="block">${label}<input data-prof="${id}" type="${type}" value="${esc(v)}" ${extra}></label>`;
  }
  function viewMore() {
    const p = S.profile;
    const items = schedule();
    const sitter = L.sitterText(p, items, today());
    const pic = profilePhoto();
    const em = `<section class="card emergency"><h2>Emergency</h2>
      ${pic ? `<img class="em-photo" src="${pic}" alt="${esc(p.name || 'Your dog')}">` : ''}
      ${p.vetPhone ? `<a class="call" href="tel:${esc(p.vetPhone.replace(/\s/g, ''))}">📞 Vet: ${esc(p.vetName || '')} ${esc(p.vetPhone)}</a>` : '<p class="muted">Add your vet below.</p>'}
      ${p.emPhone ? `<a class="call" href="tel:${esc(p.emPhone.replace(/\s/g, ''))}">🚑 24-hour vet: ${esc(p.emName || '')} ${esc(p.emPhone)}</a>` : '<p class="muted">Add the nearest 24-hour emergency vet below.</p>'}
      <a class="call" href="tel:1300869738">☠️ Animal Poisons Helpline 1300 869 738</a>
      <p class="tiny">The helpline's hours and fees vary; in an emergency, go straight to the vet. Paralysis tick signs: wobbly back legs, changed bark, retching, laboured breathing.</p>
      ${p.chip ? `<p>Microchip: <b>${esc(p.chip)}</b></p>` : ''}</section>`;
    const ready = `<section class="card" id="ready"><h2>Getting-ready checklist</h2>${L.READY.map((g) => `<h3>${g.group}</h3>${g.items.map((i) => `<label class="check"><input type="checkbox" data-act="ready" data-item="${esc(i.t)}" ${S.ready[i.t] ? 'checked' : ''}><span><b>${esc(i.t)}</b><br><small>${esc(i.d)}</small></span></label>`).join('')}`).join('')}</section>`;
    const profile = `<section class="card"><h2>Your dog</h2>
      <div class="profile-pic">${pic ? `<img src="${pic}" alt="">` : '<span>🐶</span>'}
        <label class="btn ghost sm">${pic ? 'Change photo' : 'Choose photo'}<input id="profile-photo-input" type="file" accept="image/*" hidden></label></div>
      ${field('name', 'Name')}${field('breed', 'Breed')}
      <div class="form-row">${field('birthday', 'Birthday', 'date')}${field('homeDate', 'Homecoming day', 'date')}</div>
      <div class="form-row"><label class="block">Coat<select data-prof="coat"><option value="">Light or mixed</option><option value="dark" ${p.coat === 'dark' ? 'selected' : ''}>Dark (black, brindle)</option></select></label>
      <label class="block">Used to Gold Coast heat?<select data-prof="acclim"><option value="">Normal</option><option value="used" ${p.acclim === 'used' ? 'selected' : ''}>Yes, well used to it</option><option value="new" ${p.acclim === 'new' ? 'selected' : ''}>No, new to heat</option></select></label></div>
      <label class="inline"><input type="checkbox" data-prof="desexed" ${p.desexed ? 'checked' : ''}> Desexed</label>
      <label class="inline"><input type="checkbox" data-prof="overweight" ${p.overweight ? 'checked' : ''}> Carrying extra weight</label>
      <h3>Flea, tick and heartworm product</h3>
      <div class="form-row">${field('preventiveName', 'Product name', 'text', 'placeholder="e.g. a monthly chew"')}
      <label class="block">Given every<select data-prof="preventiveDays">${[[30, 'Month'], [90, '3 months'], [14, '2 weeks'], [7, 'Week']].map(([d, t]) => `<option value="${d}" ${Number(p.preventiveDays || 30) === d ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <h3>Where you live</h3>
      <p class="muted">${p.suburb ? `Using ${esc(p.suburb.name)}.` : 'Using the Gold Coast until you set your suburb.'}</p>
      <div class="form-row"><input id="suburb-q" placeholder="Suburb, e.g. Palm Beach"><button class="btn sm" data-act="suburb-search">Find</button></div>
      <div id="suburb-results"></div>
      ${field('postcode', 'Postcode (fireworks back-up match)', 'text', 'inputmode="numeric" maxlength="4"')}
      <h3>Contacts</h3>
      <div class="form-row">${field('vetName', 'Vet clinic')}${field('vetPhone', 'Vet phone', 'tel')}</div>
      <div class="form-row">${field('emName', '24-hour vet')}${field('emPhone', '24-hour vet phone', 'tel')}</div>
      <div class="form-row">${field('chip', 'Microchip number', 'text', 'inputmode="numeric"')}${field('ownerPhone', 'Your phone (for sitters)', 'tel')}</div>
      <h3>For sitters</h3>
      ${field('food', 'Food and amounts')}${field('routine', 'Daily routine')}${field('meds', 'Medicines')}${field('quirks', 'Good to know (fears, habits)')}
    </section>`;
    const sitterCard = `<section class="card"><h2>Sitter sheet</h2><pre class="sitter">${esc(sitter)}</pre>
      <div class="form-row"><button class="btn" data-act="share">Share</button><button class="btn ghost" data-act="copy">Copy</button></div></section>`;
    const backup = `<section class="card"><h2>Backup</h2><p class="muted">Everything is stored only on this phone. Save a backup file now and then.</p>
      <div class="form-row"><button class="btn" data-act="export">Save backup</button><label class="btn ghost">Restore<input type="file" accept="application/json" id="import" hidden></label></div></section>`;
    const about = `<section class="card"><h2>Sources</h2><ul class="tiny src">
      <li>Council registration: City of Gold Coast, register your dog (12 weeks + 14 days; renew by 31 Aug)</li>
      <li>Vaccinations: RSPCA Australia knowledge base, WSAVA guidelines</li>
      <li>Worming: University of Sydney vet hospital parasite calendar</li>
      <li>Breeder check: Queensland Dog Breeder Register (qdbr.daf.qld.gov.au)</li>
      <li>Staffy DNA tests: The Kennel Club (HC-HSF4), breed clubs (L-2-HGA)</li>
      <li>Fireworks: Qld open data, Upcoming fireworks displays (RSHQ)</li>
      <li>Weather: Open-Meteo. Heat model from Paw Window (BOM apparent temperature + surface heating)</li>
      <li>Training: reward-based methods as recommended by RSPCA Australia</li></ul></section>`;
    return em + (dogHome() ? '' : ready) + profile + sitterCard + (dogHome() ? ready : '') + backup + about;
  }

  // ---------- actions ----------
  function addLog(type, extra = {}) {
    S.log.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: localStamp(), type, ...extra });
    save('log');
  }

  function weighSheet() {
    sheet(`<h2>Weigh-in</h2><label class="block">Weight in kg<input id="kg" type="number" step="0.1" min="0" inputmode="decimal"></label>
      <p class="tiny">Hold the puppy on the bathroom scales, then subtract your own weight.</p><button class="btn" data-act="save-weight">Save</button>`);
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (ev.target.id === 'sheet') return closeSheet();
    if (!b || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA' || (b.tagName === 'INPUT' && b.type !== 'button')) return;
    const a = b.dataset.act;
    if (a === 'tab') { tab = b.dataset.tab; render(); if (b.dataset.scroll) setTimeout(() => { const e = document.getElementById(b.dataset.scroll); if (e) e.scrollIntoView({ behavior: 'smooth' }); }, 50); else window.scrollTo(0, 0); }
    else if (a === 'q') { addLog(b.dataset.type); toast(`${TYPES[b.dataset.type]} logged`); render(); }
    else if (a === 'weigh') weighSheet();
    else if (a === 'save-weight') {
      const kg = parseFloat($('#kg').value);
      if (!(kg > 0 && kg < 100)) return toast('Enter a weight in kg');
      addLog('weight', { kg: Math.round(kg * 10) / 10 }); closeSheet(); toast('Weight saved'); render();
    } else if (a === 'done') {
      const it = schedule().find((i) => i.id === b.dataset.id);
      sheet(`<h2>${esc(it.title)}</h2><label class="block">Date done<input id="done-date" type="date" value="${today()}" max="${today()}"></label><button class="btn" data-act="save-done" data-id="${it.id}">Save</button>`);
    } else if (a === 'save-done') {
      const d = $('#done-date').value; if (!d) return;
      (S.done[b.dataset.id] ||= []).push(d); save('done'); closeSheet(); toast('Saved'); render();
    } else if (a === 'undone') {
      const list = S.done[b.dataset.id] || [];
      const i = list.indexOf(b.dataset.date);
      if (i >= 0) list.splice(i, 1); // remove one entry, not every entry on that date
      save('done'); render();
    } else if (a === 'care-ics') {
      download('dog-days-care.ics', L.buildICS(L.careEvents(schedule(), S.profile.name)), 'text/calendar'); toast('Open the file to add it to your calendar');
    } else if (a === 'fw-ics') {
      download('dog-days-fireworks.ics', L.buildICS(L.fireworksEvents(fwNear)), 'text/calendar'); toast('Open the file to add it to your calendar');
    } else if (a === 'heat-refresh') drawHeat(true);
    else if (a === 'fw-refresh') drawFireworks(true);
    else if (a === 'heat-day') { S.settings.heatDay = Number(b.dataset.day); save('settings'); drawHeat(); }
    else if (a === 'plan') { openPlan = openPlan === b.dataset.plan ? null : b.dataset.plan; if (tab !== 'train') { tab = 'train'; openPlan = b.dataset.plan; } render(); const e = b.dataset.plan && document.querySelector(`[data-plan="${b.dataset.plan}"].card-head`); if (e) e.scrollIntoView({ block: 'start' }); }
    else if (a === 'rate') {
      const p = L.PLANS.find((x) => x.id === b.dataset.plan);
      const step = Math.min(S.progress[p.id] || 0, p.steps.length - 1);
      S.sessions.push({ plan: p.id, step, date: today(), rating: b.dataset.r }); save('sessions'); toast('Session logged'); render();
    } else if (a === 'step') {
      const p = L.PLANS.find((x) => x.id === b.dataset.plan);
      S.progress[p.id] = Math.max(0, Math.min(p.steps.length - 1, (S.progress[p.id] || 0) + Number(b.dataset.d))); save('progress');
      S.stepStart[p.id] = S.sessions.length; save('stepStart'); render();
    } else if (a === 'timer') startTimer(b.dataset.plan);
    else if (a === 'timer-stop') { clearInterval(timer); render(); }
    else if (a === 'soc') { const k = b.dataset.item; S.social[k] = (S.social[k] || 0) + 1; save('social'); render(); }
    else if (a === 'del') { S.log = S.log.filter((e) => e.id !== b.dataset.id); save('log'); render(); }
    else if (a === 'add-entry') {
      const type = $('#new-type').value, t = $('#new-time').value || localStamp();
      const kg = parseFloat($('#new-kg').value), note = $('#new-note').value.trim();
      if (type === 'weight' && !(kg > 0)) return toast('Enter the weight in kg');
      S.log.push({ id: Date.now().toString(36), t: t.slice(0, 16), type, ...(type === 'weight' ? { kg: Math.round(kg * 10) / 10 } : {}), ...(note ? { note } : {}) });
      save('log'); toast('Added'); render();
    } else if (a === 'suburb-search') {
      const q = $('#suburb-q').value.trim(); if (!q) return;
      const box = $('#suburb-results'); box.textContent = 'Searching…';
      try {
        const res = await geocode(q);
        box.innerHTML = res.length ? res.slice(0, 6).map((r, i) => `<button class="row-btn" data-act="suburb-pick" data-i="${i}"><span>${esc(r.name)}<br><small>${esc([r.admin2, r.admin1].filter(Boolean).join(', '))}</small></span></button>`).join('') : '<p class="muted">No Queensland match.</p>';
        box._res = res;
      } catch (e) { box.textContent = 'Search failed (offline?)'; }
    } else if (a === 'suburb-pick') {
      const r = $('#suburb-results')._res[Number(b.dataset.i)];
      S.profile.suburb = { name: r.name, lat: r.latitude, lon: r.longitude, postcode: (r.postcodes || [])[0] || '' };
      save('profile'); toast(S.profile.postcode || S.profile.suburb.postcode ? `Using ${r.name}` : `Using ${r.name}. Add your postcode below too`); render();
    } else if (a === 'share') {
      const text = L.sitterText(S.profile, schedule(), today());
      if (navigator.share) { try { await navigator.share({ title: `${dogName()}: sitter notes`, text }); } catch (e) { /* cancelled */ } }
      else { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy failed'); } }
    } else if (a === 'copy') {
      try { await navigator.clipboard.writeText(L.sitterText(S.profile, schedule(), today())); toast('Copied'); } catch (e) { toast('Copy failed'); }
    } else if (a === 'photo-open') openPhoto(b.dataset.id);
    else if (a === 'photo-save' || a === 'photo-profile') {
      const p = photos.find((x) => x.id === b.dataset.id); if (!p) return;
      const date = $('#ph-date').value, note = $('#ph-note').value.trim();
      if (date) p.date = date;
      p.note = note;
      try { await PhotoDB.put(p); } catch (e) { return toast('Could not save: storage is full or blocked'); }
      if (a === 'photo-profile') { S.profile.photoId = p.id; save('profile'); }
      closeSheet(); toast(a === 'photo-profile' ? 'Profile photo set' : 'Saved'); render();
    } else if (a === 'photo-del') {
      if (!confirm('Delete this photo from the app? The original in your camera roll is not affected.')) return;
      const id = b.dataset.id;
      try { await PhotoDB.del(id); } catch (e) { return toast('Could not delete'); }
      photos = photos.filter((x) => x.id !== id);
      if (thumbURLs.has(id)) { URL.revokeObjectURL(thumbURLs.get(id)); thumbURLs.delete(id); }
      if (S.profile.photoId === id) { delete S.profile.photoId; save('profile'); }
      closeSheet(); toast('Photo deleted'); render();
    } else if (a === 'export') {
      const data = { app: 'dog-days', version: 1, saved: new Date().toISOString() };
      BACKUP_KEYS.forEach((k) => { data[k] = S[k]; });
      download(`dog-days-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    }
  });

  // Long-press a socialisation tag (finger held still for 0.6 s) to take one off.
  // Any movement, cancel (the browser taking over for a scroll) or scroll aborts it, and the
  // "swallow the click that follows" flag only lasts until that click or the next press.
  const press = { timer: null, x: 0, y: 0, swallow: false };
  const cancelPress = () => { clearTimeout(press.timer); press.timer = null; };
  document.addEventListener('pointerdown', (ev) => {
    press.swallow = false; cancelPress();
    const b = ev.target.closest('[data-act="soc"]'); if (!b) return;
    press.x = ev.clientX; press.y = ev.clientY;
    press.timer = setTimeout(() => {
      press.timer = null; press.swallow = true;
      const k = b.dataset.item; S.social[k] = Math.max(0, (S.social[k] || 0) - 1); save('social'); render(); toast('Took one off');
    }, 600);
  });
  document.addEventListener('pointermove', (ev) => { if (press.timer && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 8) cancelPress(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, cancelPress));
  window.addEventListener('scroll', cancelPress, { passive: true });
  document.addEventListener('click', (ev) => {
    // The click that ends a long-press (whatever element is under the finger after the re-render) is not a tap.
    if (press.swallow) { press.swallow = false; ev.stopImmediatePropagation(); }
  }, true);

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.prof) {
      const k = t.dataset.prof;
      S.profile[k] = t.type === 'checkbox' ? t.checked : k === 'preventiveDays' ? Number(t.value) : t.value.trim();
      save('profile'); header();
      if (['birthday', 'homeDate', 'name'].includes(k)) toast('Saved');
    } else if (t.dataset.act === 'surface') { S.settings.surface = t.value; save('settings'); drawHeat(); }
    else if (t.dataset.act === 'radius') { S.settings.radius = Number(t.value); save('settings'); drawFireworks(); }
    else if (t.dataset.act === 'ready') { S.ready[t.dataset.item] = t.checked; save('ready'); }
    else if (t.dataset.act === 'enable') {
      const id = t.dataset.plan;
      S.enabled = t.checked ? [...new Set([...S.enabled, id])] : S.enabled.filter((x) => x !== id);
      save('enabled'); render();
    } else if (t.dataset.act === 'note') { S.notes[t.dataset.plan] = t.value; save('notes'); }
    else if (t.id === 'photo-input' || t.id === 'profile-photo-input') {
      const files = [...t.files]; t.value = '';
      if (files.length) { toast(files.length > 1 ? `Adding ${files.length} photos…` : 'Adding photo…'); addPhotos(files, t.id === 'profile-photo-input'); }
    } else if (t.id === 'import') {
      const f = t.files[0]; if (!f) return;
      f.text().then((txt) => {
        const d = JSON.parse(txt);
        if (!d || d.app !== 'dog-days') throw new Error('not a Dog Days backup');
        // Check every key's shape before saving anything, so a bad file can't leave the app unable to start.
        const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
        const bad = BACKUP_KEYS.filter((k) => k in d && !(ARRAY_KEYS.includes(k) ? Array.isArray(d[k]) : isObj(d[k])));
        if (bad.length) throw new Error(`damaged: ${bad.join(', ')}`);
        if (Array.isArray(d.log) && d.log.some((e) => !e || typeof e.t !== 'string' || typeof e.type !== 'string')) throw new Error('damaged: log entries');
        if (isObj(d.done) && Object.values(d.done).some((v) => !Array.isArray(v) || v.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x)))) throw new Error('damaged: care dates');
        if (!confirm('Replace everything in the app with this backup?')) return;
        BACKUP_KEYS.forEach((k) => { if (k in d) { S[k] = d[k]; save(k); } });
        toast('Backup restored'); render();
      }).catch((e) => toast('Could not read that file: ' + e.message));
    }
  });

  $('.tabbar').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    tab = b.dataset.tab; openPlan = null; render(); window.scrollTo(0, 0);
  });
  $('#sheet-close').addEventListener('click', closeSheet);

  render();
  // Photos load after the first paint; if storage is unavailable the rest of the app still works.
  PhotoDB.all().then((list) => { photos = list || []; if (photos.length || S.profile.photoId) render(); })
    .catch(() => { photos = []; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
