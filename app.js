'use strict';
const tg = window.Telegram && window.Telegram.WebApp;
try { tg.ready(); tg.expand(); tg.setHeaderColor('#0b0c0a'); tg.setBackgroundColor('#0b0c0a'); } catch (_) {}

const qs = new URLSearchParams(location.search);
const API = qs.get('api') || window.API_URL || '';
const AUTH = (tg && tg.initData) || (qs.get('dev') ? `dev:${qs.get('dev')}:${encodeURIComponent(qs.get('name') || 'Dev ' + qs.get('dev'))}` : '');
const $app = document.getElementById('app');

let S = null;
const ui = { tab: 'game', pick: 'triple', mode: null, finish: new Set(), form: null, lb: 'season', seasonName: '' };

// Раскладка как на трансляции: 10 и 1 сверху, 2–4 справа, 5–6 снизу, 7–9 слева
// Места по кругу: 1 — справа сверху, дальше по часовой, 10 — слева сверху (как за реальным столом)
const POS = {};
for (let n = 1; n <= 10; n++) {
  const a = (-72 + (n - 1) * 36) * Math.PI / 180;
  POS[n] = [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)];
}
const COLORS = ['#2f6fe0', '#e0782f', '#8e44c9', '#c0392b', '#16a085', '#1f9d55', '#d63a6e', '#b83280', '#7d6b4f', '#2e8b57'];

const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f5c542" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="#f5c542"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#9aa8ff"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M2 21h3V10H2zM22 11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 2 6.6 8.6c-.4.4-.6.9-.6 1.4v9a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  coin: '<svg class="coin" viewBox="0 0 24 24"><path d="M12 2.5c3.6 4.6 6.5 8.4 6.5 11.8A6.5 6.5 0 0 1 5.5 14.3C5.5 10.9 8.4 7.1 12 2.5z" fill="#9bfa1e"/><path d="M9 14.5a3 3 0 0 0 2.5 3" stroke="#0b0c0a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
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
  if (document.activeElement && document.activeElement.matches('#app input, #app textarea')) { pending = true; return; }
  pending = false;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $app.innerHTML = ui.tab === 'game' ? renderGame() : renderRating();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

