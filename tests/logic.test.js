const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const find = (items, id) => items.find((i) => i.id === id);

test('date helpers', () => {
  assert.equal(L.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(L.diffDays('2026-11-23', '2026-12-01'), 8);
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(L.ageText('2026-10-01', '2026-11-26'), '8 weeks old');
  assert.equal(L.ageText('2026-01-01', '2026-11-23'), '10 months old');
});

test('getting-ready mode until homecoming', () => {
  assert.equal(L.hasDog({}, '2026-11-23'), false);
  assert.equal(L.hasDog({ homeDate: '2026-12-20' }, '2026-11-23'), false);
  assert.equal(L.hasDog({ homeDate: '2026-12-20' }, '2026-12-20'), true);
  assert.deepEqual(L.careSchedule({}, {}, '2026-11-23'), []);
});

test('new 8-week puppy: vet check, worming, vaccine 1, rego dates', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  const items = L.careSchedule(p, {}, '2026-11-26');
  assert.equal(find(items, 'vetcheck').due, '2026-11-29');
  assert.equal(find(items, 'vax1').due, '2026-11-26'); // 8 weeks old
  assert.equal(find(items, 'vax2'), undefined);         // only after dose 1 is logged
  assert.equal(find(items, 'worm').due, '2026-11-26');
  // 12 weeks = 24 Dec, +14 days
  assert.equal(find(items, 'rego').due, '2027-01-07');
  assert.equal(find(items, 'prev').due, '2026-11-26');
});

test('vaccine chain: 4 weeks apart, last not before 16 weeks', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  let items = L.careSchedule(p, { vax1: ['2026-11-20'] }, '2026-11-26');
  assert.equal(find(items, 'vax1').status, 'done');
  assert.equal(find(items, 'vax2').due, '2026-12-18');
  items = L.careSchedule(p, { vax1: ['2026-11-20'], vax2: ['2026-12-01'] }, '2026-12-02');
  // 4 weeks after dose 2 = 29 Dec, but 16 weeks old = 21 Jan
  assert.equal(find(items, 'vax3').due, '2027-01-21');
  items = L.careSchedule(p, { vax1: ['2026-11-20'], vax2: ['2026-12-01'], vax3: ['2027-01-21'] }, '2027-01-22');
  assert.equal(find(items, 'annual').due, '2027-10-01'); // 1 year old
  items = L.careSchedule(p, { vax1: ['2026-11-20'], vax2: ['2026-12-01'], vax3: ['2027-01-21'], annual: ['2027-10-03'] }, '2027-10-04');
  assert.equal(find(items, 'annual').title, 'Yearly health check');
  assert.equal(find(items, 'annual').due, '2028-10-02');
});

test('worming interval follows age at the last dose', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  assert.equal(find(L.careSchedule(p, { worm: ['2026-11-26'] }, '2026-11-27'), 'worm').due, '2026-12-10'); // 8 wks → 2 weeks
  assert.equal(find(L.careSchedule(p, { worm: ['2027-01-10'] }, '2027-01-11'), 'worm').due, '2027-02-10'); // 14 wks → monthly
  assert.equal(find(L.careSchedule(p, { worm: ['2027-05-01'] }, '2027-05-02'), 'worm').due, '2027-08-01'); // 30 wks → 3 months
});

test('registration renewal is the next 31 August', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  assert.equal(find(L.careSchedule(p, { rego: ['2027-01-05'] }, '2027-01-06'), 'rego').due, '2027-08-31');
  assert.equal(find(L.careSchedule(p, { rego: ['2027-08-31'] }, '2027-09-01'), 'rego').due, '2028-08-31');
  assert.equal(find(L.careSchedule(p, { rego: ['2027-09-10'] }, '2027-09-11'), 'rego').due, '2028-08-31');
});

test('preventive interval: monthly by calendar, 3-monthly, or custom days', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  assert.equal(find(L.careSchedule(p, { prev: ['2026-11-30'] }, '2026-12-01'), 'prev').due, '2026-12-30');
  assert.equal(find(L.careSchedule({ ...p, preventiveDays: 90 }, { prev: ['2026-11-30'] }, '2026-12-01'), 'prev').due, '2027-02-28');
  assert.equal(find(L.careSchedule({ ...p, preventiveDays: 14 }, { prev: ['2026-11-30'] }, '2026-12-01'), 'prev').due, '2026-12-14');
});

