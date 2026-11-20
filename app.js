(function () {
  'use strict';
  const L = window.WL;
  const KEY = 'workout-app.v1';
  const APP_VERSION = '9';
  const app = document.getElementById('app');

  // ---------- storage ----------
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.sets)) return { sets: d.sets, plan: Array.isArray(d.plan) && d.plan.length ? d.plan : L.DEFAULT_PLAN, finished: Array.isArray(d.finished) ? d.finished : [] };
    } catch (e) { /* fall through */ }
    return { sets: [], plan: L.DEFAULT_PLAN, finished: [] };
  }
  let db = load();
  if (db.plan === L.DEFAULT_PLAN) db.plan = L.DEFAULT_PLAN.map((p) => ({ ...p }));
  if (L.migrateNames(db)) save();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { alert('Не удалось сохранить: ' + e.message); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const tons = (kg) => fmt(Math.round(kg / 100) / 10);
  const todayIso = () => L.isoOf(new Date());
  const dFmt = (iso, opts) => new Intl.DateTimeFormat('ru', opts).format(L.parseIso(iso));
  const dayLong = (iso) => { const s = dFmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const dShort = (iso) => dFmt(iso, { day: 'numeric', month: 'short' }).replace('.', '');
  const dLong = (iso) => dFmt(iso, { day: 'numeric', month: 'long' });
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };

  // "130 × 7 · 7 · 7" or "22 × 12, 24 × 10 · 10"
  function setsText(list) {
    const groups = [];
    for (const [w, r] of list) {
      const g = groups[groups.length - 1];
      if (g && g.w === w) g.r.push(r); else groups.push({ w, r: [r] });
    }
    return groups.map((g) => fmt(g.w) + ' × ' + g.r.join(' · ')).join(', ');
  }

  const icon = {
    check: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>',
    cup: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h8v5a4 4 0 0 1-8 0V4zM7 6H4v1a3 3 0 0 0 3 3M15 6h3v1a3 3 0 0 1-3 3M11 13v4M8 18h6"/></svg>',
    up: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15V3M4 8l5-5 5 5"/></svg>',
    flat: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9h12"/></svg>',
    gym: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7v8M7 5v12M15 5v12M18 7v8M7 11h8"/></svg>',
    chart: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 7-9"/></svg>',
    gear: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="3"/><path d="M11 2.5v2.2M11 17.3v2.2M2.5 11h2.2M17.3 11h2.2M5 5l1.6 1.6M15.4 15.4L17 17M5 17l1.6-1.6M15.4 6.6L17 5"/></svg>',
    x: '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>'
  };

  // ---------- ui state ----------
  const ui = { screen: 'today', slot: null, active: null, w: 0, r: 0, progressEx: null };

  function derived() {
    const sess = L.sessions(db.sets, db.plan);
    return { sess, byEx: L.byExercise(sess) };
  }

  function todaySets(ex) { const t = todayIso(); return db.sets.filter((s) => s.date === t && s.ex === ex); }

  function prefill(ex, d) {
    const p = db.plan.find((x) => x.name === ex);
    const done = todaySets(ex);
    const tg = L.target(d.byEx.get(ex) || [], p, todayIso());
    if (done.length) ui.w = done[done.length - 1].w;
    else ui.w = tg ? tg.weight : 20;
    const idx = done.length;
    if (tg && tg.reps[idx] != null) ui.r = tg.reps[idx];
    else if (tg) ui.r = tg.last.list[tg.last.list.length - 1][1];
    else ui.r = p ? p.top : 8;
    if (done.length && !(tg && tg.reps[idx] != null)) ui.r = done[done.length - 1].r;
  }

  function setActive(ex, d) { ui.active = ex; if (ex) prefill(ex, d); }

  // ---------- screens ----------
  function nav() {
    const cur = ui.screen === 'summary' ? 'today' : ui.screen;
    const tab = (id, label, ic) => '<button type="button" class="tab' + (cur === id ? ' on' : '') + '" data-act="go" data-to="' + id + '"' + (cur === id ? ' aria-current="page"' : '') + '>' + ic + label + '</button>';
    return '<nav class="nav" aria-label="Разделы">' + tab('today', 'Сегодня', icon.gym) + tab('progress', 'Прогресс', icon.chart) + tab('settings', 'Данные', icon.gear) + '</nav>';
  }

  function screenToday() {
    const d = derived();
    const t = todayIso();
    if (!ui.slot) ui.slot = L.defaultSlot(db.sets, db.plan, t);
    if (db.finished.includes(t) && db.sets.some((s) => s.date === t)) return screenWeek(d, t);
    const exs = L.slotExercises(db.plan, ui.slot);
    const counts = exs.map((p) => todaySets(p.name).length);
    const nDone = exs.filter((p, i) => counts[i] >= L.planSets(p)).length;
    if (ui.active === null || !exs.some((p) => p.name === ui.active)) {
      const next = exs.find((p, i) => counts[i] < L.planSets(p));
      setActive(next ? next.name : null, d);
    }
    let h = '<main class="screen">';
    h += '<header class="head"><h1 class="date">' + esc(dayLong(t)) + '</h1>';
    h += '<div class="seg" role="group" aria-label="День плана">' + L.SLOTS.map((s) => '<button type="button" data-act="slot" data-slot="' + s + '" aria-pressed="' + (s === ui.slot) + '"' + (s === ui.slot ? ' class="on"' : '') + '>' + s + '</button>').join('') + '</div></header>';
    h += '<div class="prog"><div class="bar"><div style="width:' + Math.round(nDone / Math.max(1, exs.length) * 100) + '%"></div></div><span>' + nDone + ' из ' + exs.length + ' ' + plural(exs.length, 'упражнения', 'упражнений', 'упражнений') + '</span></div>';

    exs.forEach((p, i) => {
      const hist = d.byEx.get(p.name) || [];
      const tg = L.target(hist, p, t);
      const done = todaySets(p.name);
      const n = L.planSets(p);
      if (p.name === ui.active) { h += activeCard(p, tg, done, n); return; }
      const todaySess = hist.find((s) => s.date === t);
      if (done.length && counts[i] >= n) {
        const prevMax = Math.max(0, ...hist.filter((s) => s.date < t).map((s) => s.topWeight));
        let badge = '';
        if (todaySess && prevMax && todaySess.topWeight > prevMax) badge = '<span class="badge gold">Рекорд веса</span>';
        else if (todaySess && todaySess.allTop) badge = '<span class="badge lime">Верх диапазона</span>';
        const hint = todaySess && todaySess.allTop ? '<div class="hint lime">в следующий раз: ' + fmt(L.suggestWeight(todaySess.topWeight)) + ' кг?</div>' : '';
        h += '<button type="button" class="row done" data-act="open" data-ex="' + esc(p.name) + '"><span class="tick">' + icon.check + '</span><span class="grow"><span class="name">' + esc(p.name) + '</span><span class="sub">' + esc(setsText(done.map((s) => [s.w, s.r]))) + '</span>' + hint + '</span>' + badge + '</button>';
      } else {
        const sub = tg ? 'прошлый раз ' + setsText(tg.last.list) : 'ещё нет записей';
        const right = done.length ? done.length + ' из ' + n : tg ? targetText(tg) : '';
        h += '<button type="button" class="row" data-act="open" data-ex="' + esc(p.name) + '"><span class="grow"><span class="name">' + esc(p.name) + '</span><span class="sub">' + esc(sub) + '</span></span><span class="right">' + esc(right) + '</span></button>';
      }
    });
    if (db.sets.some((s) => s.date === t)) h += '<button type="button" class="btn ghost" data-act="finish">Завершить тренировку</button>';
    h += '</main>';
    return h;
  }

  const SLOT_OFFSET = { 'Пн': 0, 'Ср': 2, 'Пт': 4 };

  // Next planned workout after `t`: the first slot of this week still ahead and not done, else Monday next week.
  function nextWorkout(d, t) {
    const wk = L.mondayOf(t);
    const done = new Set(d.sess.filter((s) => s.week === wk).map((s) => s.slot));
    for (const s of L.SLOTS) {
      const date = L.addDays(wk, SLOT_OFFSET[s]);
      if (date > t && !done.has(s)) return { slot: s, date, sameWeek: true };
    }
    return { slot: 'Пн', date: L.addDays(wk, 7), sameWeek: false };
  }

  // Today's workout is closed: the home screen shows the week and the next workout.
  function screenWeek(d, t) {
    const wk = L.mondayOf(t);
    const weekSess = d.sess.filter((s) => s.week === wk);
    const doneDate = new Map(); weekSess.forEach((s) => { if (!doneDate.has(s.slot)) doneDate.set(s.slot, s.date); });
    const total = weekSess.reduce((a, s) => a + s.tonnage, 0);
    const prevTotal = d.sess.filter((s) => s.week === L.addDays(wk, -7)).reduce((a, s) => a + s.tonnage, 0);
    const next = nextWorkout(d, t);
    const weekOver = !next.sameWeek;

    let h = '<main class="screen"><header class="head col"><h1 class="date">' + esc(dayLong(t)) + '</h1>';
    h += '<h2 class="title">' + (weekOver ? 'Неделя завершена' : 'Неделя с ' + esc(dLong(wk))) + '</h2></header>';

    // week summary
    h += '<section class="card"><div class="between"><h2 class="lbl">' + (weekOver ? 'Неделя с ' + esc(dLong(wk)) : 'Тренировки недели') + '</h2><b>' + doneDate.size + ' из 3</b></div><div class="dots">';
    L.SLOTS.forEach((s) => {
      if (doneDate.has(s)) h += '<button type="button" class="dotl on dotbtn" data-act="daysum" data-date="' + doneDate.get(s) + '" aria-label="Итог тренировки ' + s + '"><span class="dot on"></span>' + s + ' ›</button>';
      else h += '<span class="dotl"><span class="dot' + (!weekOver && s === next.slot ? ' next' : '') + '"></span>' + s + '</span>';
    });
    h += '</div><div class="between sm"><span>Тоннаж недели: <b>' + tons(total) + ' т</b></span>';
    if (prevTotal > 0) {
      if (weekOver) { const diff = total - prevTotal; h += '<span class="' + (diff > 0 ? 'lime' : 'muted') + '">' + (diff >= 0 ? '+' : '−') + tons(Math.abs(diff)) + ' т к прошлой</span>'; }
      else h += '<span class="muted">прошлая неделя ' + tons(prevTotal) + ' т</span>';
    }
    h += '</div><div class="muted sm">Нажмите на день, чтобы открыть итог</div></section>';

    // weight records this week
    // one line per exercise: best before this week → best this week
    const recMap = new Map();
    [...new Set(weekSess.map((s) => s.date))].sort().forEach((date) => L.weightRecords(d.sess, date).forEach((r) => {
      const o = recMap.get(r.ex); recMap.set(r.ex, { ex: r.ex, prevBest: o ? o.prevBest : r.prevBest, weight: r.weight });
    }));
    const recs = [...recMap.values()];
    const rec = L.recordWeek(L.weekly(d.sess, db.plan), wk);
    const recordNow = rec && rec.isCurrent && rec.count > 1;
    if (recordNow) h += recordHero(rec);
    if (recs.length) {
      h += '<section class="card gold-card"><div class="row-h gold">' + icon.cup + '<h2>' + recs.length + ' ' + plural(recs.length, 'рекорд', 'рекорда', 'рекордов') + ' веса за неделю</h2></div>';
      recs.forEach((r) => { h += '<div class="between"><span class="name">' + esc(r.ex) + '</span><span class="right"><span class="tan">' + fmt(r.prevBest) + ' → </span><span class="gold">' + fmt(r.weight) + ' кг</span></span></div>'; });
      h += '</section>';
    }
    if (!recordNow) h += recordCard(d, t);

    // next workout — only mid-week; the final week screen is a summary
    if (!weekOver) {
      h += '<section class="card"><div class="between"><h2>Следующая — ' + next.slot + '</h2><span class="muted sm">' + esc(dayLong(next.date)) + '</span></div>';
      L.slotExercises(db.plan, next.slot).forEach((p) => {
        const tg = L.target(d.byEx.get(p.name) || [], p);
        h += '<div class="between"><span class="name">' + esc(p.name) + '</span><span class="right' + (tg && tg.kind === 'add' ? ' lime' : '') + '">' + esc(tg ? targetText(tg) : 'первая запись') + '</span></div>';
      });
      h += '</section>';
    }

    h += '<button type="button" class="btn ghost" data-act="reopen">Продолжить запись сегодня</button>';
    return h + '</main>';
  }

  function targetText(tg) {
    if (tg.kind === 'add') return fmt(tg.suggest) + ' кг?';
    return fmt(tg.weight) + ' × ' + tg.reps.join(' · ');
  }

  function activeCard(p, tg, done, n) {
    let h = '<section class="card active" aria-label="' + esc(p.name) + '">';
    h += '<div class="between"><h2>' + esc(p.name) + '</h2><span class="muted sm">' + (done.length < n ? 'подход ' + (done.length + 1) + ' из ' + n : 'подходов: ' + done.length) + '</span></div>';
    if (tg) {
      h += '<div class="two"><div><div class="lbl">Прошлый раз · ' + esc(dShort(tg.last.date)) + '</div><div class="val">' + esc(setsText(tg.last.list)) + '</div></div>';
      if (tg.kind === 'add') h += '<div><div class="lbl">Цель сегодня</div><div class="val lime">Добавить вес</div><button type="button" class="chip lime" data-act="usew" data-w="' + tg.suggest + '">' + fmt(tg.suggest) + ' кг?</button></div></div>';
      else h += '<div><div class="lbl">Цель сегодня</div><div class="val lime">' + esc(targetText(tg)) + '</div></div></div>';
    } else h += '<div class="muted sm">Первая запись · схема ' + esc(p.scheme) + '</div>';
    if (done.length) {
      h += '<div class="chips">' + done.map((s, i) => '<span class="chip">' + (i + 1) + ' · ' + fmt(s.w) + ' × ' + s.r + '<button type="button" class="del" data-act="del" data-id="' + esc(s.id) + '" aria-label="Удалить подход ' + (i + 1) + '">' + icon.x + '</button></span>').join('') + '</div>';
    }
    h += '<div class="two">' + stepper('Вес, кг', 'w', fmt(ui.w)) + stepper('Повторы', 'r', ui.r) + '</div>';
    h += '<button type="button" class="btn" data-act="add">Записать подход</button>';
    h += '</section>';
    return h;
  }

  function stepper(label, k, v) {
    return '<div><div class="lbl">' + label + '</div><div class="stepper"><button type="button" data-act="step" data-k="' + k + '" data-d="-1" aria-label="Уменьшить: ' + label + '">−</button><output>' + v + '</output><button type="button" data-act="step" data-k="' + k + '" data-d="1" aria-label="Увеличить: ' + label + '">+</button></div></div>';
  }

  function screenSummary() {
    const d = derived();
    const t = ui.sumDate || todayIso();
    const isToday = t === todayIso();
    const fromWeek = !!ui.sumFrom;
    const todaySess = d.sess.filter((s) => s.date === t);
    const nSets = db.sets.filter((s) => s.date === t).length;
    const slot = todaySess.length ? todaySess[0].slot : '';
    const tonnage = todaySess.reduce((a, s) => a + s.tonnage, 0);
    let h = '<main class="screen">' + (fromWeek ? '<button type="button" class="backlink" data-act="back">‹ Неделя</button>' : '');
    h += '<header class="head col"><h1 class="title">' + (isToday && !fromWeek ? 'Тренировка записана' : 'Итог тренировки ' + esc(slot)) + '</h1><div class="muted sm">' + esc(dLong(t)) + ' · ' + todaySess.length + ' ' + plural(todaySess.length, 'упражнение', 'упражнения', 'упражнений') + ' · ' + nSets + ' ' + plural(nSets, 'подход', 'подхода', 'подходов') + ' · ' + tons(tonnage) + ' т</div></header>';

    const recs = L.weightRecords(d.sess, t);
    if (recs.length) {
      h += '<section class="card gold-card"><div class="row-h gold">' + icon.cup + '<h2>' + recs.length + ' ' + plural(recs.length, 'рекорд', 'рекорда', 'рекордов') + ' веса</h2></div>';
      recs.forEach((r) => { h += '<div class="between"><div><div class="name">' + esc(r.ex) + '</div><div class="sub tan">было ' + fmt(r.prevBest) + ' кг</div></div><div class="big">' + fmt(r.weight) + ' кг</div></div>'; });
      h += '</section>';
    }

    const lines = [];
    for (const s of todaySess) {
      const hist = d.byEx.get(s.ex);
      const prev = hist.filter((x) => x.date < t).pop();
      if (!prev) { lines.push([s.ex, 'первая запись', s, '']); continue; }
      let note, cls = '';
      const repsAt = (x) => x.list.filter((q) => q[0] === x.topWeight).reduce((a, q) => a + q[1], 0);
      if (s.topWeight > prev.topWeight) { note = 'вес +' + fmt(s.topWeight - prev.topWeight) + ' кг'; cls = 'lime'; }
      else if (s.topWeight < prev.topWeight) note = 'вес −' + fmt(prev.topWeight - s.topWeight) + ' кг';
      else {
        const dr = repsAt(s) - repsAt(prev);
        note = dr > 0 ? '+' + dr + ' ' + plural(dr, 'повтор', 'повтора', 'повторов') : dr < 0 ? '−' + (-dr) + ' ' + plural(-dr, 'повтор', 'повтора', 'повторов') : 'как в прошлый раз';
        if (s.list.length < prev.list.length) note += ', подходов меньше';
        if (dr > 0) cls = 'lime';
      }
      if (s.allTop) { note = 'верх диапазона — дальше добавить вес'; cls = 'lime'; }
      lines.push([s.ex, note, s, cls, prev.date]);
    }
    if (lines.length) {
      const prevDates = [...new Set(lines.map((l) => l[4]).filter(Boolean))];
      h += '<section class="card"><h2 class="lbl">' + (prevDates.length === 1 ? 'По сравнению с ' + esc(dLong(prevDates[0])) : 'По сравнению с прошлым разом') + '</h2>';
      lines.forEach(([ex, note, s, cls]) => { h += '<div class="between"><div class="grow"><div class="name">' + esc(ex) + '</div><div class="sub ' + cls + '">' + esc(note) + '</div></div><div class="right">' + esc(setsText(s.list)) + '</div></div>'; });
      h += '</section>';
    }
    h += weekCard(d, t) + recordCard(d, t);
    h += isToday && !fromWeek ? '<button type="button" class="btn" data-act="done">Готово</button></main>' : '<button type="button" class="btn ghost" data-act="back">Назад</button></main>';
    return h;
  }

  function weekCard(d, t) {
    const wk = L.mondayOf(t);
    const done = new Set(d.sess.filter((s) => s.week === wk).map((s) => s.slot));
    return '<section class="card"><div class="between"><h2 class="lbl">Неделя с ' + esc(dLong(wk)) + '</h2><b>' + done.size + ' из 3</b></div><div class="dots">' +
      L.SLOTS.map((s) => '<span class="dotl' + (done.has(s) ? ' on' : '') + '"><span class="dot' + (done.has(s) ? ' on' : '') + '"></span>' + s + '</span>').join('') + '</div></section>';
  }

  // "16–22 ноября" / "30 ноября – 6 декабря"
  function weekRange(wk) {
    const end = L.addDays(wk, 6);
    return wk.slice(5, 7) === end.slice(5, 7) ? Number(wk.slice(8)) + '–' + dLong(end) : dLong(wk) + ' – ' + dLong(end);
  }

  // The current week is the best ever: a filled gold banner on top of the week screen.
  function recordHero(rec) {
    let h = '<section class="card hero-gold"><div class="row-h">' + icon.cup + '<h2>Рекордная неделя</h2></div>';
    h += '<div class="hero-num">' + tons(rec.total) + ' т</div>';
    h += '<div class="sm">Лучший тоннаж за всё время' + (rec.prevBest ? ' · прошлый рекорд ' + tons(rec.prevBest) + ' т' : '') + '</div>';
    return h + '</section>';
  }

  function recordCard(d, t) {
    const rec = L.recordWeek(L.weekly(d.sess, db.plan), L.mondayOf(t));
    if (!rec) return '';
    const pct = rec.total > 0 ? Math.round(rec.current / rec.total * 100) : 0;
    let h = '<section class="card"><div class="between"><div class="row-h gold">' + icon.cup + '<h2 class="fg">Рекордная неделя</h2></div><b>' + tons(rec.total) + ' т</b></div><div class="muted sm">' + esc(weekRange(rec.week)) + '</div>';
    h += '<div class="bar gold" role="img" aria-label="Эта неделя: ' + pct + '% рекорда"><div style="width:' + Math.min(100, pct) + '%"></div></div>';
    if (rec.isCurrent && rec.count > 1) {
      h += '<div class="sm">Эта неделя — новый рекорд: <b>' + tons(rec.total) + ' т</b>' + (rec.prevBest ? ', прошлый лучший ' + tons(rec.prevBest) + ' т' : '') + '</div>';
    } else if (rec.isCurrent) {
      h += '<div class="sm">Первая неделя в статистике — точка отсчёта</div>';
    } else {
      h += '<div class="between sm"><span>Эта неделя: <b>' + tons(rec.current) + ' т</b> (' + pct + '%)</span><span class="muted">до рекорда ' + tons(rec.total - rec.current) + ' т</span></div>';
    }
    return h + '</section>';
  }

  function screenProgress() {
    const d = derived();
    const t = todayIso();
    let h = '<main class="screen"><header class="head col"><h1 class="title">Прогресс</h1>';
    if (!d.sess.length) return h + '</header><p class="muted">Пока нет записей. Начните тренировку на вкладке «Сегодня» или загрузите историю во вкладке «Данные».</p></main>';
    const wk = L.weekly(d.sess, db.plan);
    const first = d.sess[0].date;
    h += '<div class="muted sm">' + esc(dLong(first)) + ' — ' + esc(dLong(d.sess[d.sess.length - 1].date)) + ' · ' + wk.length + ' ' + plural(wk.length, 'тренировка', 'тренировки', 'тренировок') + '</div></header>';

    // attendance
    const curWeek = L.mondayOf(t);
    const firstWeek = L.mondayOf(first);
    const allWeeks = []; for (let w = firstWeek; w <= curWeek; w = L.addDays(w, 7)) allWeeks.push(w);
    const shown = allWeeks.slice(-13);
    const has = new Set(wk.map((r) => r.week + '|' + r.slot));
    const full = allWeeks.filter((w) => w < curWeek);
    const doneFull = wk.filter((r) => r.week < curWeek).length;
    const adh = full.length ? Math.round(doneFull / (full.length * 3) * 100) : null;
    h += '<section class="card"><div class="between"><div><h2>Посещаемость</h2><div class="muted sm">' + (full.length ? doneFull + ' из ' + full.length * 3 + ' за ' + full.length + ' ' + plural(full.length, 'полную неделю', 'полные недели', 'полных недель') : 'первая неделя') + '</div></div>' + (adh != null ? '<div class="big lime">' + adh + '%</div>' : '') + '</div>';
    h += '<div class="att" style="--cols:' + shown.length + '">';
    L.SLOTS.forEach((s) => {
      h += '<span class="muted sm">' + s + '</span>';
      shown.forEach((w) => {
        const on = has.has(w + '|' + s);
        const cls = on ? 'on' : w === curWeek ? 'next' : 'off';
        h += '<span class="dot ' + cls + '" title="' + esc(dShort(w)) + '"></span>';
      });
    });
    h += '</div></section>';

    // exercise chart
    const names = db.plan.map((p) => p.name).filter((n) => d.byEx.has(n));
    if (!ui.progressEx || !d.byEx.has(ui.progressEx)) ui.progressEx = names[0];
    const ex = d.byEx.get(ui.progressEx) || [];
    const last = ex[ex.length - 1], firstS = ex[0];
    const diff = last.topWeight - firstS.topWeight;
    h += '<section class="card"><label class="lbl" for="exsel">Упражнение</label><select id="exsel" data-act="exsel">' + names.map((n) => '<option' + (n === ui.progressEx ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
    h += '<div class="between"><div class="muted sm">рабочий вес · ' + (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmt(Math.abs(diff)) + ' кг с ' + esc(dLong(firstS.date)) + '</div><div class="big">' + fmt(last.topWeight) + ' кг</div></div>';
    h += chart(ex) + '</section>';

    // ready to add weight
    const ready = [], flat = [];
    for (const p of db.plan) {
      const s = d.byEx.get(p.name); if (!s) continue;
      const lastS = s[s.length - 1];
      if (L.daysBetween(lastS.date, t) > 21) continue;
      const st = L.topStreak(s);
      if (st > 0) ready.push({ ex: p.name, st, w: lastS.topWeight });
      else { const run = L.sameWeightRun(s); if (run.n >= 4) flat.push({ ex: p.name, since: run.since, w: run.weight, n: run.n }); }
    }
    if (ready.length) {
      h += '<section class="card"><div class="row-h lime">' + icon.up + '<h2 class="fg">Пора добавить вес</h2></div>';
      ready.forEach((r) => { h += '<div class="between"><div class="grow"><div class="name">' + esc(r.ex) + '</div><div class="sub">верх диапазона ' + (r.st === 1 ? 'в последний раз' : r.st + ' ' + plural(r.st, 'тренировку', 'тренировки', 'тренировок') + ' подряд') + '</div></div><div class="right lime">' + fmt(r.w) + ' → ' + fmt(L.suggestWeight(r.w)) + ' кг?</div></div>'; });
      h += '</section>';
    }
    if (flat.length) {
      h += '<section class="card"><div class="row-h muted">' + icon.flat + '<h2 class="fg">Вес не меняется</h2></div>';
      flat.forEach((r) => { h += '<div class="between"><div class="grow"><div class="name">' + esc(r.ex) + '</div><div class="sub">' + r.n + ' ' + plural(r.n, 'тренировка', 'тренировки', 'тренировок') + ' с ' + esc(dLong(r.since)) + '</div></div><div class="right">' + fmt(r.w) + ' кг</div></div>'; });
      h += '</section>';
    }
    h += recordCard(d, t) + weeksChart(wk, curWeek);
    return h + '</main>';
  }

  // Weekly tonnage bars; the record week is gold, the current (unfinished) week is pale.
  function weeksChart(wk, curWeek) {
    const weeks = L.weekTotals(wk).slice(-13);
    if (weeks.length < 2) return '';
    let rec = weeks[0];
    for (const w of L.weekTotals(wk)) if (w.total >= rec.total) rec = w;
    const sel = weeks.find((w) => w.week === ui.weekSel) || weeks.find((w) => w.week === rec.week) || weeks[weeks.length - 1];
    const max = Math.max(...weeks.map((w) => w.total), rec.total);
    let h = '<section class="card"><div class="between"><h2>Тоннаж по неделям</h2><span class="muted sm">тонны</span></div>';
    h += '<div class="sm"><b>' + (sel.week === rec.week ? '🏆 ' : '') + tons(sel.total) + ' т</b> <span class="muted">· неделя с ' + esc(dLong(sel.week)) + (sel.week === curWeek ? ' (идёт)' : '') + (sel.week === rec.week ? ' · рекорд' : '') + '</span></div>';
    h += '<div class="weeks" role="group" aria-label="Тоннаж по неделям">';
    weeks.forEach((w) => {
      const cls = (w.week === rec.week ? ' rec' : '') + (w.week === curWeek ? ' cur' : '') + (w.week === sel.week ? ' sel' : '');
      h += '<button type="button" class="wk' + cls + '" data-act="weeksel" data-w="' + w.week + '" aria-label="Неделя с ' + esc(dLong(w.week)) + ': ' + tons(w.total) + ' т"><span class="wkbar" style="height:' + Math.max(3, Math.round(w.total / max * 100)) + '%"></span></button>';
    });
    h += '</div><div class="between muted sm"><span>' + esc(dShort(weeks[0].week)) + '</span><span>нажмите на столбец</span><span>' + esc(dShort(weeks[weeks.length - 1].week)) + '</span></div></section>';
    return h;
  }

  function chart(ex) {
    if (ex.length < 2) return '<div class="muted sm">Нужно хотя бы две тренировки для графика</div>';
    const W = 320, H = 110, ml = 6, mr = 6, mt = 14, mb = 18;
    const xs = ex.map((s) => L.parseIso(s.date).getTime());
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const ws = ex.map((s) => s.topWeight);
    let lo = Math.min(...ws), hi = Math.max(...ws); if (lo === hi) { lo -= 5; hi += 5; }
    const X = (v) => ml + (v - x0) / (x1 - x0) * (W - ml - mr);
    const Y = (v) => mt + (hi - v) / (hi - lo) * (H - mt - mb);
    const pts = ex.map((s, i) => X(xs[i]).toFixed(1) + ',' + Y(s.topWeight).toFixed(1)).join(' ');
    const label = ex.map((s) => fmt(s.topWeight) + ' кг ' + dShort(s.date)).join(', ');
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Рабочий вес по тренировкам: ' + esc(label) + '">';
    svg += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (H - mb) + '" y2="' + (H - mb) + '" class="axis"/>';
    svg += '<polyline points="' + pts + '" class="line"/>';
    ex.forEach((s, i) => { svg += '<circle cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(s.topWeight).toFixed(1) + '" r="' + (i === ex.length - 1 ? 4.5 : 3) + '" class="pt"/>'; });
    svg += '<text x="' + ml + '" y="' + (H - 4) + '" class="tx">' + esc(dShort(ex[0].date)) + '</text>';
    svg += '<text x="' + (W - mr) + '" y="' + (H - 4) + '" text-anchor="end" class="tx">' + esc(dShort(ex[ex.length - 1].date)) + '</text>';
    svg += '<text x="' + ml + '" y="10" class="tx">' + fmt(hi) + '</text>';
    return svg + '</svg>';
  }

  function screenSettings() {
    const n = db.sets.length;
    const dates = [...new Set(db.sets.map((s) => s.date))].sort();
    let h = '<main class="screen"><header class="head col"><h1 class="title">Данные</h1><div class="muted sm">Всё хранится только на этом телефоне.</div></header>';
    h += '<section class="card"><h2>Записи</h2><div class="muted sm">' + (n ? n + ' ' + plural(n, 'подход', 'подхода', 'подходов') + ' · ' + dates.length + ' ' + plural(dates.length, 'день', 'дня', 'дней') + ' · ' + esc(dLong(dates[0])) + ' — ' + esc(dLong(dates[dates.length - 1])) : 'пока пусто') + '</div></section>';
    h += '<section class="card"><h2>Загрузить историю</h2><div class="muted sm">CSV листа «Журнал» из Google Таблицы или файл, выгруженный из этого приложения. Загруженные записи заменят текущие.</div><label class="btn ghost file">Выбрать CSV-файл<input type="file" accept=".csv,text/csv,text/plain" data-act="import"></label></section>';
    h += '<section class="card"><h2>Резервная копия</h2><div class="muted sm">Сохраните CSV в Файлы или iCloud — на случай, если iPhone очистит данные сайта.</div><button type="button" class="btn ghost" data-act="export"' + (n ? '' : ' disabled') + '>Выгрузить CSV</button></section>';
    h += '<section class="card"><h2>Удалить всё</h2><button type="button" class="btn danger" data-act="wipe"' + (n ? '' : ' disabled') + '>Удалить все записи</button></section>';
    h += '<div class="muted sm" style="text-align:center">Версия приложения: ' + APP_VERSION + '</div>';
    return h + '</main>';
  }

  // ---------- render & events ----------
  function render() {
    const body = ui.screen === 'summary' ? screenSummary() : ui.screen === 'progress' ? screenProgress() : ui.screen === 'settings' ? screenSettings() : screenToday();
    app.innerHTML = body + (ui.screen === 'summary' && !ui.sumFrom ? '' : nav());
  }

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'go') { ui.sumDate = null; ui.sumFrom = null; ui.screen = b.dataset.to; window.scrollTo(0, 0); }
    else if (act === 'slot') { ui.slot = b.dataset.slot; ui.active = null; }
    else if (act === 'open') setActive(b.dataset.ex, derived());
    else if (act === 'step') {
      const dd = Number(b.dataset.d);
      if (b.dataset.k === 'w') ui.w = Math.max(0, Math.round((ui.w + dd) * 10) / 10);
      else ui.r = Math.max(1, ui.r + dd);
    }
    else if (act === 'usew') ui.w = Number(b.dataset.w);
    else if (act === 'weeksel') ui.weekSel = b.dataset.w;
    else if (act === 'add') {
      db.sets.push({ id: L.newId(), date: todayIso(), slot: ui.slot, ex: ui.active, w: ui.w, r: ui.r });
      save();
      const p = db.plan.find((x) => x.name === ui.active);
      if (todaySets(ui.active).length >= L.planSets(p)) ui.active = null; else prefill(ui.active, derived());
    }
    else if (act === 'del') {
      if (!confirm('Удалить этот подход?')) return;
      db.sets = db.sets.filter((s) => s.id !== b.dataset.id); save();
    }
    else if (act === 'finish') { ui.sumDate = null; ui.sumFrom = null; ui.screen = 'summary'; window.scrollTo(0, 0); }
    else if (act === 'daysum') { ui.sumDate = b.dataset.date; ui.sumFrom = 'week'; ui.screen = 'summary'; window.scrollTo(0, 0); }
    else if (act === 'back') { ui.sumDate = null; ui.sumFrom = null; ui.screen = 'today'; window.scrollTo(0, 0); }
    else if (act === 'done') {
      const t = todayIso();
      if (!db.finished.includes(t)) { db.finished.push(t); save(); }
      ui.sumDate = null; ui.screen = 'today'; ui.active = null; window.scrollTo(0, 0);
    }
    else if (act === 'reopen') { db.finished = db.finished.filter((x) => x !== todayIso()); save(); ui.active = null; }
    else if (act === 'export') return doExport();
    else if (act === 'wipe') {
      if (!confirm('Удалить все записи? Это нельзя отменить. Сначала лучше выгрузить CSV.')) return;
      db.sets = []; db.finished = []; save(); ui.active = null;
    }
    else return;
    render();
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'exsel') { ui.progressEx = el.value; render(); }
    if (el.dataset.act === 'import' && el.files && el.files[0]) {
      el.files[0].text().then((txt) => {
        const { sets, skipped } = L.importRows(txt);
        if (!sets.length) {
          const firstLine = String(txt).replace(/^﻿/, '').split(/\r?\n/)[0].slice(0, 80);
          throw new Error('в файле нет подходов с датой, весом и повторами. Похоже, это не лист «Журнал».\n\nПервая строка файла: ' + firstLine);
        }
        const unknown = [...new Set(sets.map((s) => s.ex))].filter((x) => !db.plan.some((p) => p.name === x));
        const msg = 'Найдено подходов: ' + sets.length + (skipped ? '\nПропущено строк без веса или повторов: ' + skipped : '') + (unknown.length ? '\nУпражнения не из плана (в статистику не попадут): ' + unknown.join(', ') : '') + (db.sets.length ? '\n\nТекущие записи (' + db.sets.length + ') будут заменены.' : '') + '\n\nЗагрузить?';
        if (!confirm(msg)) return;
        db.sets = sets; db.finished = [...new Set(sets.map((s) => s.date))].filter((x) => x < todayIso());
        save(); ui.active = null; ui.slot = null;
        alert('Готово: загружено ' + sets.length + ' подходов.');
        render();
      }).catch((err) => alert('Не удалось прочитать файл: ' + err.message)).finally(() => { el.value = ''; });
    }
  });

  function doExport() {
    const csv = L.exportCSV(db.sets);
    const name = 'workout-' + todayIso() + '.csv';
    const file = new File([csv], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }

  // New day while the app stays open: reset the day's selection.
  let lastDay = todayIso();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayIso() !== lastDay) { lastDay = todayIso(); ui.slot = null; ui.active = null; ui.screen = 'today'; render(); }
  });

  // Updates: check for a new version on every open and reload once it takes over.
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  render();
})();