function renderGame() {
  const g = S.game;
  const canCreate = S.me.isAdmin || S.me.isHost;         // может создавать игры
  const canRun = g && (S.me.isAdmin || g.mine);            // может вести текущую игру
  if (!g) {
    return `<div class="bar"><img class="logo" src="logo.png" alt="Mafia News Drop"><span class="sub"><b>Ждём игру</b></span></div>
      <div class="card empty">Игра ещё не запущена. Бот пришлёт уведомление, когда ведущий её создаст.</div>
      ${canCreate ? adminCreate() : ''}${hostRequestCard()}`;
  }
  const r = g.rounds[g.rounds.length - 1] || null;
  const vote = r ? r.vote : null;
  const triple = r ? r.triple : [];
  const fin = g.status === 'finished';
  const showTally = r && !g.open && r.tally;

  const seats = g.seats.map(s => {
    const [x, y] = POS[s.n];
    const cls = ['seat',
      s.out && 'out',
      vote === s.n && 'vote',
      triple.includes(s.n) && 'sus',
      fin && g.blacks.includes(s.n) && 'black',
      ui.mode === 'finish' && ui.finish.has(s.n) && 'pick',
    ].filter(Boolean).join(' ');
    const t = showTally && r.tally[s.n] ? `<span class="tally">${r.tally[s.n]}</span>` : '';
    const outMark = s.out ? `<span class="mark ${s.out.how === 'shot' ? 'shot' : 'voted'}" title="${s.out.how === 'shot' ? 'Убит ночью' : 'Заголосован'}">${s.out.how === 'shot' ? ICON.target : ICON.like}</span>` : '';
    const face = s.nick ? `<span class="ava">${esc(initials(s.nick))}</span><span class="num">${s.n}</span>` : `<span class="ava big">${s.n}</span>${s.out ? `<span class="num">${s.n}</span>` : ''}`;
    return `<button class="${cls}" data-seat="${s.n}" style="left:${x}%;top:${y}%;--c:${COLORS[s.n - 1]}">
      <span class="tile">${face}${t}${outMark}</span>
      ${s.nick ? `<span class="nick">${esc(s.nick)}</span>` : ''}</button>`;
  }).join('');

  let label, text, status, statusLive = false;
  if (fin) {
    const res = g.result;
    label = 'Вскрытие';
    text = `Чёрные: <b>${g.blacks.join(', ')}</b><br>` + (res ? `Твой итог: <b>+${res.points}</b>` : 'Без прогнозов');
    status = 'Игра завершена';
  } else if (g.open) {
    label = `Круг ${g.round} · жми!`;
    text = ui.pick === 'triple'
      ? 'Отметь до трёх подозреваемых'
      : 'Кого выгоняешь из-за стола?';
    status = `Голосов: ${r.voters}`; statusLive = true;
  } else {
    label = g.round ? `Круг ${g.round}` : 'Знакомство';
    text = 'Слушай речи и жди, когда откроют приём';
    status = 'Приём закрыт';
  }
  const pill = `<div class="hub">
    <div class="label">${esc(label)}</div>
    <div class="text">${text}</div>
    <div class="status ${statusLive ? 'live' : ''}">${esc(status)}</div>
    ${g.stream ? `<button class="stream-btn" data-act="stream" aria-label="Трансляция">${ICON.play}<span>Эфир</span></button>` : ''}
  </div>`;
  const legend = `<div class="legend"><span class="lg voted">${ICON.like}заголосован</span><span class="lg shot">${ICON.target}убит ночью</span><span class="lg sus"><i></i>моя тройка</span><span class="lg vote"><i></i>мой голос</span></div>`;

  const head = `<div class="bar"><img class="logo" src="logo.png" alt="Mafia News Drop">
    <span class="sub"><b>${fin ? 'Итоги' : g.round ? `Круг ${g.round}` : 'Старт'}</b>${esc(g.title)}</span></div>
    ${g.ranked ? '' : `<div class="offrank">Вне зачёта — очки не идут в рейтинг сезона${g.ownerName ? ` · ведёт ${esc(g.ownerName)}` : ''}</div>`}`;

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

  return head + `<div class="table"><div class="felt"></div>${pill}${seats}</div>` + legend + picks + adminPanel(g, canRun, canCreate) + top + hist + hostRequestCard();
}

/** Заявка «стать ведущим» — только для обычных зрителей. */
function hostRequestCard() {
  if (S.me.role !== 'viewer') return '';
  return S.me.requested
    ? `<div class="card req"><h3>Заявка в ведущие отправлена</h3><p class="muted">Админ рассмотрит её и пришлёт ответ в бота.</p></div>`
    : `<div class="card req"><h3>Хочешь вести свои игры?</h3>
        <p class="muted">Ведущий создаёт игры для своей компании. Такие игры идут вне зачёта — в рейтинг сезона не попадают.</p>
        <button class="btn" data-act="requestHost">Подать заявку в ведущие</button></div>`;
}

