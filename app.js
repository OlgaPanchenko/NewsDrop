'use strict';
const tg = window.Telegram && window.Telegram.WebApp;
try { tg.ready(); tg.expand(); tg.setHeaderColor('#17171a'); tg.setBackgroundColor('#17171a'); } catch (_) {}

const qs = new URLSearchParams(location.search);
const API = qs.get('api') || window.API_URL || '';
const AUTH = (tg && tg.initData) || (qs.get('dev') ? `dev:${qs.get('dev')}:${encodeURIComponent(qs.get('name') || 'Dev ' + qs.get('dev'))}` : '');
const $app = document.getElementById('app');

let S = null;
const ui = { tab: 'game', pick: 'triple', mode: null, finish: new Set(), form: null, lb: 'season', seasonName: '' };

// Раскладка как на трансляции: 10 и 1 сверху, 2–4 справа, 5–6 снизу, 7–9 слева
const POS = { 10: [1, 2], 1: [1, 3], 2: [2, 4], 3: [3, 4], 4: [4, 4], 5: [5, 3], 6: [5, 2], 7: [4, 1], 8: [3, 1], 9: [2, 1] };
const COLORS = ['#2f6fe0', '#e0782f', '#8e44c9', '#c0392b', '#16a085', '#1f9d55', '#d63a6e', '#b83280', '#7d6b4f', '#2e8b57'];

const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f5c542" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="#f5c542"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#9aa8ff"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  coin: '<svg class="coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1f9d55"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#c6f432" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="#c6f432"/></svg>',
};

// ---------- утилиты ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = s => String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const hue = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
function avatar(name, photo, cls = 'av') {
  return photo ? `<div class="${cls}"><img src="${esc(photo)}" alt=""></div>`
    : `<div class="${cls}" style="background:hsl(${hue(name)} 45% 32%)">${esc(initials(name))}</div>`;
}
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}
function haptic(kind) {
  try {
    if (kind === 'ok') tg.HapticFeedback.notificationOccurred('success');
    else if (kind === 'err') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.selectionChanged();
  } catch (_) {}
}
function ask(msg) {
  return new Promise(res => {
    try { if (tg && tg.isVersionAtLeast('6.2')) return tg.showConfirm(msg, res); } catch (_) {}
    res(window.confirm(msg));
  });
}
function choose(title, message, buttons) {
  return new Promise(res => {
    try { if (tg && tg.isVersionAtLeast('6.2')) return tg.showPopup({ title, message, buttons }, id => res(id || null)); } catch (_) {}
    const list = buttons.filter(b => b.type !== 'cancel');
    const v = window.prompt(`${title}: ${message}\n` + list.map((b, i) => `${i + 1} — ${b.text}`).join('\n'));
    res(list[Number(v) - 1]?.id || null);
  });
}

