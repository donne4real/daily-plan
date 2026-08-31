(() => {
  'use strict';

  const CHECKS_KEY = 'dailyplan.v1.checks';
  const app = document.getElementById('app');
  const footer = document.getElementById('footer');

  const state = { data: null, tab: 'today' };

  /* ---------- persistence (localStorage, per-browser; sync-ready IDs) ---------- */

  function loadChecks() {
    try { return JSON.parse(localStorage.getItem(CHECKS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveChecks(c) { localStorage.setItem(CHECKS_KEY, JSON.stringify(c)); }
  function isChecked(id) { return Object.prototype.hasOwnProperty.call(loadChecks(), id); }
  function toggleCheck(id) {
    const c = loadChecks();
    if (c[id]) delete c[id]; else c[id] = new Date().toISOString();
    saveChecks(c);
  }

  // Task/admin checks are scoped to the week's id; daily habits are scoped to the
  // date so they reset every day. Keep these stable — a future synced backend
  // (Netlify Blobs) can use the same keys.
  const checkId = {
    task: (weekId, taskId) => `t:${weekId}:${taskId}`,
    daily: (date, dailyId) => `d:${date}:${dailyId}`,
    admin: (weekId, id) => `a:${weekId}:${id}`,
  };

  /* ---------- dates ---------- */

  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => fmtDate(new Date());
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function daysBetween(fromStr, toStr) { return Math.round((parseDate(toStr) - parseDate(fromStr)) / 86400000); }
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = s => { const d = parseDate(s); return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${MONTHS[d.getMonth()]} ${d.getDate()}`; };

  /* ---------- data helpers ---------- */

  function itemsForDay(day) {
    const weekId = state.data.week.id;
    const dailies = state.data.standingDailies
      .filter(dl => dl.days.includes(day.dow))
      .map(dl => ({ ...dl, kind: 'daily', checkId: checkId.daily(day.date, dl.id) }));
    const tasks = (day.tasks || []).map(t => ({ ...t, kind: 'task', checkId: checkId.task(weekId, t.id) }));
    return [...dailies, ...tasks].sort((a, b) => {
      const as = a.sort || '99:99';
      const bs = b.sort || '99:99';
      return as < bs ? -1 : as > bs ? 1 : 0;
    });
  }

  function adminItems() {
    const weekId = state.data.week.id;
    return state.data.adminItems.map(a => ({ ...a, kind: 'admin', checkId: checkId.admin(weekId, a.id) }));
  }

  function dayProgress(day) {
    const items = itemsForDay(day).filter(i => !i.conditional);
    return { done: items.filter(i => isChecked(i.checkId)).length, total: items.length };
  }

  function todayDay() {
    return state.data.days.find(d => d.date === todayStr()) || null;
  }

  /* ---------- rendering pieces ---------- */

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FLAG_LABELS = { hard: 'Hard gate', rerun: 'Rerun', overdue: 'Overdue' };

  function itemRow(item) {
    const checked = isChecked(item.checkId);
    const cat = item.category || 'review';
    return `
      <div class="task${checked ? ' done' : ''}${item.conditional ? ' conditional' : ''}" data-checkid="${esc(item.checkId)}">
        <div class="cat-dot" style="background: var(--cat-${esc(cat)}, var(--text-faint))" title="${esc(cat)}"></div>
        <button class="task-check" type="button" aria-label="Mark done">✓</button>
        <div class="task-body">
          <div class="task-top">
            ${item.emoji ? `<span class="task-emoji">${item.emoji}</span>` : ''}
            <span class="task-title">${esc(item.title)}</span>
            ${item.flag ? `<span class="tag ${esc(item.flag)}">${FLAG_LABELS[item.flag] || esc(item.flag)}</span>` : ''}
            ${item.conditional ? `<span class="tag conditional">${esc(item.conditional)}</span>` : ''}
            ${item.when ? `<span class="task-when">${esc(item.when)}</span>` : ''}
          </div>
          ${item.detail ? `<div class="task-detail">${esc(item.detail)}</div>` : ''}
        </div>
      </div>`;
  }

  function itemList(items) {
    return items.length ? `<div class="task-list">${items.map(itemRow).join('')}</div>` : `<p class="day-note">Nothing scheduled.</p>`;
  }

  function calloutBox(c) {
    return `
      <div class="callout">
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.body)}</p>
        <div class="callout-options">
          ${c.options.map(o => `
            <div class="callout-option">
              <span class="opt-label">${esc(o.label)}</span>
              <span class="opt-detail">${esc(o.detail)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function progressWidget(key, { done, total }) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const allDone = total > 0 && done === total;
    return `
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" data-progress-fill="${esc(key)}" style="width:${pct}%"></div></div>
        <span class="progress-label${allDone ? ' all-done' : ''}" data-progress-label="${esc(key)}">${done}/${total}</span>
      </div>`;
  }

  function deadlineBanners() {
    const today = todayStr();
    const upcoming = state.data.deadlines
      .map(d => ({ ...d, diff: daysBetween(today, d.date) }))
      .filter(d => d.diff >= 0 && d.diff <= 7)
      .sort((a, b) => a.diff - b.diff);
    if (!upcoming.length) return '';
    return upcoming.map(d => {
      const when = d.diff === 0 ? 'Today' : d.diff === 1 ? 'Tomorrow' : `In ${d.diff} days`;
      return `
        <div class="deadline ${esc(d.severity)}${d.diff === 0 ? ' today-outline' : ''}">
          <span class="when-pill">${when}</span>
          <span>${esc(d.label)}</span>
          <span class="task-when" style="margin-left:auto">${shortDate(d.date)}</span>
        </div>`;
    }).join('');
  }

  /* ---------- Today view ---------- */

  function renderToday() {
    const { week } = state.data;
    const day = todayDay();
    if (!day) {
      const range = `${shortDate(state.data.days[0].date)} – ${shortDate(state.data.days[state.data.days.length - 1].date)}`;
      app.innerHTML = `
        <div class="notice">
          <h3>Outside the current plan week</h3>
          <p>This plan covers ${esc(range)}. Today is ${shortDate(todayStr())}. Regenerate <code>data/tasks.json</code> for the new week — the site will pick it up on the next deploy.</p>
          <p style="margin-top:12px"><button class="btn" id="goto-week">View this week anyway</button></p>
        </div>`;
      document.getElementById('goto-week').addEventListener('click', () => switchTab('week'));
      return;
    }

    const items = itemsForDay(day);
    const admins = adminItems();
    const isFree = day.special === 'free';

    app.innerHTML = `
      ${deadlineBanners()}
      ${day.callout ? calloutBox(day.callout) : ''}
      <div class="card">
        <div class="day-header">
          <h1 class="day-title">${WEEKDAYS[day.dow]}</h1>
          ${isFree ? '<span class="chip free">FREE DAY</span>' : ''}
        </div>
        <p class="day-sub">${esc(day.label)} · ${esc(week.label)} · ${esc(week.context)}</p>
        ${progressWidget('today', dayProgress(day))}
        <div class="section-gap">
          ${isFree ? '<p class="day-note" style="margin:0 0 10px">Standing personal rhythms only — no project work today.</p>' : ''}
          ${itemList(items)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">Admin · 5 min each, high value</h2>
        ${itemList(admins)}
      </div>
      <div class="card">
        <h2 class="card-title">Reminders</h2>
        <ul class="reminder-list">${state.data.reminders.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>`;
  }

  /* ---------- Week view ---------- */

  function renderWeek() {
    const { week } = state.data;
    const today = todayStr();
    const dayCards = state.data.days.map(day => {
      const p = dayProgress(day);
      const allDone = p.total > 0 && p.done === p.total;
      return `
        <details class="card week-day${day.date === today ? ' today-card' : ''}"${day.date === today ? ' open' : ''}>
          <summary>
            <span class="week-day-label">${esc(day.label)}${day.date === today ? ' · today' : ''}</span>
            ${day.special === 'free' ? '<span class="chip free">FREE DAY</span>' : ''}
            <span class="week-day-count${allDone ? ' all-done' : ''}" data-day-count="${day.date}">${p.done}/${p.total}</span>
          </summary>
          <div class="week-day-body">
            ${day.callout ? calloutBox(day.callout) : ''}
            ${itemList(itemsForDay(day))}
          </div>
        </details>`;
    }).join('');

    app.innerHTML = `
      <div class="card">
        <div class="day-header"><h1 class="day-title" style="font-size:20px">${esc(week.label)}</h1></div>
        <p class="week-context">${esc(week.context)}</p>
      </div>
      ${dayCards}
      <div class="card">
        <h2 class="card-title">Known risks this week</h2>
        <ol class="risk-list">${state.data.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
      </div>
      <div class="card">
        <h2 class="card-title">Looking ahead</h2>
        <p class="looking-ahead">${esc(week.lookingAhead)}</p>
      </div>`;
  }

  /* ---------- progress refresh (targeted, keeps <details> open state) ---------- */

  function refreshProgress() {
    const day = todayDay();
    if (day) {
      const p = dayProgress(day);
      const allDone = p.total > 0 && p.done === p.total;
      const fill = document.querySelector('[data-progress-fill="today"]');
      const label = document.querySelector('[data-progress-label="today"]');
      if (fill) fill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
      if (label) {
        label.textContent = `${p.done}/${p.total}`;
        label.classList.toggle('all-done', allDone);
      }
    }
    document.querySelectorAll('[data-day-count]').forEach(el => {
      const d = state.data.days.find(x => x.date === el.dataset.dayCount);
      if (!d) return;
      const p = dayProgress(d);
      el.textContent = `${p.done}/${p.total}`;
      el.classList.toggle('all-done', p.total > 0 && p.done === p.total);
    });
  }

  /* ---------- wiring ---------- */

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    render();
    window.scrollTo({ top: 0 });
  }

  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (btn) switchTab(btn.dataset.tab);
  });

  app.addEventListener('click', e => {
    const check = e.target.closest('.task-check');
    if (!check) return;
    const row = check.closest('.task');
    const id = row?.dataset.checkid;
    if (!id) return;
    toggleCheck(id);
    row.classList.toggle('done', isChecked(id));
    refreshProgress();
  });

  function renderFooter() {
    const { week } = state.data;
    footer.innerHTML = `${esc(week.planVersion)} · data/tasks.json · checks stored in this browser only`;
  }

  function render() {
    (state.tab === 'today' ? renderToday : renderWeek)();
    renderFooter();
  }

  /* ---------- boot ---------- */

  fetch('data/tasks.json', { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      state.data = data;
      render();
    })
    .catch(err => {
      app.innerHTML = `
        <div class="notice">
          <h3>Couldn't load data/tasks.json</h3>
          <p>${esc(err.message)}. If you opened the file directly (file://), serve it instead: <code>python -m http.server</code> or <code>npx serve</code> in this folder, then open http://localhost:8000.</p>
        </div>`;
    });
})();