function adminPanel(g, canRun, canCreate) {
  if (g.status === 'finished') return canCreate ? adminCreate(g) : '';
  if (!canRun) return '';
  const n = g.round;
  const modeHint = ui.mode === 'out' ? 'Нажми на игрока, чтобы отметить выбывшего.'
    : ui.mode === 'finish' ? `Отметь трёх чёрных: выбрано ${ui.finish.size}/3.` : 'Режим зрителя: нажатия на стол — твои прогнозы.';
  return `<div class="card"><h3>${S.me.isAdmin ? 'Админ' : 'Ведущий'}</h3>
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

/** Разбор вставленного списка ников: по строке на игрока, можно с номерами «1. Ник», «5) Ник», «№3 Ник». */
function parseNicks(text) {
  const out = Array(10).fill('');
  const lines = /\n/.test(text) ? text.split(/\r?\n/) : text.split(/[,;\t]/);
  const rest = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:№\s*)?(\d{1,2})(?:\s*[.)\-:–—]\s*|\s+)(.+)$/);
    if (m && +m[1] >= 1 && +m[1] <= 10 && !out[+m[1] - 1]) out[+m[1] - 1] = m[2].trim().slice(0, 32);
    else rest.push(line.slice(0, 32));
  }
  let i = 0;
  for (const nick of rest) { while (i < 10 && out[i]) i++; if (i < 10) out[i++] = nick; }
  return out;
}
function nickPreview(nicks) {
  const n = nicks.filter(Boolean).length;
  return `<div class="muted">Распознано ${n} из 10${n && n < 10 ? ' — пустые места будут просто номерами' : ''}</div>
    <ol class="nick-prev">${nicks.map((v, i) => `<li class="${v ? '' : 'empty'}"><b>${i + 1}</b>${v ? esc(v) : '—'}</li>`).join('')}</ol>`;
}

function adminCreate(prev) {
  if (!ui.form) ui.form = {
    tournament: prev?.tournament || '',
    gameNo: prev?.gameNo ? String(prev.gameNo + 1) : '',
    stream: prev?.stream || '',
    mode: 'list', paste: '', nicks: Array(10).fill(''),
    unranked: false,
  };
  const f = ui.form;
  const modeBody = f.mode === 'list'
    ? `<textarea class="field paste" data-f="paste" rows="6" placeholder="Вставь ники — по одному в строке.\nМожно с номерами мест: 1. Ник, 2) Ник…">${esc(f.paste)}</textarea>
       <div id="nickPreview">${nickPreview(f.nicks)}</div>`
    : f.mode === 'each'
      ? `<div class="nicks">${f.nicks.map((v, i) =>
          `<label><span>${i + 1}</span><input class="field" data-nick="${i}" placeholder="Ник" value="${esc(v)}"></label>`).join('')}</div>`
      : `<p class="muted">За столом будут только номера мест 1–10.</p>`;
  return `<div class="card"><h3>Новая игра</h3>
    <div class="row2">
      <input class="field" data-f="tournament" placeholder="Турнир" value="${esc(f.tournament)}">
      <input class="field num-in" data-f="gameNo" inputmode="numeric" placeholder="Игра №" value="${esc(f.gameNo)}">
    </div>
    <input class="field" data-f="stream" placeholder="Ссылка на трансляцию (необязательно)" value="${esc(f.stream)}">
    <div class="chips">
      <button class="chip ${f.mode === 'list' ? 'on' : ''}" data-nmode="list">Списком</button>
      <button class="chip ${f.mode === 'each' ? 'on' : ''}" data-nmode="each">По одному</button>
      <button class="chip ${f.mode === 'none' ? 'on' : ''}" data-nmode="none">Без ников</button>
    </div>
    ${modeBody}
    ${S.me.isAdmin
      ? `<label class="check"><input type="checkbox" data-f="unranked" ${f.unranked ? 'checked' : ''}><span>Вне зачёта — очки этой игры не пойдут в рейтинг сезона</span></label>`
      : `<p class="muted offrank-note">Твои игры идут вне зачёта: зрители видят результат, но в рейтинг сезона очки не попадают.</p>`}
    <button class="btn primary" data-act="create">Запустить игру и оповестить</button>
  </div>`;
}

function renderRating() {
  const seasonTab = ui.lb === 'season';
  const g = S.game;
  const list = seasonTab ? S.season.table
    : (g && g.top ? g.top.map((p, i) => ({ ...p, place: i + 1, games: 1 })) : []);
  const me = list.find(p => p.id === S.me.id) || { points: 0, games: 0, votes: 0, voteHits: 0, place: '—' };
  const acc = me.votes ? Math.round(me.voteHits / me.votes * 100) + '%' : '—';
  const lvl = 1 + Math.floor((me.points || 0) / 10); // уровень: каждые 10 newsdrop
  const leader = list[0];

  return `<div class="lb-head">
    <img class="logo big" src="logo.png" alt="Mafia News Drop">
    <h1>Рейтинг сыщиков</h1>
    <p class="muted">${esc(S.season.name)} · очки копятся весь сезон, потом таблица начинается с нуля</p>
    <div class="tabs">
      <button data-lb="season" class="${seasonTab ? 'on' : ''}">Весь сезон</button>
      <button data-lb="game" class="${!seasonTab ? 'on' : ''}">Последняя игра</button>
    </div></div>
    <div class="me-card">
      <div class="me-ava">${S.me.photo ? `<img src="${esc(S.me.photo)}" alt="">` : `<span class="ini">${esc(initials(S.me.name))}</span>`}</div>
      <div class="me-info">
        <div class="name">${esc(S.me.name)}</div>
        <div class="badges"><span class="badge">Ур. ${lvl}</span><span class="badge">${ICON.coin}${me.points || 0}</span></div>
        <div class="stats">
          <div><small>Место</small><b>${me.place}</b></div>
          <div><small>Игры</small><b>${me.games || 0}</b></div>
          <div><small>Попадания</small><b>${acc}</b></div>
        </div>
      </div>
    </div>
    ${leader ? `<div class="promo"><b>${leader.id === S.me.id ? 'Ты на вершине' : `Впереди: ${esc(leader.name)}`}</b>
      <span>${leader.id === S.me.id ? 'Лучший нюх на мафию в этом сезоне.' : `До первого места — ${leader.points - (me.points || 0)} newsdrop.`}</span></div>` : ''}
    ${list.length ? `<ul class="lb-list">${list.map(p => `<li class="${p.id === S.me.id ? 'me' : ''}">
        <span class="pl">${p.place}</span>${avatar(p.name, p.photo)}<span class="nm">${esc(p.name)}</span>
        <span class="pt">${ICON.coin}${p.points}</span></li>`).join('')}</ul>`
      : `<div class="empty">${seasonTab ? 'Пока пусто — очки начисляются после вскрытия ролей.' : 'Итоги появятся после вскрытия ролей.'}</div>`}
    ${!seasonTab && g && g.top && !g.ranked ? `<p class="muted">Эта игра была вне зачёта — в рейтинг сезона не пошла.</p>` : ''}
    <p class="muted" style="margin-top:14px">Очки: +${S.scoring.vote} за голос в чёрного, +${S.scoring.triple} за каждого чёрного в тройке круга.</p>
    ${S.me.isAdmin && seasonTab ? `<div class="card"><h3>Новый сезон</h3>
      <p class="muted">Сезон — отрезок времени (например, месяц), за который считается рейтинг. Новый сезон: текущая таблица сохранится в Google Таблице отдельным листом, у всех очки начнутся с нуля. Делай это, когда хочешь подвести итоги и наградить лидера.</p>
      <input class="field" data-f="seasonName" placeholder="Сезон ${S.season.n + 1}" value="${esc(ui.seasonName)}">
      <button class="btn danger" data-act="newSeason">Начать новый сезон</button></div>` : ''}
    ${S.me.isAdmin && seasonTab ? hostsAdminCard() : ''}`;
}

function hostsAdminCard() {
  const reqs = S.me.requests || [], hs = S.me.hosts || [];
  return `<div class="card"><h3>Ведущие</h3>
    <p class="muted">Ведущие создают свои игры. Их игры всегда вне зачёта. Одновременно идёт только одна игра на всех.</p>
    ${reqs.length ? `<h4>Заявки</h4><ul class="rounds">${reqs.map(r => `<li><span>${esc(r.name)}${r.username ? ` <span class="muted">@${esc(r.username)}</span>` : ''}</span>
      <span class="acts"><button class="mini ok" data-act="approve" data-id="${esc(r.id)}">Одобрить</button><button class="mini" data-act="reject" data-id="${esc(r.id)}">Отклонить</button></span></li>`).join('')}</ul>`
      : `<p class="muted">Новых заявок нет.</p>`}
    ${hs.length ? `<h4>Сейчас ведущие</h4><ul class="rounds">${hs.map(h => `<li><span>${esc(h.name)}</span>
      <button class="mini" data-act="revoke" data-id="${esc(h.id)}">Забрать права</button></li>`).join('')}</ul>` : ''}
  </div>`;
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
  else if (el.dataset.f === 'paste') {
    ui.form.paste = el.value;
    ui.form.nicks = parseNicks(el.value);
    const pv = document.getElementById('nickPreview');
    if (pv) pv.innerHTML = nickPreview(ui.form.nicks);
  }
  else if (el.dataset.f === 'seasonName') ui.seasonName = el.value;
  else if (el.type === 'checkbox' && el.dataset.f) ui.form[el.dataset.f] = el.checked;
  else if (el.dataset.f) ui.form[el.dataset.f] = el.value;
});

$app.addEventListener('click', async e => {
  const el = e.target.closest('[data-seat],[data-act],[data-pick],[data-mode],[data-lb],[data-nmode]');
  if (!el || !S) return;
  const g = S.game;

  if (el.dataset.lb) { ui.lb = el.dataset.lb; haptic(); return render(); }
  if (el.dataset.nmode) { ui.form.mode = el.dataset.nmode; haptic(); return render(); }
  if (el.dataset.pick) { ui.pick = el.dataset.pick; haptic(); return render(); }
  if (el.dataset.mode !== undefined) { ui.mode = el.dataset.mode || null; ui.finish.clear(); haptic(); return render(); }
  if (el.dataset.seat) return onSeat(+el.dataset.seat, g);

  switch (el.dataset.act) {
    case 'stream':
      try { tg.openLink(g.stream); } catch (_) { window.open(g.stream, '_blank'); }
      break;
    case 'open': return act('host_open', {}, 'Приём открыт, зрители получили уведомление');
    case 'close': return act('host_close', {}, 'Приём закрыт');
    case 'reopen': return act('host_reopen', {}, 'Приём снова открыт');
    case 'cancel':
      if (await ask('Отменить игру? Прогнозы будут удалены, очки не начислятся.')) { ui.mode = null; act('host_cancel'); }
      break;
    case 'finish':
      if (await ask(`Чёрные: ${[...ui.finish].sort((a, b) => a - b).join(', ')}. Завершить игру и начислить очки?`)) {
        await act('host_finish', { blacks: [...ui.finish] }, g.ranked ? 'Игра завершена, очки начислены' : 'Игра завершена (вне зачёта)');
        ui.mode = null; ui.finish.clear(); ui.form = null; render();
      }
      break;
    case 'create': {
      const f = ui.form;
      if (!f.tournament.trim() && !f.gameNo.trim() && !(await ask('Не указаны турнир и номер игры. Всё равно запустить?'))) break;
      await act('host_create', {
        tournament: f.tournament, gameNo: f.gameNo, stream: f.stream,
        nicks: f.mode === 'none' ? [] : f.nicks, unranked: !!f.unranked,
      }, 'Игра создана, зрители получили уведомление');
      if (S.game && S.game.status === 'live') ui.form = null;
      break;
    }
    case 'requestHost':
      if (await ask('Отправить админу заявку в ведущие?')) act('request_host', {}, 'Заявка отправлена');
      break;
    case 'approve': return act('admin_approve', { id: el.dataset.id }, 'Права ведущего выданы');
    case 'reject': return act('admin_reject', { id: el.dataset.id }, 'Заявка отклонена');
    case 'revoke':
      if (await ask('Забрать права ведущего?')) act('admin_revoke', { id: el.dataset.id }, 'Права забраны');
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
      ? await choose(`№${n}`, seat.nick || `Игрок ${n}`, [{ id: 'back', text: 'Вернуть в игру' }, { type: 'cancel' }])
      : await choose(`№${n}`, seat.nick || `Игрок ${n}`, [{ id: 'vote', text: 'Заголосован' }, { id: 'shot', text: 'Убит ночью' }, { type: 'cancel' }]);
    if (id) act('host_out', { seat: n, how: id === 'back' ? null : id });
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