test('statuses and ordering', () => {
  assert.equal(L.status('2026-11-20', '2026-11-23'), 'overdue');
  assert.equal(L.status('2026-11-26', '2026-11-23'), 'due');
  assert.equal(L.status('2026-12-07', '2026-11-23'), 'soon');
  assert.equal(L.status('2026-12-08', '2026-11-23'), 'later');
  const items = L.careSchedule({ birthday: '2026-10-01', homeDate: '2026-11-26' }, { vetcheck: ['2026-11-27'] }, '2026-12-10');
  const order = { overdue: 0, due: 1, soon: 2, later: 3, done: 4 };
  for (let i = 1; i < items.length; i++) assert.ok(order[items[i - 1].status] <= order[items[i].status]);
  assert.equal(items[items.length - 1].id, 'vetcheck');
});

test('weigh-ins weekly as a puppy, monthly as an adult; desexed dogs skip the desexing item', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  assert.equal(find(L.careSchedule(p, {}, '2026-12-05', { lastWeight: '2026-12-01' }), 'weigh').due, '2026-12-08');
  assert.equal(find(L.careSchedule(p, {}, '2027-12-05', { lastWeight: '2027-12-01' }), 'weigh').due, '2028-01-01');
  assert.equal(find(L.careSchedule({ ...p, desexed: true }, {}, '2026-12-05'), 'desex'), undefined);
});

test('meals and toilet gaps by age', () => {
  assert.equal(L.mealsPerDay(9), 4);
  assert.equal(L.mealsPerDay(16), 3);
  assert.equal(L.mealsPerDay(40), 2);
  assert.equal(L.toiletGapHours(8), 2);   // ~1.8 months → 2 h
  assert.equal(L.toiletGapHours(13), 3);
  assert.equal(L.toiletGapHours(200), 8);
});

test('training: advance after 3 good, step back after 2 hard', () => {
  const s = [
    { plan: 'lead', step: 1, date: '2026-12-01', rating: 'good' },
    { plan: 'lead', step: 1, date: '2026-12-02', rating: 'good' },
  ];
  assert.equal(L.stepAdvice(s, 'lead', 1), 'stay');
  s.push({ plan: 'lead', step: 1, date: '2026-12-03', rating: 'good' });
  assert.equal(L.stepAdvice(s, 'lead', 1), 'next');
  s.push({ plan: 'lead', step: 1, date: '2026-12-04', rating: 'hard' }, { plan: 'lead', step: 1, date: '2026-12-05', rating: 'hard' });
  assert.equal(L.stepAdvice(s, 'lead', 1), 'back');
  assert.equal(L.stepAdvice([{ plan: 'lead', step: 0, date: 'a', rating: 'hard' }, { plan: 'lead', step: 0, date: 'b', rating: 'hard' }], 'lead', 0), 'stay');
});

test('training: puppy basics first while young, then least recently practised', () => {
  const all = L.PLANS.map((p) => p.id);
  const sessions = [{ plan: 'lead', step: 0, date: '2026-12-02', rating: 'ok' }, { plan: 'recall', step: 0, date: '2026-12-01', rating: 'ok' }];
  const t = L.todaysTraining(sessions, { lead: 2 }, all, 10, '2026-12-03');
  assert.equal(t[0].plan, 'basics');
  assert.equal(t.length, 3);
  assert.ok(!t.some((x) => x.plan === 'lead'), 'lead was practised most recently');
  const adult = L.todaysTraining([], { lead: 99 }, ['basics', 'lead'], 80, '2026-12-03');
  assert.deepEqual(adult.map((x) => x.plan), ['lead']);
  assert.equal(adult[0].step, L.PLANS.find((p) => p.id === 'lead').steps.length - 1);
});

test('every plan step has a title, method and goal', () => {
  for (const p of L.PLANS) for (const s of p.steps) assert.ok(s.t && s.how && s.goal, `${p.id}: ${s.t}`);
});

