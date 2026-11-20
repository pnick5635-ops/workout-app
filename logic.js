/* Pure logic: no DOM. Works in the browser (window.WL) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';

  const SLOTS = ['Пн', 'Ср', 'Пт'];
  // Any weekday a workout can happen on; off-plan days (Вт, Чт, Сб, Вс) are their own workouts.
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const dayOf = (iso) => DAYS[(parseIso(iso).getDay() + 6) % 7];

  const DEFAULT_PLAN = [
    { name: 'Hammer Press', day: 'Пн', scheme: '3×5–8', top: 8 },
    { name: 'Single-Arm Lever Row', day: 'Пн', scheme: '3×5–8', top: 8 },
    { name: 'Leg Press', day: 'Пн', scheme: '3×5–8', top: 8 },
    { name: 'Lateral Raise', day: 'Пн', scheme: '2×8–15', top: 15 },
    { name: 'Barbell Curl', day: 'Пн', scheme: '3×8–12', top: 12 },
    { name: 'Calf Raise', day: 'Пн', scheme: '2×8–15', top: 15 },
    { name: 'Deadlift', day: 'Ср', scheme: '3×5', top: 5 },
    { name: 'Lat Pulldown', day: 'Ср', scheme: '3×5–8', top: 8 },
    { name: 'Leg Curl', day: 'Ср', scheme: '3×8–15', top: 15 },
    { name: 'Rear Delt Machine', day: 'Ср', scheme: '2×8–15', top: 15 },
    { name: 'Dumbbell Bench Press', day: 'Пт', scheme: '3×8–12', top: 12 },
    { name: 'Incline Dumbbell Row', day: 'Пт', scheme: '3×8–12', top: 12 },
    { name: 'Bulgarian Split Squat', day: 'Пт', scheme: '2×8–12', top: 12 },
    { name: 'Chest Fly Machine', day: 'Пт', scheme: '2×8–12', top: 12 },
    { name: 'Triceps Rope Extension', day: 'Пт', scheme: '2×8–12', top: 12 },
    { name: 'Face Pull', day: 'Ср/Пт', scheme: '2×12–15', top: 15 }
  ];

  // Old Russian names (sheet «Журнал», data saved before v6) → English names.
  const RENAMES = {
    'Рычажная тяга на одну руку': 'Single-Arm Lever Row',
    'Подъём штанги на бицепс': 'Barbell Curl',
    'Икры на платформе': 'Calf Raise',
    'Становая тяга': 'Deadlift',
    'Сгибание голени': 'Leg Curl',
    'Жим гантелей лёжа': 'Dumbbell Bench Press',
    'Болгарский присед': 'Bulgarian Split Squat'
  };
  const exName = (n) => RENAMES[n] || n;
  // Renames exercises in saved sets/plan; returns true if anything changed.
  function migrateNames(db) {
    let ch = false;
    for (const x of db.sets) { const n = exName(x.ex); if (n !== x.ex) { x.ex = n; ch = true; } }
    for (const x of db.plan) { const n = exName(x.name); if (n !== x.name) { x.name = n; ch = true; } }
    return ch;
  }

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const mondayOf = (s) => { const d = parseIso(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoOf(d); };
  const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);

  function normDate(v) {
    const s = String(v || '').trim();
    let m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[0] : null;
  }
  const num = (v) => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? NaN : Number(s); };

  function planSets(p) { const m = /^(\d+)/.exec(p.scheme || ''); return m ? Number(m[1]) : 3; }
  function slotExercises(plan, slot) { return plan.filter((p) => p.day.split('/').includes(slot)); }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    const t = String(text).replace(/^﻿/, '');
    const sep = (() => { const first = t.split(/\r?\n/)[0] || ''; return (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','; })();
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  }

  let idSeq = 0;
  const newId = () => Date.now().toString(36) + '-' + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);

  // Accepts the sheet's "Журнал" export (Дата, День, Упражнение, Вес, Повт 1..3)
  // or this app's export (date, slot, exercise, weight, reps — one row per set).
  function importRows(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('Файл пустой');
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const body = /\d/.test(rows[0][0]) ? rows : rows.slice(1);
    const appFormat = head[4] === 'reps';
    const sets = []; let skipped = 0;
    for (const r of body) {
      const date = normDate(r[0]);
      const slot = DAYS.includes(String(r[1]).trim()) ? String(r[1]).trim() : null;
      const ex = exName(String(r[2] || '').trim());
      const w = num(r[3]);
      const repsList = appFormat ? [r[4]] : [r[4], r[5], r[6]];
      const reps = repsList.map(num).filter((x) => x > 0);
      if (!date || !ex || !(w >= 0) || !reps.length) { skipped++; continue; }
      for (const n of reps) sets.push({ id: newId(), date, slot, ex, w, r: n });
    }
    return { sets, skipped };
  }

  function exportCSV(sets) {
    const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const lines = ['date,slot,exercise,weight,reps'];
    [...sets].sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1))
      .forEach((s) => lines.push([s.date, s.slot || '', s.ex, s.w, s.r].map(esc).join(',')));
    return lines.join('\n') + '\n';
  }

  // ---------- derived ----------
  // Slot of a set: as recorded; else from the plan (Ср/Пт by weekday).
  function slotOf(s, plan) {
    if (DAYS.includes(s.slot)) return s.slot;
    const p = plan.find((x) => x.name === s.ex);
    if (!p) return null;
    if (p.day === 'Ср/Пт') return parseIso(s.date).getDay() === 3 ? 'Ср' : 'Пт';
    return p.day.split('/')[0];
  }

  // One row per exercise and date, as in the dashboard.
  function sessions(sets, plan) {
    const P = new Map(plan.map((p) => [p.name, p]));
    const g = new Map();
    for (const s of sets) {
      const p = P.get(s.ex);
      if (!p || !(s.w > 0) || !(s.r > 0)) continue;
      const k = s.ex + '|' + s.date;
      if (!g.has(k)) g.set(k, { ex: s.ex, date: s.date, week: mondayOf(s.date), slot: slotOf(s, plan), top: p.top, list: [] });
      g.get(k).list.push([s.w, s.r]);
    }
    return [...g.values()].map((o) => {
      const topW = Math.max(...o.list.map((x) => x[0]));
      return {
        ex: o.ex, date: o.date, week: o.week, slot: o.slot,
        list: o.list,
        topWeight: topW,
        e1rm: Math.max(...o.list.map(([w, r]) => Math.round(w * (1 + r / 30) * 10) / 10)),
        tonnage: o.list.reduce((a, [w, r]) => a + w * r, 0),
        allTop: o.list.filter((x) => x[0] === topW).every((x) => x[1] >= o.top)
      };
    }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function byExercise(sess) {
    const m = new Map();
    for (const s of sess) { if (!m.has(s.ex)) m.set(s.ex, []); m.get(s.ex).push(s); }
    return m;
  }

  // Suggested next weight: +2.5%, rounded to whole kg, at least +1 kg.
  function suggestWeight(w) { return Math.max(w + 1, Math.round(w * 1.025)); }

  // Target for the next session from the last one (before `beforeDate`, if given).
  function target(exSess, p, beforeDate) {
    const hist = beforeDate ? exSess.filter((s) => s.date < beforeDate) : exSess;
    if (!hist.length) return null;
    const last = hist[hist.length - 1];
    const n = planSets(p);
    const repsAtTop = last.list.filter((x) => x[0] === last.topWeight).map((x) => x[1]);
    if (last.allTop) {
      return { kind: 'add', last, weight: last.topWeight, suggest: suggestWeight(last.topWeight), reps: Array(n).fill(null) };
    }
    const reps = [];
    for (let i = 0; i < n; i++) {
      const prev = repsAtTop[i] ?? repsAtTop[repsAtTop.length - 1];
      reps.push(Math.min(p.top, prev + 1));
    }
    return { kind: 'reps', last, weight: last.topWeight, reps };
  }

  // Consecutive sessions (from the end) where allTop holds.
  function topStreak(exSess) { let n = 0; for (let i = exSess.length - 1; i >= 0 && exSess[i].allTop; i--) n++; return n; }

  // Consecutive sessions (from the end) with the same working weight, and the date that run began.
  function sameWeightRun(exSess) {
    if (!exSess.length) return { n: 0, since: null };
    const w = exSess[exSess.length - 1].topWeight; let i = exSess.length - 1;
    while (i > 0 && exSess[i - 1].topWeight === w) i--;
    return { n: exSess.length - i, since: exSess[i].date, weight: w };
  }

  function weekly(sess, plan) {
    const m = new Map();
    for (const s of sess) {
      const k = s.week + '|' + s.slot;
      if (!m.has(k)) m.set(k, { week: s.week, slot: s.slot, tonnage: 0, done: new Set() });
      m.get(k).tonnage += s.tonnage; m.get(k).done.add(s.ex);
    }
    return [...m.values()].map((r) => {
      const missing = slotExercises(plan, r.slot).map((p) => p.name).filter((e) => !r.done.has(e));
      return { week: r.week, slot: r.slot, tonnage: r.tonnage, complete: missing.length === 0, missing };
    }).sort((a, b) => ((a.week + DAYS.indexOf(a.slot)) < (b.week + DAYS.indexOf(b.slot)) ? -1 : 1));
  }

  function weekTotals(wk) {
    const m = new Map();
    for (const r of wk) m.set(r.week, (m.get(r.week) || 0) + r.tonnage);
    return [...m.entries()].map(([week, total]) => ({ week, total })).sort((a, b) => (a.week < b.week ? -1 : 1));
  }

  function recordWeek(wk, currentWeek) {
    const weeks = weekTotals(wk);
    if (!weeks.length) return null;
    let rec = weeks[0];
    for (const w of weeks) if (w.total >= rec.total) rec = w;
    const cur = weeks.find((w) => w.week === currentWeek) || { week: currentWeek, total: 0 };
    const before = weeks.filter((w) => w.week < rec.week);
    return {
      week: rec.week, total: rec.total,
      prevBest: before.length ? Math.max(...before.map((w) => w.total)) : 0,
      current: cur.total, isCurrent: rec.week === currentWeek,
      first: weeks[0].total, count: weeks.length
    };
  }

  // Slot to show today: the slot already started today, else the first slot of this week not yet done.
  function defaultSlot(sets, plan, today) {
    const todays = sets.filter((s) => s.date === today);
    // The tab to show: today's plan slot if today's workout is one; an off-day workout (Сб…) falls through to a plan tab.
    if (todays.length) { const t0 = slotOf(todays[todays.length - 1], plan); if (SLOTS.includes(t0)) return t0; }
    const wk = mondayOf(today);
    const done = new Set(sets.filter((s) => mondayOf(s.date) === wk).map((s) => slotOf(s, plan)));
    const wd = (parseIso(today).getDay() + 6) % 7; // 0 = Mon
    const byDay = wd === 0 ? 'Пн' : wd === 2 ? 'Ср' : wd === 4 ? 'Пт' : null;
    if (byDay && !done.has(byDay)) return byDay;
    return SLOTS.find((s) => !done.has(s)) || byDay || 'Пн';
  }

  // Exercises whose working weight on `date` beats every earlier session.
  function weightRecords(sess, date) {
    const out = [];
    for (const [ex, list] of byExercise(sess)) {
      const today = list.find((s) => s.date === date);
      const prev = list.filter((s) => s.date < date);
      if (!today || !prev.length) continue;
      const best = Math.max(...prev.map((s) => s.topWeight));
      if (today.topWeight > best) out.push({ ex, weight: today.topWeight, prevBest: best });
    }
    return out;
  }

  const api = {
    SLOTS, DAYS, dayOf, DEFAULT_PLAN, RENAMES, exName, migrateNames, isoOf, parseIso, addDays, mondayOf, daysBetween, normDate, planSets, slotExercises,
    parseCSV, importRows, exportCSV, slotOf, sessions, byExercise, suggestWeight, target, topStreak,
    sameWeightRun, weekly, weekTotals, recordWeek, defaultSlot, weightRecords, newId
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WL = api;
})(typeof window !== 'undefined' ? window : globalThis);