// ---------- сеть ----------
// Запросы к Google Apps Script: POST с текстовым телом — так браузер не делает лишний CORS-запрос
let inflight = 0;
async function call(action, payload) {
  inflight++;
  try {
    let j;
    try {
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action, auth: AUTH }, payload || {})) });
      j = await r.json();
    } catch (_) { j = { error: 'Нет связи с сервером' }; }
    if (j.error) throw new Error(j.error);
    if (!j.same) { S = j; render(); }
    return j;
  } finally { inflight--; }
}
async function load(force) {
  if (inflight && S && !force) return; // не затираем ответ на своё же действие
  try { await call('state', { v: S && !force ? S.version : 0 }); }
  catch (e) { if (!S) $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function act(action, body, okMsg) {
  try { await call(action, body || {}); if (okMsg) toast(okMsg); haptic('ok'); }
  catch (e) { toast(e.message); haptic('err'); load(true); }
}

// ---------- рендер ----------
let pending = false;
function render() {
  // Не перерисовываем, пока админ печатает в поле — иначе слетит фокус
  if (document.activeElement && document.activeElement.matches('#app input')) { pending = true; return; }
  pending = false;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $app.innerHTML = ui.tab === 'game' ? renderGame() : renderRating();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

function renderGame() {
  const g = S.game;
  const isAdmin = S.me.isAdmin;
  if (!g) {
    return `<div class="bar"><span class="phase night">${ICON.moon}</span><b>Ожидаем игру</b></div>
      <div class="card empty">Игра ещё не запущена. Бот пришлёт уведомление, когда админ откроет приём прогнозов.</div>
      ${isAdmin ? adminCreate() : ''}`;
  }
  const r = g.rounds[g.rounds.length - 1] || null;
  const vote = r ? r.vote : null;
  const triple = r ? r.triple : [];
  const fin = g.status === 'finished';
  const showTally = r && !g.open && r.tally;

  const seats = g.seats.map(s => {
    const [row, col] = POS[s.n];
    const cls = ['seat',
      s.out && 'out',
      vote === s.n && 'vote',
      triple.includes(s.n) && 'sus',
      fin && g.blacks.includes(s.n) && 'black',
      ui.mode === 'finish' && ui.finish.has(s.n) && 'pick',
    ].filter(Boolean).join(' ');
    const t = showTally && r.tally[s.n] ? `<span class="tally">${r.tally[s.n]}</span>` : '';
    return `<button class="${cls}" data-seat="${s.n}" style="grid-row:${row};grid-column:${col};--c:${COLORS[s.n - 1]}">
      <span class="num">${s.n}</span>${t}
      <span class="tile"><span class="ava">${esc(initials(s.nick))}</span></span>
      ${s.out ? `<span class="cross">${ICON.cross}</span>` : ''}
      <span class="nick">${esc(s.nick)}</span></button>`;
  }).join('');

  let label, text, status, statusLive = false, progress = 0;
  if (fin) {
    const res = g.result;
    label = 'Вскрытие';
    text = `Чёрные: <b>${g.blacks.join(', ')}</b><br><br>` + (res
      ? `Ты заработал <b>${res.points}</b> newsdrop.<br>Голос в чёрного: ${res.voteHits} из ${res.votes}. Попаданий тройкой: ${res.tripleHits}.`
      : 'Ты не делал прогнозов в этой игре.');
    status = 'Игра завершена';
  } else if (g.open) {
    label = `Круг ${g.round} · приём открыт`;
    text = ui.pick === 'triple'
      ? 'Отметь до трёх игроков, которых считаешь чёрными. Тройку можно менять каждый круг.'
      : 'Голосуй за игрока, которого считаешь мафией. Нажми ещё раз, чтобы снять голос.';
    status = `Голосов: ${r.voters}`; statusLive = true; progress = 100;
  } else {
    label = g.round ? `Круг ${g.round}` : 'Знакомство';
    text = 'Дождитесь голосования и проголосуйте за игрока, которого вы считаете мафией';
    status = 'Ожидание';
  }
  const pill = `<div class="pill">
    <div class="label">${esc(label)}</div>
    <div class="progress"><i style="width:${progress}%"></i></div>
    <div class="text">${text}</div>
    <div class="status ${statusLive ? 'live' : ''}">${esc(status)}</div>
    <div class="foot">${g.stream ? `<button class="stream-btn" data-act="stream" aria-label="Трансляция">${ICON.play}</button>` : ''}</div>
  </div>`;

  const head = `<div class="bar"><span class="phase ${g.open || fin ? '' : 'night'}">${g.open || fin ? ICON.sun : ICON.moon}</span>
    <b>${fin ? 'Итоги' : g.round ? `Круг ${g.round}` : 'Старт'}</b><span class="sub">${esc(g.title)}</span></div>`;

  const picks = !fin ? `
    <div class="seg ${g.open ? '' : 'disabled'}">
      <button data-pick="triple" class="${ui.pick === 'triple' ? 'on' : ''}">Тройка ${triple.length}/3</button>
      <button data-pick="vote" class="${ui.pick === 'vote' ? 'on' : ''}">Голос</button>
    </div>
    <div class="picks">Тройка: <b>${triple.length ? triple.join(', ') : '—'}</b> · Голос: <b>${vote || '—'}</b></div>` : '';

  const hist = g.rounds.length ? `<div class="card"><h3>Мои прогнозы</h3><ul class="rounds">${g.rounds.map(x => {
    const vMark = fin && x.vote ? (g.blacks.includes(x.vote) ? '<span class="hit">✓</span>' : '<span class="miss">✗</span>') : '';
    const tHits = fin ? ` <span class="${x.triple.some(s => g.blacks.includes(s)) ? 'hit' : 'miss'}">(${x.triple.filter(s => g.blacks.includes(s)).length})</span>` : '';
    return `<li><span>Круг ${x.n}</span><span>тройка ${x.triple.join(', ') || '—'}${tHits} · голос ${x.vote || '—'} ${vMark}</span></li>`;
  }).join('')}</ul></div>` : '';

  const top = fin && g.top && g.top.length ? `<div class="card"><h3>Лучшие в этой игре</h3><ul class="rounds">${g.top.map((p, i) =>
    `<li><span>${i + 1}. ${esc(p.name)}</span><span class="hit">+${p.points}</span></li>`).join('')}</ul></div>` : '';

  return head + `<div class="table">${seats}${pill}</div>` + picks + (isAdmin ? adminPanel(g) : '') + top + hist;
}

function adminPanel(g) {
  if (g.status === 'finished') return adminCreate(g);
  const n = g.round;
  const modeHint = ui.mode === 'out' ? 'Нажми на игрока, чтобы отметить выбывшего.'
    : ui.mode === 'finish' ? `Отметь трёх чёрных: выбрано ${ui.finish.size}/3.` : 'Режим зрителя: нажатия на стол — твои прогнозы.';
  return `<div class="card"><h3>Админ</h3>
    ${g.open
      ? `<button class="btn primary" data-act="close">Закрыть приём · круг ${n}</button>`
      : `<button class="btn primary" data-act="open">Открыть приём · круг ${n + 1}</button>
         ${n ? `<button class="btn" data-act="reopen">Вернуть приём круга ${n}</button>` : ''}`}
    <div class="chips">
      <button class="chip ${!ui.mode ? 'on' : ''}" data-mode="">Прогнозы</button>
      <button class="chip ${ui.mode === 'out' ? 'on' : ''}" data-mode="out">Выбывшие</button>
      <button class="chip ${ui.mode === 'finish' ? 'on' : ''}" data-mode="finish">Вскрытие ролей</button>
    </div>
    <p class="muted">${modeHint}</p>
    ${ui.mode === 'finish' ? `<button class="btn blue" data-act="finish" ${ui.finish.size === 3 ? '' : 'disabled'}>Завершить игру и начислить очки</button>` : ''}
    <button class="btn danger" data-act="cancel">Отменить игру без начисления</button>
  </div>`;
}

function adminCreate(prev) {
  if (!ui.form) ui.form = { title: '', stream: prev?.stream || '', nicks: prev ? prev.seats.map(s => s.nick) : Array(10).fill('') };
  const f = ui.form;
  return `<div class="card"><h3>Новая игра</h3>
    <input class="field" data-f="title" placeholder="Название (например, Финал · стол 1)" value="${esc(f.title)}">
    <input class="field" data-f="stream" placeholder="Ссылка на трансляцию (необязательно)" value="${esc(f.stream)}">
    <div class="nicks">${f.nicks.map((v, i) =>
      `<label><span>${i + 1}</span><input class="field" data-nick="${i}" placeholder="Ник" value="${esc(v)}"></label>`).join('')}</div>
    <button class="btn primary" data-act="create">Запустить игру</button>
  </div>`;
}

function renderRating() {
  const seasonTab = ui.lb === 'season';
  const g = S.game;
  const list = seasonTab ? S.season.table
    : (g && g.top ? g.top.map((p, i) => ({ ...p, place: i + 1, games: 1 })) : []);
  const me = list.find(p => p.id === S.me.id) || { points: 0, games: 0, votes: 0, voteHits: 0, place: '—' };
  const acc = me.votes ? Math.round(me.voteHits / me.votes * 100) + '%' : '—';
  const lvl = 1 + Math.floor((me.points || 0) / 10);
  const leader = list[0];

  return `<div class="lb-head">
    <h1>Таблица лидеров</h1>
    <p class="muted">${esc(S.season.name)}</p>
    <div class="seg" style="margin:0">
      <button data-lb="season" class="${seasonTab ? 'on' : ''}">Сезон</button>
      <button data-lb="game" class="${!seasonTab ? 'on' : ''}">Эта игра</button>
    </div></div>
    <div class="me-card">
      <div class="me-ava">${S.me.photo ? `<img src="${esc(S.me.photo)}" alt="">` : `<span class="ini">${esc(initials(S.me.name))}</span>`}</div>
      <div class="me-info">
        <div class="name">${esc(S.me.name)}</div>
        <div class="badges"><span class="badge">${lvl} lvl</span><span class="badge">${ICON.coin}${me.points || 0}</span></div>
        <div class="stats">
          <div><small>Место</small><b>${me.place}</b></div>
          <div><small>Игры</small><b>${me.games || 0}</b></div>
          <div><small>Точность</small><b>${acc}</b></div>
        </div>
      </div>
    </div>
    ${leader ? `<div class="promo"><b>${leader.id === S.me.id ? 'Ты лидер — держи планку' : `Лидер: ${esc(leader.name)}`}</b>
      <span>${leader.id === S.me.id ? 'Остальные дышат в спину.' : `Займи первое место в таблице — отставание ${leader.points - (me.points || 0)} newsdrop.`}</span></div>` : ''}
    ${list.length ? `<ul class="lb-list">${list.map(p => `<li class="${p.id === S.me.id ? 'me' : ''}">
        <span class="pl">${p.place}</span>${avatar(p.name, p.photo)}<span class="nm">${esc(p.name)}</span>
        <span class="pt">${ICON.coin}${p.points}</span></li>`).join('')}</ul>`
      : `<div class="empty">${seasonTab ? 'Пока пусто — очки начисляются после вскрытия ролей.' : 'Итоги появятся после вскрытия ролей.'}</div>`}
    <p class="muted" style="margin-top:14px">Очки: +${S.scoring.vote} за голос в чёрного, +${S.scoring.triple} за каждого чёрного в тройке круга.</p>
    ${S.me.isAdmin && seasonTab ? `<div class="card"><h3>Новый сезон</h3>
      <p class="muted">Текущий рейтинг уйдёт в архив, таблица обнулится.</p>
      <input class="field" data-f="seasonName" placeholder="Сезон ${S.season.n + 1}" value="${esc(ui.seasonName)}">
      <button class="btn danger" data-act="newSeason">Начать новый сезон</button></div>` : ''}`;
}

// ---------- события ----------
document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  ui.tab = b.dataset.tab; haptic(); render(); window.scrollTo(0, 0);
});

$app.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.nick !== undefined) ui.form.nicks[+el.dataset.nick] = el.value;
  else if (el.dataset.f === 'seasonName') ui.seasonName = el.value;
  else if (el.dataset.f) ui.form[el.dataset.f] = el.value;
});