test('heat: cool morning is fine, hot sunny afternoon is not, puppy rates warmer', () => {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const sun = Math.max(0, Math.sin(Math.PI * (h - 5) / 14));
    hours.push({ time: `2026-12-20T${String(h).padStart(2, '0')}:00`, temp: 24 + 9 * sun, rh: 60, wind: 10, sw: 1000 * sun });
  }
  const r = L.hourlyHeat(hours, {}, 60, 'concrete');
  assert.ok(r[6].level <= 1, `6 am level ${r[6].level}`);
  assert.ok(r[13].level >= 3, `1 pm level ${r[13].level}`);
  assert.ok(r[13].surf > r[13].temp + 10, 'footpath much hotter than air in sun');
  const w = L.walkWindows(r, '2026-12-20', 1);
  assert.ok(w.length >= 1 && w[0].from === 5, JSON.stringify(w));
  const pup = L.hourlyHeat(hours, {}, 12, 'concrete');
  assert.ok(pup[10].dogAT > r[10].dogAT);
  const grass = L.hourlyHeat(hours, {}, 60, 'grass');
  assert.ok(grass[13].surf < r[13].surf);
});

test('fireworks: parse open data records and find nearby ones', () => {
  const recs = [
    { 'Display Date': 'Tuesday, 24 November 2026', 'Times(s)': '19:20', Suburb: 'GOLD COAST', PCode: 4217, 'Display Address': 'Broadwater Parklands', 'Event Type': 'Public', 'Display Type': 'Outdoor Display' },
    { 'Display Date': 'Friday, 27 November 2026', 'Times(s)': '20:00', Suburb: 'Tallebudgera', PCode: 4228, 'Display Address': 'Beach', 'Event Type': 'Private', 'Display Type': 'Outdoor Display' },
    { 'Display Date': 'Friday, 20 November 2026', 'Times(s)': '20:00', Suburb: 'Coolum Beach', PCode: 4573, 'Display Address': 'School Rd' },
    { 'Display Date': 'bad', 'Times(s)': '20:00', Suburb: 'X', PCode: 1 },
  ];
  const list = L.parseFireworks(recs);
  assert.equal(list.length, 3);
  assert.equal(list[0].date, '2026-11-24');
  assert.equal(list[0].suburb, 'Gold Coast');
  const geo = { 'Gold Coast|4217': { lat: -28.0, lon: 153.43 }, 'Tallebudgera|4228': { lat: -28.1, lon: 153.45 } };
  const home = { lat: -28.09, lon: 153.44, postcode: '4220' };
  const near = L.nearbyFireworks(list, home, geo, '2026-11-23', 14, 5);
  assert.deepEqual(near.map((f) => f.suburb), ['Tallebudgera']);
  const wider = L.nearbyFireworks(list, home, geo, '2026-11-23', 14, 15);
  assert.deepEqual(wider.map((f) => f.suburb), ['Gold Coast', 'Tallebudgera']);
  // unknown location falls back to a postcode match
  const pc = L.nearbyFireworks(list, { postcode: '4228' }, {}, '2026-11-23');
  assert.deepEqual(pc.map((f) => f.suburb), ['Tallebudgera']);
});

