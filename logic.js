// Dog Days: pure functions and content. No DOM, no storage, so tests can load it directly.
// Dates are local calendar days as 'YYYY-MM-DD' strings throughout.
(function (root) {
  const DAY = 864e5;

  // ---------- dates ----------
  function ms(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(d, n) { return iso(ms(d) + n * DAY); }
  function diffDays(a, b) { return Math.round((ms(b) - ms(a)) / DAY); } // b − a
  function addMonths(d, n) {
    const [y, m, dd] = d.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(dd, last));
    return iso(first.getTime());
  }
  const maxDate = (...ds) => ds.filter(Boolean).sort().pop();
  function ageWeeks(birthday, today) { return birthday ? diffDays(birthday, today) / 7 : null; }
  function ageText(birthday, today) {
    if (!birthday) return '';
    const days = diffDays(birthday, today);
    if (days < 0) return 'not born yet';
    if (days < 7 * 16) return `${Math.floor(days / 7)} weeks old`;
    const months = Math.floor(days / 30.44);
    if (months < 24) return `${months} months old`;
    return `${Math.floor(days / 365.25)} years old`;
  }

  // Getting-ready mode until the puppy's homecoming day.
  function hasDog(profile, today) { return !!(profile && profile.homeDate && profile.homeDate <= today); }

  // ---------- care schedule ----------
  // done: { itemId: ['YYYY-MM-DD', ...] }  (sorted or not; we sort)
  function lastDone(done, id) { const a = (done[id] || []).slice().sort(); return a[a.length - 1] || null; }

  function status(due, today) {
    const n = diffDays(today, due);
    if (n < 0) return 'overdue';
    if (n <= 3) return 'due';
    if (n <= 14) return 'soon';
    return 'later';
  }

  const SRC = {
    rego: 'City of Gold Coast: register within 14 days of 12 weeks old (or of moving to the city); renew by 31 August',
    vax: 'RSPCA Australia / WSAVA: puppy doses about 4 weeks apart, the last at 16 weeks or older. Your vet sets the exact plan',
    worm: 'Sydney Uni vet hospital: every 2 weeks to 12 weeks old; then monthly to 6 months; then every 3 months. Check your product label',
  };

  function careSchedule(profile, done, today, extra = {}) {
    const p = profile || {};
    const bd = p.birthday;
    // Everything is anchored to the homecoming day; without it the dates would slide forward daily.
    if (!bd || !p.homeDate) return [];
    const home = p.homeDate;
    const items = [];
    // occ: how many times this item has been done, so each occurrence gets a stable calendar UID.
    const push = (o) => items.push({ occ: (done[o.id] || []).length, ...o, status: o.doneOn ? 'done' : status(o.due, today) });

    // First vet check
    const vet = lastDone(done, 'vetcheck');
    push({ id: 'vetcheck', title: 'First vet check', due: addDays(home, 3), doneOn: vet, once: true,
      why: 'Within a few days of coming home. Bring the vaccination card and worming record.' });

    // Microchip into your name
    const chip = lastDone(done, 'chip');
    push({ id: 'chip', title: 'Put the microchip in your name', due: addDays(home, 7), doneOn: chip, once: true,
      why: 'The seller chips the puppy before sale. Update the registry with your details so a lost dog comes back to you.' });

    // Vaccinations: show each dose; the next undone one carries a due date.
    const v1 = lastDone(done, 'vax1'), v2 = lastDone(done, 'vax2'), v3 = lastDone(done, 'vax3');
    push({ id: 'vax1', title: 'Puppy vaccination 1 of 3', due: addDays(bd, 56), doneOn: v1, once: true,
      why: 'Usually at 6–8 weeks; the breeder often gives this one. Log the date from the vaccination card.', src: SRC.vax });
    if (v1) push({ id: 'vax2', title: 'Puppy vaccination 2 of 3', due: addDays(v1, 28), doneOn: v2, once: true,
      why: 'About 4 weeks after the first.', src: SRC.vax });
    if (v2) push({ id: 'vax3', title: 'Puppy vaccination 3 of 3', due: maxDate(addDays(v2, 28), addDays(bd, 112)), doneOn: v3, once: true,
      why: 'About 4 weeks after the second, and not before 16 weeks old. Ask your vet when the puppy can walk where other dogs go.', src: SRC.vax });
    if (v3) {
      const boost = lastDone(done, 'annual');
      push({ id: 'annual', title: boost ? 'Yearly health check' : 'First booster and health check',
        due: boost ? addDays(boost, 365) : maxDate(addDays(bd, 365), addDays(v3, 182)),
        why: boost ? 'Your vet will say which vaccines are due this year.' : 'Around 12 months old (some vets do it at 6 months).', src: SRC.vax });
    }

    // Intestinal worming: interval depends on age at the last dose.
    const w = lastDone(done, 'worm');
    let wDue;
    if (!w) wDue = maxDate(home, addDays(bd, 14));
    else {
      const wk = ageWeeks(bd, w);
      wDue = wk < 12 ? addDays(w, 14) : wk < 26 ? addMonths(w, 1) : addMonths(w, 3);
    }
    push({ id: 'worm', title: 'Intestinal wormer', due: wDue,
      why: w ? 'Dose is by weight, so weigh first.' : 'Ask the breeder when the last dose was and log it here.', src: SRC.worm });

    // Flea, tick and heartworm preventive
    const prevDays = Number(p.preventiveDays) || 30;
    const pv = lastDone(done, 'prev');
    push({ id: 'prev', title: `Flea, tick and heartworm preventive${p.preventiveName ? ` (${p.preventiveName})` : ''}`,
      due: pv ? (prevDays === 30 ? addMonths(pv, 1) : prevDays === 90 ? addMonths(pv, 3) : addDays(pv, prevDays)) : home,
      why: 'Paralysis ticks live on the Gold Coast all year. Check the head and neck daily too, even with a preventive.' });

    // Council registration, then yearly renewal by 31 August
    const rg = lastDone(done, 'rego');
    if (!rg) {
      push({ id: 'rego', title: 'Register with the council', due: addDays(maxDate(addDays(bd, 84), home), 14),
        why: 'Within 14 days of 12 weeks old. Get the tag on the collar.', src: SRC.rego });
    } else {
      let y = Number(rg.slice(0, 4));
      if (`${y}-08-31` <= rg) y += 1;
      push({ id: 'rego', title: 'Renew council registration', due: `${y}-08-31`, why: 'Renewals are due by 31 August.', src: SRC.rego });
    }

    // Desexing conversation
    const dx = lastDone(done, 'desex');
    if (!p.desexed) push({ id: 'desex', title: 'Ask your vet about desexing', due: addMonths(bd, 5), doneOn: dx, once: true,
      why: 'Timing varies by dog; it also lowers the council fee.' });

    // Weigh-ins: weekly as a puppy, monthly as an adult
    const lastW = extra.lastWeight || null;
    const puppy = ageWeeks(bd, today) < 52;
    push({ id: 'weigh', occ: extra.weightCount || 0, title: 'Weigh-in', due: lastW ? (puppy ? addDays(lastW, 7) : addMonths(lastW, 1)) : home, auto: true,
      why: puppy ? 'Weekly while growing. Wormer and preventive doses go by weight.' : 'Monthly.' });

    const order = { overdue: 0, due: 1, soon: 2, later: 3, done: 4 };
    return items.sort((a, b) => order[a.status] - order[b.status] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  }

  // ---------- feeding and toilet rules of thumb ----------
  function mealsPerDay(ageW) { return ageW == null ? 2 : ageW < 12 ? 4 : ageW < 26 ? 3 : 2; }
  // Common rule of thumb: a puppy can hold on about (age in months + 1) hours, up to 8, while awake.
  function toiletGapHours(ageW) {
    if (ageW == null) return 4;
    return Math.max(1, Math.min(8, Math.floor(ageW / 4.345) + 1));
  }

  // ---------- training ----------
  const PLANS = [
    { id: 'basics', title: 'Puppy basics', blurb: 'Name, toilet, sit, settle, handling, short times alone.', puppyOnly: true, steps: [
      { t: 'Name game', how: 'Say the name once in a happy voice. The moment they look at you, say "yes" and give a treat. Ten goes, then stop.', goal: 'Looks at you 8 times out of 10 at home.' },
      { t: 'Hand touch', how: 'Hold a flat palm near the nose. Nose touches palm → "yes" + treat. Move your hand a little further each time.', goal: 'Touches your palm 8 times out of 10 from 1 metre away.' },
      { t: 'Sit', how: 'Lure the nose up and back with a treat until the bottom drops; "yes" + treat. After a few goes, use the same hand movement with no treat in it, then reward from the other hand.', goal: '8 out of 10 sits from the hand signal alone.' },
      { t: 'Settle on a mat', how: 'Put a mat down. Reward any paw on it, then lying on it. Drop calm treats between their paws while they stay lying down. Build from 10 seconds to 2 minutes.', goal: 'Lies on the mat for 2 minutes while you sit nearby.' },
      { t: 'Handling', how: 'Touch an ear, a paw, the mouth, the collar, the tail. Each touch → treat. Keep touches short; stop before they wriggle.', goal: 'Relaxed for all five touches, two days in a row.' },
      { t: 'Short times alone', how: 'Give a chew behind a baby gate, step out of sight for a moment, come back calmly. Build up: 1 minute, 5 minutes, 15 minutes.', goal: 'Calm for 15 minutes alone with a chew.' },
    ], note: 'Toilet training runs alongside this: use the Toilet button on the Today tab. Mouthing is normal: swap in a toy, and pause play if teeth touch skin.' },
    { id: 'lead', title: 'Loose-lead walking', blurb: 'Staffies are strong; start before they are.', steps: [
      { t: 'Pay the spot', how: 'Standing still indoors, feed treats at the seam of your trouser leg whenever they are next to you. Fast and generous.', goal: '20 treats in a minute with them glued to your leg.' },
      { t: 'One step at a time', how: 'Take one step; treat at your leg. Then two steps, then three. Go back a step if they get ahead.', goal: '10 steps with a slack lead in the house.' },
      { t: 'Be a tree', how: 'In the yard: the moment the lead goes tight, stop. When it goes slack, say "yes", treat at your leg and walk on.', goal: '5 minutes in the yard with fewer than 3 stops.' },
      { t: 'U-turns', how: 'Say "this way" cheerfully and turn around; treat when they catch up at your leg. This becomes your escape move on walks.', goal: 'Turns with you straight away 8 times out of 10.' },
      { t: 'Quiet street', how: 'Short walk (5–10 min) at a quiet time, treating often at your leg. Use "be a tree" and U-turns.', goal: 'Mostly slack lead for a whole short walk.' },
      { t: 'Add distractions', how: 'Walk past a parked bike, a bin or a person at a distance where they can still take treats. Close the distance over several days.', goal: 'Slack lead past a person on the other side of the street.' },
    ], note: 'A well-fitted harness spares the neck while they learn.' },
    { id: 'recall', title: 'Recall', blurb: 'Coming when called, so off-lead areas are safe.', steps: [
      { t: 'Charge the word', how: 'Say "come" (or blow a whistle), then give a jackpot treat right away. They don\'t have to move yet. Ten times a session.', goal: 'Ears and head snap round when they hear it.' },
      { t: 'Short indoor recalls', how: 'A helper gently holds the puppy; you call once from 2–3 m and run backwards. Party when they arrive.', goal: 'Comes straight away 9 times out of 10.' },
      { t: 'Yard recalls', how: 'Call from 3–5 m when they are sniffing something boring. Never call for something they dislike (bath, going inside).', goal: 'Comes away from mild sniffing 8 times out of 10.' },
      { t: 'Collar grab and release', how: 'When they arrive, hold the collar for a second, treat, then let them go back to playing. Coming back shouldn\'t end the fun.', goal: 'Comes in and waits for the collar touch happily.' },
      { t: 'Long line', how: 'Use a 5–10 m long line at a quiet park. Call when they are not looking at anything exciting.', goal: '8 out of 10 at the end of the line.' },
      { t: 'With distractions', how: 'On the long line, call away from things at a distance (other dogs, people). Only use off-lead in fenced or signed off-lead areas until this is solid.', goal: 'Comes away from a dog 20 m away.' },
    ], note: 'Only call once. If they don\'t come, go and get them calmly and make the next one easier.' },
    { id: 'calm', title: 'Calm at home', blurb: 'Greeting without jumping, settling, less barking.', steps: [
      { t: 'Four paws on the floor', how: 'When they run up, treat on the floor while all four paws are down. If they jump, turn away, then reward the moment paws land.', goal: 'Greets you without jumping 8 times out of 10.' },
      { t: 'Visitor arrivals', how: 'Lead on or behind a gate when someone arrives. Treat for calm; the visitor says hello only when paws are down.', goal: 'Calm greeting with one visitor.' },
      { t: 'Settle with noise', how: 'Mat settle while a doorbell or knock plays quietly on your phone. Turn it up only when they stay relaxed.', goal: 'Stays on the mat through a doorbell sound.' },
      { t: 'Thanks, that\'ll do', how: 'After one or two barks, say "thanks", call them to you and treat the quiet. Don\'t yell: it sounds like barking along.', goal: 'Stops and comes to you after 2 barks.' },
      { t: 'Daily brain work', how: 'Sniff games, a lick mat, scatter feeding or a frozen Kong. Tired brains bark less, and it\'s the hot-day walk replacement.', goal: '10 minutes of enrichment every day for a week.' },
    ] },
    { id: 'react', title: 'Calm on walks', blurb: 'For lunging or barking at dogs, people or traffic. With a puppy, this is prevention.', steps: [
      { t: 'Find the distance', how: 'On a walk, notice how far away a dog or person can be while yours can still eat treats and look at you. Write that distance in the notes.', goal: 'You know their comfortable distance.' },
      { t: 'Look at that', how: 'At that distance: the moment they look at the trigger, say "yes" and treat. Looking calmly is the behaviour you want.', goal: 'Looks, then turns back to you for the treat, 5 times in a row.' },
      { t: 'Emergency U-turn', how: 'Practise "this way" and a quick turn at home until it\'s automatic, then use it whenever something is too close.', goal: 'Turns instantly on the cue, on a walk.' },
      { t: '1-2-3 walking', how: 'Count "1, 2, 3" out loud and treat on 3 as you walk past a trigger at a distance. The rhythm keeps them with you.', goal: 'Walks past a trigger across the road without reacting.' },
      { t: 'Close the gap slowly', how: 'Only after three good sessions in a row, move a few metres closer. Back off if they stop taking treats.', goal: 'Your notes show the distance shrinking.' },
    ], note: 'If reactions are intense or getting worse, see a vet behaviourist. Some Staffies get choosier about other dogs as adults; lots of calm, positive puppy meetings help.' },
  ];

  // sessions: [{ plan, step, date, rating: 'good'|'ok'|'hard' }] in the order they were logged.
  // since: index into sessions where this step was last entered, so ratings from an earlier
  // visit to the same step (e.g. before a step back) don't count.
  function stepAdvice(sessions, plan, step, since = 0) {
    const s = sessions.slice(since).filter((x) => x.plan === plan && x.step === step);
    const last = s.slice(-3);
    if (last.length === 3 && last.every((x) => x.rating === 'good')) return 'next';
    const last2 = s.slice(-2);
    if (step > 0 && last2.length === 2 && last2.every((x) => x.rating === 'hard')) return 'back';
    return 'stay';
  }

  // Up to `n` plans for today: puppy basics first while young, then whichever was practised longest ago.
  function todaysTraining(sessions, progress, enabled, ageW, today, n = 3) {
    const lastDate = (id) => sessions.filter((s) => s.plan === id).reduce((a, s) => (s.date > a ? s.date : a), '');
    let plans = PLANS.filter((p) => enabled.includes(p.id) && !(p.puppyOnly && ageW != null && ageW > 30));
    const doneToday = (id) => sessions.some((s) => s.plan === id && s.date === today);
    plans = plans.slice().sort((a, b) => {
      if (a.id === 'basics' && ageW != null && ageW < 26) return -1;
      if (b.id === 'basics' && ageW != null && ageW < 26) return 1;
      return lastDate(a.id) < lastDate(b.id) ? -1 : lastDate(a.id) > lastDate(b.id) ? 1 : 0;
    });
    return plans.slice(0, n).map((p) => {
      const step = Math.min(progress[p.id] || 0, p.steps.length - 1);
      return { plan: p.id, title: p.title, step, stepTitle: p.steps[step].t, done: doneToday(p.id) };
    });
  }

  const SOCIAL = [
    { group: 'People', items: ['Men with beards or hats', 'Children (calm, from a distance first)', 'People in hi-vis or uniforms', 'Someone with an umbrella or walking stick', 'Visitors at the front door'] },
    { group: 'Surfaces', items: ['Grass', 'Sand', 'Tiles and slippery floors', 'Wet ground', 'Metal grate or drain cover', 'A wobbly board or cushion'] },
    { group: 'Sounds', items: ['Traffic', 'Thunderstorm recording (quiet, then louder)', 'Fireworks recording (quiet, then louder)', 'Vacuum cleaner', 'Lawn mower or leaf blower', 'Hair dryer'] },
    { group: 'Places', items: ['Car ride', 'Vet visit just for treats', 'Outside a café', 'Pet shop', 'Beach (ask your vet first)', 'Puppy preschool'] },
    { group: 'Animals', items: ['A calm, vaccinated adult dog', 'Puppies at preschool', 'A cat from a distance', 'Birds (ibis, magpies)'] },
    { group: 'Handling', items: ['Nail trim (one nail is fine)', 'Brushing', 'Bath', 'Ears and teeth checked', 'Harness on and off', 'Being lifted'] },
    { group: 'Things', items: ['Bikes and scooters', 'Skateboards', 'Prams', 'Wheelie bins on bin day', 'Ceiling fans'] },
  ];
  // AVSAB position statement: socialisation is easiest before about 14–16 weeks; keep going to 6 months.
  function socialPhase(ageW) {
    if (ageW == null) return null;
    if (ageW < 16) return { key: 'prime', text: 'Prime time: new things are easiest to accept before about 16 weeks. Aim for a few calm new things every day.' };
    if (ageW < 26) return { key: 'keep', text: 'Keep going to 6 months: repeat the list, especially anything that worried them.' };
    return { key: 'keep-up', text: 'Keep it topped up with regular calm outings.' };
  }

  const READY = [
    { group: 'Choosing', items: [
      { t: 'Rescue or breeder?', d: 'Staffies are common at RSPCA Qld and AWLQ. An older rescue comes with a known temperament.' },
      { t: 'Check the supply number', d: 'Qld ads must show a supply number. Check it at qdbr.daf.qld.gov.au; it is also in the microchip record.' },
      { t: 'Meet the puppy with its mother', d: 'See where they live. Walk away from car-park handovers and deposits for puppies you haven\'t seen.' },
      { t: 'Ask for DNA certificates', d: 'Both parents, for L-2-HGA and HC (hereditary cataract). Ask for the paperwork, not a verbal "clear".' },
      { t: 'Paperwork to take home', d: 'Vaccination card, worming dates, microchip number, food brand and amounts.' },
    ] },
    { group: 'Before homecoming', items: [
      { t: 'Choose a vet', d: 'Book the first check for the first few days home. Save the number in Settings, with the nearest 24-hour vet.' },
      { t: 'Decide on pet insurance', d: 'Before the first vet visit: anything found then can be excluded later as pre-existing.' },
      { t: 'Book puppy preschool', d: 'Many vet clinics run them, often from the first vaccination.' },
      { t: 'Supplies', d: 'Crate or pen, bed, bowls, the breeder\'s food, harness, lead, collar and ID tag, chew toys, enzyme cleaner, treat pouch, brush, nail clippers.' },
      { t: 'Puppy-proof the house', d: 'Cords, toxic plants, chemicals, bin lids, gaps in the fence, pool fence.' },
      { t: 'Cane toad plan', d: 'Toads come out at night in the yard. Supervise evening toilet trips; if your dog mouths a toad, wipe the gums with a damp cloth and call a vet.' },
      { t: 'Plan the first week', d: 'Someone home, a toilet spot, a quiet sleeping spot near you at night.' },
      { t: 'Fill in the dog\'s details', d: 'Birthday and homecoming date in Settings turn on the care schedule.' },
    ] },
  ];

  // ---------- heat (Paw Window's model, fed by an hourly forecast) ----------
  const HEAT_BANDS = [26, 30, 34, 38];
  const PAW_BANDS = [42, 48, 52];
  const PAW_TO_LEVEL = [0, 1, 3, 4];
  const LEVELS = ['Great', 'Good', 'With care', 'Toilet only', 'No walk'];
  const SURFACES = {
    concrete: { label: 'Concrete footpath', k: 20, tau: 1.4 },
    bitumen: { label: 'Bitumen road', k: 29, tau: 1.6 },
    sand: { label: 'Dry sand', k: 25, tau: 0.8 },
    grass: { label: 'Grass', k: 8, tau: 0.6 },
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function dewPoint(t, rh) { const g = Math.log(clamp(rh, 1, 100) / 100) + 17.27 * t / (237.7 + t); return 237.7 * g / (17.27 - g); }
  const vapour = (td) => 6.105 * Math.exp(17.27 * td / (237.7 + td));

  function dogMod(dog, ageW) {
    let m = 0;
    if (ageW != null && ageW < 52) m += 1;
    if (ageW != null && ageW > 52 * 8) m += 2;
    if (dog.overweight) m += 3;
    if (dog.acclim === 'new') m += 2;
    if (dog.acclim === 'used') m -= 1;
    return m;
  }

  // hours: [{ time: 'YYYY-MM-DDTHH:00', temp, rh, wind (km/h), sw (W/m², mean of the hour before) }]
  function hourlyHeat(hours, dog, ageW, surfaceKey = 'concrete') {
    const S = SURFACES[surfaceKey] || SURFACES.concrete;
    const mod = dogMod(dog || {}, ageW);
    let lag = 0;
    return hours.map((h) => {
      const v = (h.wind || 0) / 3.6;
      const wDog = 0.6 * v;
      const wf = 31 / (23 + 4 * v);
      lag += ((h.sw || 0) - lag) * (1 - Math.exp(-1 / S.tau));
      const surf = h.temp + S.k * lag / 1000 * wf;
      const e = vapour(dewPoint(h.temp, h.rh));
      const Q = 0.12 * (h.sw || 0);
      const dogAT = h.temp + 0.348 * e - 0.70 * wDog + 0.70 * Q / (wDog + 10) - 4.25 + mod
        + (dog && dog.darkCoat ? 1.5 * Math.min(1, (h.sw || 0) / 800) : 0);
      let heat = 0; while (heat < 4 && dogAT >= HEAT_BANDS[heat]) heat++;
      let paw = 0; while (paw < 3 && surf >= PAW_BANDS[paw]) paw++;
      const level = Math.max(heat, PAW_TO_LEVEL[paw]);
      return { time: h.time, hour: Number(h.time.slice(11, 13)), date: h.time.slice(0, 10), temp: h.temp, dogAT, surf, level, by: PAW_TO_LEVEL[paw] > heat ? 'paw' : 'heat' };
    });
  }

  // Runs of daytime hours (5 am to 9 pm) on `date` at or below maxLevel.
  function walkWindows(rated, date, maxLevel = 1) {
    const day = rated.filter((r) => r.date === date && r.hour >= 5 && r.hour <= 20);
    const out = []; let run = null;
    for (const r of day) {
      if (r.level <= maxLevel) { if (!run) run = { from: r.hour, to: r.hour + 1, best: r.level }; else { run.to = r.hour + 1; run.best = Math.min(run.best, r.level); } }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
    return out;
  }

  // ---------- fireworks (Qld open data: Upcoming fireworks displays) ----------
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  function parseFwDate(s) {
    const m = String(s || '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!m || !MONTHS[m[2].toLowerCase()]) return null;
    return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  function parseFireworks(records) {
    return (records || []).map((r) => ({
      date: parseFwDate(r['Display Date']),
      time: String(r['Times(s)'] || r['Time(s)'] || '').trim(),
      suburb: titleCase(r.Suburb).trim(),
      postcode: r.PCode != null ? String(r.PCode) : '',
      address: String(r['Display Address'] || '').trim(),
      eventType: r['Event Type'] || '',
      displayType: r['Display Type'] || '',
    })).filter((f) => f.date);
  }
  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const fwKey = (f) => `${f.suburb}|${f.postcode}`;
  // geo: { 'Suburb|4217': { lat, lon } | null }. home: { lat, lon, postcode }.
  // A display whose suburb couldn't be placed is kept if its postcode matches home's, or, when
  // home has no postcode, kept with km = null ("distance unknown") rather than silently dropped.
  function nearbyFireworks(list, home, geo, today, days = 14, radiusKm = 10) {
    const end = addDays(today, days);
    const homePc = home && home.postcode ? String(home.postcode) : '';
    return list.filter((f) => f.date >= today && f.date <= end).map((f) => {
      const g = geo[fwKey(f)];
      const km = g && home && home.lat != null ? haversineKm(home, g) : null;
      return { ...f, km };
    }).filter((f) => (f.km != null ? f.km <= radiusKm : !homePc || f.postcode === homePc))
      .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  }

  // ---------- calendar file ----------
  const icsEsc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = (d, hhmm = '0800') => d.replace(/-/g, '') + 'T' + hhmm + '00';
  // RFC 5545 §3.1: content lines longer than 75 octets are folded with CRLF + a space.
  function fold(line) {
    const enc = new TextEncoder();
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      const limit = out.length ? 74 : 75; // continuation lines start with a space
      if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildICS(events, now = new Date()) {
    const dt = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    // SEQUENCE grows with export time, so a re-imported event replaces the older copy with the same UID.
    const seq = Math.floor(now.getTime() / 60000);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dog Days//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT', `UID:${e.uid}@dog-days`, `DTSTAMP:${dt}`, `SEQUENCE:${seq}`,
        `DTSTART:${stamp(e.date, e.time || '0800')}`, `DURATION:PT${e.minutes || 30}M`,
        `SUMMARY:${icsEsc(e.title)}`);
      if (e.note) lines.push(`DESCRIPTION:${icsEsc(e.note)}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:-PT${e.alarmMin || 0}M`, 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  // UID is the item plus how many times it's been done: the same reminder keeps its UID when its
  // date moves, and the next occurrence (after it's done) gets a new one.
  function careEvents(items, dogName) {
    return items.filter((i) => i.status !== 'done').map((i) => ({
      uid: `${i.id}-n${i.occ || 0}`, date: i.due, title: `${dogName || 'Dog'}: ${i.title}`, note: i.why || '',
    }));
  }
  function fireworksEvents(list) {
    return list.filter((f) => /^\d{1,2}:\d{2}$/.test(f.time)).map((f) => ({
      uid: `fw-${f.date}-${f.time.replace(':', '')}-${f.postcode}`, date: f.date, time: f.time.replace(':', '').padStart(4, '0'), minutes: 20, alarmMin: 120,
      title: `Fireworks in ${f.suburb}: dog inside`, note: `${f.address}, ${f.suburb}. Bring the dog in, close windows, TV or music on, a chew ready.`,
    }));
  }

  // ---------- sitter sheet ----------
  function sitterText(p, items, today) {
    const L = [];
    const name = p.name || 'The dog';
    L.push(`${name}${p.breed ? `, ${p.breed}` : ''}${p.birthday ? `, ${ageText(p.birthday, today)}` : ''}`);
    if (p.food) L.push(`Food: ${p.food}`);
    if (p.routine) L.push(`Routine: ${p.routine}`);
    if (p.quirks) L.push(`Good to know: ${p.quirks}`);
    if (p.meds) L.push(`Medicines: ${p.meds}`);
    const due = items.filter((i) => i.status !== 'done' && diffDays(today, i.due) <= 14 && !i.auto);
    if (due.length) L.push('Due soon: ' + due.map((i) => `${i.title} (${i.due})`).join('; '));
    L.push('');
    if (p.vetName || p.vetPhone) L.push(`Vet: ${[p.vetName, p.vetPhone].filter(Boolean).join(', ')}`);
    if (p.emName || p.emPhone) L.push(`24-hour vet: ${[p.emName, p.emPhone].filter(Boolean).join(', ')}`);
    L.push('Animal Poisons Helpline: 1300 869 738');
    if (p.chip) L.push(`Microchip: ${p.chip}`);
    if (p.ownerPhone) L.push(`Owner: ${p.ownerPhone}`);
    L.push('');
    L.push('Hot days: walk early or late only; if the footpath is too hot for the back of your hand for 7 seconds, it is too hot for paws.');
    L.push('Paralysis ticks: feel over the head and neck daily. Wobbly back legs, a changed bark or retching → vet straight away.');
    return L.join('\n');
  }

  root.DogLogic = {
    addDays, diffDays, addMonths, ageWeeks, ageText, hasDog, careSchedule, status, mealsPerDay, toiletGapHours,
    PLANS, stepAdvice, todaysTraining, SOCIAL, socialPhase, READY,
    LEVELS, SURFACES, hourlyHeat, walkWindows, dogMod,
    parseFireworks, parseFwDate, nearbyFireworks, haversineKm, fwKey,
    buildICS, careEvents, fireworksEvents, sitterText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DogLogic;
})(typeof window !== 'undefined' ? window : globalThis);