$app.addEventListener('click', async e => {
  const el = e.target.closest('[data-seat],[data-act],[data-pick],[data-mode],[data-lb]');
  if (!el || !S) return;
  const g = S.game;

  if (el.dataset.lb) { ui.lb = el.dataset.lb; haptic(); return render(); }
  if (el.dataset.pick) { ui.pick = el.dataset.pick; haptic(); return render(); }
  if (el.dataset.mode !== undefined) { ui.mode = el.dataset.mode || null; ui.finish.clear(); haptic(); return render(); }
  if (el.dataset.seat) return onSeat(+el.dataset.seat, g);

  switch (el.dataset.act) {
    case 'stream':
      try { tg.openLink(g.stream); } catch (_) { window.open(g.stream, '_blank'); }
      break;
    case 'open': return act('admin_open', {}, 'Приём открыт, зрители получили уведомление');
    case 'close': return act('admin_close', {}, 'Приём закрыт');
    case 'reopen': return act('admin_reopen', {}, 'Приём снова открыт');
    case 'cancel':
      if (await ask('Отменить игру? Прогнозы будут удалены, очки не начислятся.')) { ui.mode = null; act('admin_cancel'); }
      break;
    case 'finish':
      if (await ask(`Чёрные: ${[...ui.finish].sort((a, b) => a - b).join(', ')}. Завершить игру и начислить очки?`)) {
        await act('admin_finish', { blacks: [...ui.finish] }, 'Игра завершена, очки начислены');
        ui.mode = null; ui.finish.clear(); ui.form = null; render();
      }
      break;
    case 'create':
      await act('admin_create', ui.form, 'Игра запущена');
      if (S.game && S.game.status === 'live') ui.form = null;
      break;
    case 'newSeason':
      if (await ask('Начать новый сезон? Текущий рейтинг уйдёт в архив.')) { await act('admin_newSeason', { name: ui.seasonName }, 'Новый сезон начат'); ui.seasonName = ''; }
      break;
  }
});