test('calendar file: valid shape, escaping, fireworks alarm 2 h before', () => {
  const items = L.careSchedule({ birthday: '2026-10-01', homeDate: '2026-11-26' }, {}, '2026-11-26');
  const ics = L.buildICS([...L.careEvents(items, 'Rosie'), ...L.fireworksEvents([{ date: '2026-11-27', time: '20:00', suburb: 'Tallebudgera', postcode: '4228', address: 'Beach, north end' }])], new Date('2026-11-26T00:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.ok(ics.includes('SUMMARY:Rosie: First vet check'));
  assert.ok(ics.includes('DTSTART:20261127T200000'));
  assert.ok(ics.includes('TRIGGER:-PT120M'));
  assert.ok(ics.includes('Beach\\, north end'));
});

test('sitter sheet includes contacts and poisons line, skips blanks', () => {
  const p = { name: 'Rosie', breed: 'English Staffy', birthday: '2026-10-01', vetPhone: '07 5555 0000', food: '1 cup x3' };
  const t = L.sitterText(p, [], '2026-12-01');
  assert.ok(t.startsWith('Rosie, English Staffy, 8 weeks old'));
  assert.ok(t.includes('Vet: 07 5555 0000'));
  assert.ok(t.includes('1300 869 738'));
  assert.ok(!t.includes('undefined'));
  assert.ok(!t.includes('24-hour vet'));
});

// ---- regression tests for review fixes (23 Nov 2026) ----

test('birthday without a homecoming date gives no schedule (dates would slide daily)', () => {
  assert.deepEqual(L.careSchedule({ birthday: '2026-10-01' }, {}, '2026-11-23'), []);
  assert.deepEqual(L.careSchedule({ birthday: '2026-10-01' }, {}, '2026-11-24'), []);
});

test('step advice ignores ratings from an earlier visit to the same step', () => {
  const s = [
    { plan: 'lead', step: 1, date: '2026-12-01', rating: 'good' },
    { plan: 'lead', step: 1, date: '2026-12-02', rating: 'good' },
    { plan: 'lead', step: 1, date: '2026-12-03', rating: 'good' },
    { plan: 'lead', step: 2, date: '2026-12-04', rating: 'hard' },
    { plan: 'lead', step: 2, date: '2026-12-05', rating: 'hard' },
  ];
  assert.equal(L.stepAdvice(s, 'lead', 2, 3), 'back');
  // stepped back to 1 now: entered at index 5, so the old three goods don't count
  assert.equal(L.stepAdvice(s, 'lead', 1, 5), 'stay');
  s.push({ plan: 'lead', step: 1, date: '2026-12-06', rating: 'good' }, { plan: 'lead', step: 1, date: '2026-12-07', rating: 'good' }, { plan: 'lead', step: 1, date: '2026-12-08', rating: 'good' });
  assert.equal(L.stepAdvice(s, 'lead', 1, 5), 'next');
});

test('fireworks in suburbs that cannot be placed are kept when home has no postcode', () => {
  const list = L.parseFireworks([
    { 'Display Date': 'Friday, 27 November 2026', 'Times(s)': '20:00', Suburb: 'Somewhere Odd', PCode: 4221, 'Display Address': 'Park' },
    { 'Display Date': 'Friday, 27 November 2026', 'Times(s)': '20:00', Suburb: 'Far Town', PCode: 4870, 'Display Address': 'Oval' },
  ]);
  const geo = { 'Somewhere Odd|4221': null, 'Far Town|4870': { lat: -16.9, lon: 145.7 } };
  const near = L.nearbyFireworks(list, { lat: -28.12, lon: 153.47, postcode: '' }, geo, '2026-11-23');
  assert.deepEqual(near.map((f) => [f.suburb, f.km]), [['Somewhere Odd', null]]);
  // with a home postcode, unplaced ones must match it
  assert.equal(L.nearbyFireworks(list, { lat: -28.12, lon: 153.47, postcode: '4220' }, geo, '2026-11-23').length, 0);
  assert.equal(L.nearbyFireworks(list, { lat: -28.12, lon: 153.47, postcode: '4221' }, geo, '2026-11-23').length, 1);
});

test('care calendar UIDs stay the same when a due date moves, and change once done', () => {
  const p = { birthday: '2026-10-01', homeDate: '2026-11-26' };
  const uid = (items, id) => L.careEvents(items, 'R').find((e) => e.uid.startsWith(id + '-')).uid;
  const a = L.careSchedule(p, { vax1: ['2026-11-20'], vax2: ['2027-01-01'] }, '2027-01-02');
  const b = L.careSchedule(p, { vax1: ['2026-11-20'], vax2: ['2027-01-10'] }, '2027-01-11');
  assert.notEqual(a.find((i) => i.id === 'vax3').due, b.find((i) => i.id === 'vax3').due);
  assert.equal(uid(a, 'vax3'), uid(b, 'vax3'));
  const w1 = L.careSchedule(p, { worm: ['2026-11-26'] }, '2026-11-27');
  const w2 = L.careSchedule(p, { worm: ['2026-11-26', '2026-12-10'] }, '2026-12-11');
  assert.notEqual(uid(w1, 'worm'), uid(w2, 'worm'));
  const g1 = L.careSchedule(p, {}, '2026-12-05', { lastWeight: '2026-12-01', weightCount: 2 });
  assert.equal(uid(g1, 'weigh'), 'weigh-n2');
});

test('calendar lines are folded at 75 octets and a later export has a higher SEQUENCE', () => {
  const ev = [{ uid: 'x', date: '2026-12-01', title: 'Rosie: a long title', note: 'é'.repeat(60) + ' ' + 'word '.repeat(40) }];
  const ics = L.buildICS(ev, new Date('2026-11-26T00:00:00Z'));
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `too long: ${line.slice(0, 30)}`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:' + 'é'.repeat(60) + ' word'));
  const seq = (s) => Number(s.match(/SEQUENCE:(\d+)/)[1]);
  assert.ok(seq(L.buildICS(ev, new Date('2026-11-27T00:00:00Z'))) > seq(ics));
});

// ---- photos ----

// Builds a minimal JPEG with an APP1 EXIF block: IFD0 (optionally DateTime + ExifIFD pointer) and an
// Exif IFD with DateTimeOriginal. Offsets follow the TIFF spec; `le` picks byte order.
function fakeJpeg({ original, modified, le = false, junkFirst = false }) {
  const tiff = [];
  const w16 = (n) => (le ? tiff.push(n & 255, n >> 8) : tiff.push(n >> 8, n & 255));
  const w32 = (n) => (le ? tiff.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : tiff.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255));
  const str = (s) => [...s, '\0'].map((c) => c.charCodeAt(0));
  const ifd0Count = (modified ? 1 : 0) + (original ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifIfdAt = 8 + ifd0Size;
  const exifIfdSize = original ? 2 + 12 + 4 : 0;
  let dataAt = exifIfdAt + exifIfdSize;
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d])); w16(42); w32(8);
  w16(ifd0Count);
  const data = [];
  if (modified) { w16(0x0132); w16(2); w32(20); w32(dataAt); data.push(...str(modified)); dataAt += 20; }
  if (original) { w16(0x8769); w16(4); w32(1); w32(exifIfdAt); }
  w32(0);
  if (original) { w16(1); w16(0x9003); w16(2); w32(20); w32(dataAt); w32(0); data.push(...str(original)); }
  const body = [...[0x45, 0x78, 0x69, 0x66, 0, 0], ...tiff, ...data];
  const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const junk = junkFirst ? [0xff, 0xe0, 0, 6, 0x4a, 0x46, 0x49, 0x46] : [];
  return new Uint8Array([0xff, 0xd8, ...junk, ...app1, 0xff, 0xda, 0, 2]).buffer;
}