async function onSeat(n, g) {
  if (!g || g.status !== 'live') return;
  const seat = g.seats[n - 1];

  if (ui.mode === 'out') {
    const id = seat.out
      ? await choose(`№${n}`, seat.nick, [{ id: 'back', text: 'Вернуть в игру' }, { type: 'cancel' }])
      : await choose(`№${n}`, seat.nick, [{ id: 'vote', text: 'Заголосован' }, { id: 'shot', text: 'Убит ночью' }, { type: 'cancel' }]);
    if (id) act('admin_out', { seat: n, how: id === 'back' ? null : id });
    return;
  }
  if (ui.mode === 'finish') {
    if (ui.finish.has(n)) ui.finish.delete(n);
    else if (ui.finish.size < 3) ui.finish.add(n);
    else return toast('Уже выбрано три чёрных');
    haptic(); return render();
  }

  if (!g.open) { haptic('err'); return toast('Приём закрыт — ждём голосования на трансляции'); }
  const r = g.rounds[g.rounds.length - 1];
  if (ui.pick === 'vote') {
    if (seat.out) return toast('Игрок уже выбыл');
    haptic();
    r.vote = r.vote === n ? null : n; render(); // сразу показываем выбор, сервер отвечает ~1 сек
    return act('vote', { seat: r.vote });
  }
  const t = new Set(r.triple);
  if (t.has(n)) t.delete(n);
  else if (t.size >= 3) { haptic('err'); return toast('В тройке уже три игрока — сними кого-то'); }
  else t.add(n);
  haptic();
  r.triple = [...t].sort((a, b) => a - b); render();
  act('triple', { seats: r.triple });
}

// ---------- live ----------
if (!API || API.includes('ВСТАВЬ_СЮДА')) {
  $app.innerHTML = '<div class="empty">Не указан адрес Google-скрипта в <b>config.js</b>.</div>';
} else if (!AUTH) {
  $app.innerHTML = '<div class="empty">Открой игру через Telegram-бота.<br><br>Для проверки в браузере добавь к адресу <b>?dev=1</b> (админ) или <b>?dev=2</b> (зритель).</div>';
} else {
  load();
  // Опрос раз в 3 сек: если ничего не менялось, скрипт отвечает коротким «same»
  setInterval(() => { if (!document.hidden) load(); }, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}