test('exifDate reads DateTimeOriginal, falls back to DateTime, handles both byte orders', () => {
  assert.equal(L.exifDate(fakeJpeg({ original: '2026:12:05 09:14:00' })), '2026-12-05');
  assert.equal(L.exifDate(fakeJpeg({ original: '2026:12:05 09:14:00', le: true })), '2026-12-05');
  assert.equal(L.exifDate(fakeJpeg({ original: '2026:12:05 09:14:00', modified: '2027:01:01 00:00:00', junkFirst: true })), '2026-12-05');
  assert.equal(L.exifDate(fakeJpeg({ modified: '2027:01:02 10:00:00', le: true })), '2027-01-02');
});

test('exifDate returns null for non-JPEG, no EXIF, blank dates and truncated files', () => {
  assert.equal(L.exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
  assert.equal(L.exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null);
  assert.equal(L.exifDate(fakeJpeg({ original: '0000:00:00 00:00:00' })), null);
  const full = new Uint8Array(fakeJpeg({ original: '2026:12:05 09:14:00' }));
  assert.equal(L.exifDate(full.slice(0, 30).buffer), null);
  assert.equal(L.exifDate(new ArrayBuffer(0)), null);
});

test('fitSize scales the longest side down, never up', () => {
  assert.deepEqual(L.fitSize(4032, 3024, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(L.fitSize(3024, 4032, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(L.fitSize(800, 600, 1600), { w: 800, h: 600 });
  assert.deepEqual(L.fitSize(10000, 10, 300), { w: 300, h: 1 });
});

test('nearestWeight picks the closest weigh-in within the window', () => {
  const log = [
    { type: 'weight', t: '2026-12-01T09:00', kg: 5.2 },
    { type: 'weight', t: '2026-12-08T09:00', kg: 6.1 },
    { type: 'wee', t: '2026-12-06T09:00' },
  ];
  assert.equal(L.nearestWeight(log, '2026-12-06'), 6.1);
  assert.equal(L.nearestWeight(log, '2026-12-03'), 5.2);
  assert.equal(L.nearestWeight(log, '2026-12-30'), null);
  assert.equal(L.nearestWeight([], '2026-12-01'), null);
});

test('sortPhotos: newest date first, then most recently added', () => {
  const s = L.sortPhotos([{ id: 'a', date: '2026-12-01', added: 1 }, { id: 'b', date: '2026-12-05', added: 2 }, { id: 'c', date: '2026-12-01', added: 3 }]);
  assert.deepEqual(s.map((p) => p.id), ['b', 'c', 'a']);
});
