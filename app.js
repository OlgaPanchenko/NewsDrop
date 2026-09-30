'use strict';
const APP_VERSION = '5 · картинка итогов'; // меняй вместе с ?v= в index.html
const tg = window.Telegram && window.Telegram.WebApp;
try { tg.ready(); tg.expand(); tg.setHeaderColor('#0b0c0a'); tg.setBackgroundColor('#0b0c0a'); } catch (_) {}

const qs = new URLSearchParams(location.search);
const API = qs.get('api') || window.API_URL || '';
const AUTH = (tg && tg.initData) || (qs.get('dev') ? `dev:${qs.get('dev')}:${encodeURIComponent(qs.get('name') || 'Dev ' + qs.get('dev'))}` : '');
const $app = document.getElementById('app');

let S = null;
const ui = { outcome: null, ev: null, tab: 'game', pick: 'triple', mode: null, finish: new Set(), fpick: 'blacks', fSheriff: null, fDon: null, form: null, lb: 'season', seasonName: '' };

// Раскладка как на трансляции: 10 и 1 сверху, 2–4 справа, 5–6 снизу, 7–9 слева
// Места по кругу: 1 — справа сверху, дальше по часовой, 10 — слева сверху (как за реальным столом)
const POS = {};
for (let n = 1; n <= 10; n++) {
  const a = (-72 + (n - 1) * 36) * Math.PI / 180;
  POS[n] = [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)];
}
// Виды выбывания: иконка, подпись, класс
const OUT = {
  shot: { icon: 'target', label: 'убит ночью' },
  vote: { icon: 'like', label: 'заголосован' },
  zero: { icon: 'like', label: 'сломан в нуле', cls: 'zero' },
  removed: { icon: 'redcard', label: 'удалён' },
};
const OUTCOMES = [
  ['mafia33', 'Победа мафии 3/3'], ['mafia22', 'Победа мафии 2/2'], ['mafia', 'Победа мафии'],
  ['town', 'Победа мирных'], ['ppk', 'ППК'], ['replay', 'Переигровка'],
];
const COLORS = ['#2f6fe0', '#e0782f', '#8e44c9', '#c0392b', '#16a085', '#1f9d55', '#d63a6e', '#b83280', '#7d6b4f', '#2e8b57'];

const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f5c542" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="#f5c542"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#9aa8ff"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M2 21h3V10H2zM22 11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 2 6.6 8.6c-.4.4-.6.9-.6 1.4v9a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7z"/></svg>',
  redcard: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="17" rx="2" transform="rotate(10 12 11)"/></svg>',
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
  if (S.banned) {
    document.getElementById('nav').style.display = 'none';
    $app.innerHTML = `<div class="bar"><img class="logo" src="logo.png" alt="Mafia News Drop"></div>
      <div class="card empty"><h3>Доступ закрыт</h3><p class="muted">Администратор ограничил твоё участие в игре. Если это ошибка — напиши админу канала.</p></div>`;
    return;
  }
  document.getElementById('nav').style.display = '';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $app.innerHTML = ui.tab === 'game' ? renderGame() : ui.tab === 'guide' ? renderGuide(false) : renderRating();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

function renderGame() {
  const g = S.game;
  const canCreate = S.me.isAdmin || S.me.isHost;         // может создавать игры
  const canRun = g && (S.me.isAdmin || g.mine);            // может вести текущую игру
  if (!g) {
    return `<div class="bar"><img class="logo" src="logo.png" alt="Mafia News Drop"><span class="sub"><b>Ждём игру</b></span></div>
      <div class="card empty">Игра ещё не запущена. Бот пришлёт уведомление, когда ведущий её создаст.</div>
      ${canCreate ? adminCreate() : ''}${hostHint()}${renderGuide(true)}`;
  }
  const r = g.rounds[g.rounds.length - 1] || null;
  const vote = r ? r.vote : null;
  const triple = r ? r.triple : [];
  const fin = g.status === 'finished';
  const replay = fin && g.outcome === 'replay';
  const blacks = (fin && g.blacks) || [];                 // при переигровке может быть пусто
  const lhRound = g.round <= 1;                           // первый круг: только лучший ход (тройка)
  // первый круг: лучший ход + (по желанию) шериф и дон; дальше — тройка и голос
  if (lhRound && ui.pick === 'vote') ui.pick = 'triple';
  if (!lhRound && (ui.pick === 'sheriff' || ui.pick === 'don')) ui.pick = 'triple';
  const r1 = g.rounds[0] || null;
  const myRoles = (r1 && r1.roles) || { sheriff: null, don: null };
  const finishing = ui.mode === 'finish';
  // на столе: во время вскрытия — выбор ведущего, после игры — настоящие роли, в первом круге — мои догадки
  const roleSh = finishing ? ui.fSheriff : fin ? g.sheriff : lhRound ? myRoles.sheriff : null;
  const roleDn = finishing ? ui.fDon : fin ? g.don : lhRound ? myRoles.don : null;
  const roleReal = finishing || fin;
  const showTally = r && !g.open && r.tally;
  const revealed = g.revealed || {};
  const hard = g.level === 'hard';
  const prev = g.rounds.length > 1 ? g.rounds[g.rounds.length - 2] : null;

  const seats = g.seats.map(s => {
    const [x, y] = POS[s.n];
    const cls = ['seat',
      s.out && 'out',
      vote === s.n && 'vote',
      triple.includes(s.n) && 'sus',
      blacks.includes(s.n) && 'black',
      revealed[s.n] && 'revealed',
      ui.mode === 'finish' && ui.finish.has(s.n) && 'pick',
    ].filter(Boolean).join(' ');
    const t = showTally && r.tally[s.n] ? `<span class="tally">${r.tally[s.n]}</span>` : '';
    const o = s.out && (OUT[s.out.how] || OUT.vote);
    const rv = revealed[s.n] ? `<span class="rv" title="Вскрыт чёрный с круга ${revealed[s.n]}">Ч</span>` : '';
    const outMark = o ? `<span class="mark ${s.out.how}" title="${o.label}">${ICON[o.icon]}</span>` : '';
    const roleMark = roleSh === s.n ? `<span class="role sh ${roleReal ? 'real' : ''}" title="Шериф">Ш</span>`
      : roleDn === s.n ? `<span class="role dn ${roleReal ? 'real' : ''}" title="Дон">Д</span>` : '';
    const face = s.nick ? `<span class="ava">${esc(initials(s.nick))}</span><span class="num">${s.n}</span>` : `<span class="ava big">${s.n}</span>${s.out ? `<span class="num">${s.n}</span>` : ''}`;
    return `<button class="${cls}" data-seat="${s.n}" style="left:${x}%;top:${y}%;--c:${COLORS[s.n - 1]}">
      <span class="tile">${face}${t}${outMark}${rv}${roleMark}</span>
      ${s.nick ? `<span class="nick">${esc(s.nick)}</span>` : ''}</button>`;
  }).join('');

  let label, text, status, statusLive = false;
  if (fin) {
    const res = g.result;
    label = g.outcomeLabel || 'Вскрытие';
    text = replay ? 'Очки не начисляются, в рейтинг не идёт'
      : `Чёрные: <b>${blacks.join(', ')}</b>${g.don ? `<br><span class="nowrap">дон ${g.don} · шериф ${g.sheriff}</span>` : ''}<br>` + (res ? `Твой итог: <b>+${res.points}</b>` : 'Без прогнозов');
    ui.lastRes = res;
    status = 'Игра завершена';
  } else if (g.open) {
    label = lhRound ? 'Лучший ход' : `Круг ${g.round} · жми!`;
    text = lhRound ? (ui.pick === 'sheriff' ? 'Кто, по-твоему, шериф?' : ui.pick === 'don' ? 'Кто, по-твоему, дон?' : 'Назови трёх чёрных, как в лучшем ходе')
      : ui.pick === 'triple' ? 'Отметь до трёх подозреваемых' : 'Кого выгоняешь из-за стола?';
    status = lhRound ? 'Приём открыт' : `Голосов: ${r.voters}`; statusLive = true;
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
  const legend = `<div class="legend">${Object.entries(OUT).map(([k, o]) => `<span class="lg ${k}">${ICON[o.icon]}${o.label}</span>`).join('')}<span class="lg sus"><i></i>${lhRound ? 'мой лучший ход' : 'моя тройка — подозреваю'}</span>${lhRound ? '' : '<span class="lg vote"><i></i>мой голос — выгоняю</span>'}${lhRound || fin ? `<span class="lg"><b class="role sh inl ${fin ? 'real' : ''}">Ш</b>${fin ? 'шериф' : 'мой шериф'}</span><span class="lg"><b class="role dn inl ${fin ? 'real' : ''}">Д</b>${fin ? 'дон' : 'мой дон'}</span>` : ''}</div>`;
  const outs = g.seats.filter(x => x.out).sort((a, b) => (a.out.at || '').localeCompare(b.out.at || '') || a.out.round - b.out.round);
  const rvList = Object.keys(revealed).length ? `<div class="card"><h3>Вскрытые чёрные</h3><ul class="rounds">${Object.entries(revealed).map(([n, rr]) =>
    `<li><span><b>№${n}</b> ${esc(g.seats[n - 1].nick)}</span><span class="muted">с круга ${rr}${hard ? ' · очков не приносит' : ''}</span></li>`).join('')}</ul></div>` : '';
  const outList = rvList + (outs.length ? `<div class="card"><h3>Выбыли</h3><ul class="rounds">${outs.map(x => {
    const o = OUT[x.out.how] || OUT.vote;
    return `<li><span>Круг ${x.out.round} · <b>№${x.n}</b> ${esc(x.nick)}</span><span class="outlbl ${x.out.how}">${ICON[o.icon]}${o.label}</span></li>`;
  }).join('')}</ul></div>` : '');

  const head = `<div class="bar"><img class="logo" src="logo.png" alt="Mafia News Drop">
    <span class="sub"><b>${fin ? 'Итоги' : g.round ? `Круг ${g.round}` : 'Старт'}</b>${esc(g.title)}</span></div>
    ${hard ? `<div class="hardlvl">Сложный уровень · вскрытые чёрные не приносят очков · итог ×${S.scoring.hardMult}</div>` : ''}
    ${g.ranked ? '' : `<div class="offrank">Вне зачёта — очки не идут в рейтинг сезона${g.ownerName ? ` · ведёт ${esc(g.ownerName)}` : ''}</div>`}`;

  const spectator = g.hostOnly && g.mine;              // ведущий без участия
  const picks = fin ? '' : spectator ? `
    <div class="picks">Ты ведёшь эту игру без участия — прогнозы не делаешь, в итоги не попадаешь.</div>` : lhRound ? `
    <div class="seg three ${g.open ? '' : 'disabled'}">
      <button data-pick="triple" class="${ui.pick === 'triple' ? 'on' : ''}">Лучший ход ${triple.length}/3</button>
      <button data-pick="sheriff" class="${ui.pick === 'sheriff' ? 'on' : ''}">Шериф ${myRoles.sheriff ? '№' + myRoles.sheriff : '—'}</button>
      <button data-pick="don" class="${ui.pick === 'don' ? 'on' : ''}">Дон ${myRoles.don ? '№' + myRoles.don : '—'}</button>
    </div>
    <div class="picks">Первый круг — лучший ход. Шерифа и дона можно назвать по желанию: +${S.scoring.sheriff} за каждого угаданного. Голосование — со второго круга.</div>` : `
    <div class="seg ${g.open ? '' : 'disabled'}">
      <button data-pick="triple" class="${ui.pick === 'triple' ? 'on' : ''}">Тройка ${triple.length}/3</button>
      <button data-pick="vote" class="${ui.pick === 'vote' ? 'on' : ''}">Голос</button>
    </div>
    <div class="picks">Тройка: <b>${triple.length ? triple.join(', ') : '—'}</b> · Голос: <b>${vote || '—'}</b></div>
    ${g.open && prev && prev.triple.length && prev.triple.join() !== triple.join()
      ? `<button class="btn copy" data-act="copyPrev">Тройка как в прошлом круге: ${prev.triple.join(', ')}</button>` : ''}
    ${g.open && !triple.length ? '<p class="muted center">Тройку нужно отмечать заново в каждом круге.</p>' : ''}`;

  const pr = fin && g.result && g.result.parts;
  const breakdown = pr ? `<p class="muted">Очки: лучший ход +${pr.lh}${pr.roles ? ` · шериф и дон +${pr.roles}` : ''} · тройки +${pr.triple} · голоса +${pr.vote} · стойкость +${pr.streak}${hard ? ` · сложный уровень ×${S.scoring.hardMult}` : ''} = <b class="hit">${g.result.points}</b></p>` : '';
  const hist = g.rounds.length ? `<div class="card"><h3>Мои прогнозы</h3>${breakdown}<ul class="rounds">${g.rounds.map(x => {
    const show = fin && !replay;
    // на сложном уровне вскрытый чёрный с круга вскрытия не считается попаданием
    const live = s => blacks.includes(s) && !(hard && revealed[s] && revealed[s] <= x.n);
    const vMark = show && x.vote ? (live(x.vote) ? '<span class="hit">✓</span>' : blacks.includes(x.vote) ? '<span class="miss">Ч</span>' : '<span class="miss">✗</span>') : '';
    const tHits = show ? ` <span class="${x.triple.some(live) ? 'hit' : 'miss'}">(${x.triple.filter(live).length})</span>` : '';
    return x.n === 1
      ? `<li><span>Круг 1</span><span>лучший ход ${x.triple.join(', ') || '—'}${tHits}${x.roles && (x.roles.sheriff || x.roles.don)
          ? ` · ш ${x.roles.sheriff || '—'}${show && x.roles.sheriff ? (x.roles.sheriff === g.sheriff ? ' <span class="hit">✓</span>' : ' <span class="miss">✗</span>') : ''}`
            + ` · д ${x.roles.don || '—'}${show && x.roles.don ? (x.roles.don === g.don ? ' <span class="hit">✓</span>' : ' <span class="miss">✗</span>') : ''}` : ''}</span></li>`
      : `<li><span>Круг ${x.n}</span><span>тройка ${x.triple.join(', ') || '—'}${tHits} · голос ${x.vote || '—'} ${vMark}</span></li>`;
  }).join('')}</ul></div>` : '';

  const top = fin && g.top && g.top.length ? `<div class="card"><h3>Лучшие в этой игре</h3><ul class="rounds">${g.top.map((p, i) =>
    `<li><span>${i + 1}. ${esc(p.name)}</span><span class="hit">+${p.points}</span></li>`).join('')}</ul></div>` : '';

  const imgBtn = fin && canRun ? '<button class="btn img" data-act="gameImg">Картинка итогов (PNG)</button>' : '';
  return head + `<div class="table"><div class="felt"></div>${pill}${seats}</div>` + legend + picks + imgBtn + adminPanel(g, canRun, canCreate) + outList + top + hist + (canRun && ui.ev ? eventSheet(g) : '');
}

/** Окно «Событие»: тип выбывания + один или несколько игроков (подъём). */
function eventSheet(g) {
  const ev = ui.ev;
  const isRv = ev.how === 'reveal', rvd = g.revealed || {};
  return `<div class="sheet-bg" data-act="evClose"></div>
  <div class="sheet" role="dialog">
    <div class="sheet-head"><b>Событие · круг ${Math.max(g.round, 1)}</b><button class="mini" data-act="evClose">Закрыть</button></div>
    <div class="ev-types">${Object.entries(OUT).map(([k, o]) =>
      `<button class="ev-type ${k} ${ev.how === k ? 'on' : ''}" data-evhow="${k}">${ICON[o.icon]}<span>${o.label}</span></button>`).join('')}
      <button class="ev-type reveal wide ${ev.how === 'reveal' ? 'on' : ''}" data-evhow="reveal"><span class="rv-ico">Ч</span><span>вскрыт чёрный (достоверно)</span></button></div>
    ${isRv ? `<p class="muted">С какого круга он известен всем? Если забыли отметить вовремя — выбери нужный круг задним числом.</p>
      <div class="chips">${Array.from({ length: Math.max(g.round, 1) }, (_, i) => i + 1).map(k =>
        `<button class="chip ${ev.round === k ? 'on' : ''}" data-evround="${k}">круг ${k}</button>`).join('')}</div>` : ''}
    <p class="muted">Выбери игрока${ev.how === 'vote' ? ' (при подъёме — нескольких)' : ''}:</p>
    <div class="ev-seats">${g.seats.map(x => {
      const off = isRv ? !!rvd[x.n] : !!x.out;
      const sub = isRv && rvd[x.n] ? 'вскрыт' : x.out ? (OUT[x.out.how] || OUT.vote).label : esc(x.nick || '');
      return `<button class="ev-seat ${ev.seats.has(x.n) ? 'on' : ''}" data-evseat="${x.n}" ${off ? 'disabled' : ''}><b>${x.n}</b><span>${sub}</span></button>`;
    }).join('')}</div>
    <button class="btn primary" data-act="evSave" ${ev.seats.size ? '' : 'disabled'}>${isRv ? `Вскрыт чёрный с круга ${ev.round}` : `Отметить: ${OUT[ev.how].label}`}${ev.seats.size ? ` — №${[...ev.seats].sort((a, b) => a - b).join(', №')}` : ''}</button>
    ${Object.keys(rvd).length ? `<p class="muted" style="margin-top:14px">Снять отметку «вскрыт»:</p><div class="chips">${Object.keys(rvd).map(n =>
      `<button class="chip" data-act="rvUndo" data-id="${n}">№${n} Ч ↺</button>`).join('')}</div>` : ''}
    ${g.seats.some(x => x.out) ? `<p class="muted" style="margin-top:14px">Ошиблись? Вернуть в игру:</p><div class="chips">${g.seats.filter(x => x.out).map(x =>
      `<button class="chip" data-act="evUndo" data-id="${x.n}">№${x.n} ↺</button>`).join('')}</div>` : ''}
  </div>`;
}

/** Подсказка о ведущих — только пока игры нет; закрывается крестиком и больше не показывается. */
function hostHint() {
  if (S.me.role !== 'viewer' || S.me.requested || store.get('hideHostHint')) return '';
  return `<div class="hint"><span>Хочешь вести свои игры для друзей? Заявку в ведущие можно подать во вкладке «Рейтинг».</span>
    <button class="hint-x" data-act="hideHint" aria-label="Закрыть">×</button></div>`;
}
/** Маленькая кнопка внизу рейтинга. */
function hostRequestLink() {
  if (S.me.role !== 'viewer') return '';
  return S.me.requested
    ? `<p class="muted host-link">Заявка в ведущие отправлена — ответ придёт в бота.</p>`
    : `<button class="host-link btn-link" data-act="requestHost">Стать ведущим</button>`;
}
// localStorage в Telegram может быть недоступен — не падаем
const store = {
  get(k) { try { return localStorage.getItem('nd_' + k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem('nd_' + k, v); } catch (_) {} },
};

/** Инструкция для зрителя. inline=true — показываем на экране «Ждём игру» под сообщением. */
function renderGuide(inline) {
  const sc = S.scoring;
  const seat = (n, cls = '', extra = '') => `<span class="g-seat ${cls}" style="--c:${COLORS[n - 1]}"><span class="g-tile">${n}${extra}</span></span>`;
  const step = (n, title, body, pic = '') => `<li class="g-step"><span class="g-num">${n}</span>
    <div class="g-body"><b>${title}</b>${body}${pic ? `<div class="g-pic">${pic}</div>` : ''}</div></li>`;
  const hat = '<i class="g-hat"></i>';
  return `${inline ? '<h2 class="g-h2">Как играть</h2>' : `<div class="g-head"><img class="logo big" src="logo.png" alt="Mafia News Drop">
      <h1>Как играть</h1><p class="muted">Смотришь трансляцию мафии и угадываешь, кто за столом чёрные. Чем точнее — тем выше в рейтинге.</p></div>`}
  <ol class="g-steps">
    ${step(1, 'Открой игру и включи эфир',
      '<p>Игра открывается через нашего бота — кнопка «Играть». Нажми в боте «Старт», чтобы получать уведомления. Трансляция — кнопка «Эфир» в центре стола.</p>')}
    ${step(2, 'Жди сигнала «приём открыт»',
      '<p>Прогнозы принимаются, пока идёт голосование на трансляции. Бот пришлёт уведомление, а центр стола загорится зелёным. Пока приём закрыт — нажатия не работают.</p>',
      '<span class="g-chip off">Приём закрыт</span><span class="g-arrow">→</span><span class="g-chip on">Приём открыт</span>')}
    ${step(3, 'Круг 1 — лучший ход',
      `<p>Нажми на трёх игроков, которых считаешь чёрными. На них появится шляпа. Нажми ещё раз — отметка снимется. Голосовать в первом круге нельзя.</p>
       <p>Это самый дорогой прогноз: информации ещё нет. 1 чёрный — <b>+${sc.lh[1]}</b>, 2 — <b>+${sc.lh[2]}</b>, все 3 — <b>+${sc.lh[3]}</b>.</p>
       <p>По желанию там же назови <b>шерифа</b> и <b>дона</b> — кнопки «Шериф» и «Дон» рядом с «Лучшим ходом». Можно только одного из них или никого. Угадал — <b>+${sc.sheriff}</b> за шерифа и <b>+${sc.don}</b> за дона. Назвать их можно только в первом круге.</p>`,
      seat(2, 'sus', hat) + seat(5, 'sus', hat + '<b class="role dn">Д</b>') + seat(8, 'sus', hat) + seat(4, '', '<b class="role sh">Ш</b>'))}
    ${step(4, 'Со второго круга — тройка и голос',
      `<p>Внизу переключатель <b>«Тройка / Голос»</b>.</p>
       <p><b>Тройка</b> — до трёх подозреваемых. <b>Отмечается заново в каждом круге</b>: уверен в прежних — нажми «Тройка как в прошлом круге».</p>
       <p><b>Голос</b> — один игрок, которого ты выгоняешь в этом круге, как на голосовании за столом. Подсвечивается зелёным. Каждый круг голосуешь заново.</p>`,
      '<span class="g-switch"><span class="on">Тройка</span><span>Голос</span></span>' + seat(5, 'vote'))}
    ${step(5, 'Приём закрыт — смотри, как проголосовали друзья',
      '<p>Выбор фиксируется. Рядом с игроками появятся цифры — сколько человек проголосовали за каждого. Пока приём открыт, чужие голоса скрыты.</p>',
      seat(5, 'vote', '<span class="g-tally">3</span>') + seat(2, '', '<span class="g-tally">1</span>'))}
    ${step(6, 'Кто выбыл',
      `<p>Ведущий отмечает события по ходу игры. Выбывшие затемняются, а внизу стола появляется список «Выбыли».</p>
       <div class="g-legend">${Object.values(OUT).map(o => `<span class="g-lg ${Object.keys(OUT).find(k => OUT[k] === o)}">${ICON[o.icon]}${o.label}</span>`).join('')}</div>`)}
    ${step(7, 'Вскрытие ролей и очки',
      `<p>В конце ведущий показывает исход игры, чёрных (подсвечиваются красным), шерифа и дона. Очки начисляются сразу:</p>
       <table class="g-table"><tr><th></th><th>Круг 2</th><th>Круг 3</th><th>Дальше</th></tr>
         <tr><td>Чёрный в тройке</td><td>+${sc.triple[2]}</td><td>+${sc.triple[3]}</td><td>+${sc.triple[4]}</td></tr>
         <tr><td>Голос в чёрного</td><td>+${sc.vote[2]}</td><td>+${sc.vote[3]}</td><td>+${sc.vote[4]}</td></tr></table>
       <ul class="g-points">
         <li><b>Лучший ход:</b> +${sc.lh[1]} / +${sc.lh[2]} / +${sc.lh[3]} за 1 / 2 / 3 чёрных</li>
         <li><b>Шериф и дон из первого круга:</b> +${sc.sheriff} и +${sc.don} за угаданного</li>
         <li><b>Стойкость: +${sc.streak}</b> за каждого чёрного, которого ты называл в каждом круге, начиная с первого</li>
       </ul>
       <p class="g-example">Пример: верная тройка с первого круга и без изменений 4 круга → ${sc.lh[3]} + ${3 * sc.triple[2]} + ${3 * sc.triple[3]} + ${3 * sc.triple[4]} + ${3 * sc.streak} = ${sc.lh[3] + 3 * (sc.triple[2] + sc.triple[3] + sc.triple[4] + sc.streak)} newsdrop. Тот, кто понял тех же чёрных только к 4-му кругу, получит ${3 * sc.triple[4]}.</p>
       <p><b>Сложный уровень</b> (если ведущий его включил): чёрный, которого вскрыли достоверно, перестаёт приносить очки с этого круга — всё набранное раньше сохраняется. Итог умножается на ${sc.hardMult}.</p>`,
      seat(2, 'black') + seat(5, 'black') + seat(7, 'black'))}
    ${step(8, 'Рейтинг сезона',
      '<p>Newsdrop копятся весь сезон. Во вкладке «Рейтинг» — твоё место, уровень (каждые 10 newsdrop) и процент попаданий голосом. Новый сезон начинается с нуля, старая таблица сохраняется.</p>')}
  </ol>
  <div class="card g-faq"><h3>Частые вопросы</h3>
    <details><summary>Не приходят уведомления</summary><p>Открой бота и нажми «Старт». Уведомления приходят только тем, кто хотя бы раз открывал игру.</p></details>
    <details><summary>Слишком много уведомлений</summary><p>Сигналы «приём открыт» приходят только в игре, которую ты открыл сегодня. Приглашения на новые игры можно выключить: вкладка «Рейтинг» → «Приглашения на новые игры».</p></details>
    <details><summary>Не получается нажать на игрока</summary><p>Скорее всего, приём закрыт — дождись голосования на трансляции. За выбывшего проголосовать нельзя.</p></details>
    <details><summary>Можно передумать?</summary><p>Да, пока приём открыт — меняй тройку и голос сколько угодно. В зачёт идёт последний выбор.</p></details>
    <details><summary>Что значит «вне зачёта» и «переигровка»?</summary><p>«Вне зачёта» — игра для развлечения, очки в рейтинг сезона не идут. «Переигровка» — игру пересыграют, очки не начисляются никому.</p></details>
    <details><summary>Откуда моё имя в рейтинге?</summary><p>Из твоего профиля Telegram. Регистрация не нужна — Telegram сам передаёт имя и фото, когда ты открываешь игру через бота.</p></details>
  </div>
  <p class="muted center" style="font-size:11px">Версия ${APP_VERSION}</p>`;
}

function adminPanel(g, canRun, canCreate) {
  if (g.status === 'finished') return canCreate ? adminCreate(g) : '';
  if (!canRun) return '';
  const n = g.round;
  const isReplay = ui.outcome === 'replay';
  const canFinish = ui.outcome && (isReplay ? (ui.finish.size === 0 || ui.finish.size === 3) : ui.finish.size === 3 && ui.fSheriff && ui.fDon);
  const modeHint = ui.mode === 'finish'
    ? (isReplay ? 'Переигровка: роли можно не отмечать, очки не начислятся.'
      : ui.fpick === 'sheriff' ? 'Нажми на шерифа.' : ui.fpick === 'don' ? 'Нажми на дона — он должен быть одним из чёрных.'
      : `Выбери исход, отметь трёх чёрных (${ui.finish.size}/3), затем шерифа и дона.`)
    : 'Режим зрителя: нажатия на стол — твои прогнозы.';
  const rvNow = Object.entries(g.revealed || {});
  const rvRemind = ui.mode === 'finish' && g.level === 'hard'
    ? `<div class="hardlvl left">Сложный уровень. Проверь вскрытых чёрных перед завершением: ${rvNow.length ? rvNow.map(([n, rr]) => `№${n} с круга ${rr}`).join(', ') : '<b>никто не отмечен</b>'}.
       Если кого-то забыли — «Событие» → «вскрыт чёрный», круг можно выбрать задним числом.</div>` : '';
  return `<div class="card"><h3>${S.me.isAdmin ? 'Админ' : 'Ведущий'}</h3>
    ${g.open
      ? `<button class="btn primary" data-act="close">Закрыть приём · круг ${n}</button>`
      : `<button class="btn primary" data-act="open">Открыть приём · круг ${n + 1}</button>
         ${n ? `<button class="btn" data-act="reopen">Вернуть приём круга ${n}</button>` : ''}`}
    <button class="btn event" data-act="evOpen">Событие: выбыл / вскрыт чёрный</button>
    <div class="chips">
      <button class="chip ${!ui.mode ? 'on' : ''}" data-mode="">Прогнозы</button>
      <button class="chip ${ui.mode === 'finish' ? 'on' : ''}" data-mode="finish">Вскрытие ролей</button>
    </div>
    <p class="muted">${modeHint}</p>
    ${rvRemind}
    ${ui.mode === 'finish' && !isReplay ? `<div class="seg three">
        <button data-fpick="blacks" class="${ui.fpick === 'blacks' ? 'on' : ''}">Чёрные ${ui.finish.size}/3</button>
        <button data-fpick="sheriff" class="${ui.fpick === 'sheriff' ? 'on' : ''}">Шериф ${ui.fSheriff ? '№' + ui.fSheriff : '—'}</button>
        <button data-fpick="don" class="${ui.fpick === 'don' ? 'on' : ''}">Дон ${ui.fDon ? '№' + ui.fDon : '—'}</button>
      </div>` : ''}
    ${ui.mode === 'finish' ? `<div class="outcomes">${OUTCOMES.map(([k, l]) =>
        `<button class="chip ${ui.outcome === k ? 'on' : ''} ${k === 'replay' ? 'warn' : ''}" data-outcome="${k}">${l}</button>`).join('')}</div>
      <button class="btn blue" data-act="finish" ${canFinish ? '' : 'disabled'}>${isReplay ? 'Завершить: переигровка' : 'Завершить игру и начислить очки'}</button>` : ''}
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
    unranked: false, hard: prev?.level === 'hard', hostOnly: !!prev?.hostOnly,
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
    <p class="muted" style="margin:12px 0 0">Уровень игры</p>
    <div class="chips">
      <button class="chip ${!f.hard ? 'on' : ''}" data-act="lvl" data-id="0">Обычный</button>
      <button class="chip ${f.hard ? 'on' : ''}" data-act="lvl" data-id="1">Сложный ×${S.scoring.hardMult}</button>
    </div>
    ${f.hard ? `<p class="muted">На сложном уровне ты отмечаешь «вскрытых» чёрных — за них перестают давать очки с этого круга.</p>` : ''}
    <label class="check"><input type="checkbox" data-f="hostOnly" ${f.hostOnly ? 'checked' : ''}><span>Только веду — сам не играю (если знаешь роли)</span></label>
    ${S.me.isAdmin || S.me.isTrusted
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
    ${list.length ? `<ul class="lb-list">${list.map(p => `<li class="${p.id === S.me.id ? 'me' : ''}${S.me.isAdmin && p.id !== S.me.id ? ' adm' : ''}"${S.me.isAdmin && p.id !== S.me.id ? ` data-act="player" data-id="${esc(p.id)}" data-name="${esc(p.name)}"` : ''}>
        <span class="pl">${p.place}</span>${avatar(p.name, p.photo)}<span class="nm">${esc(p.name)}</span>
        <span class="pt">${ICON.coin}${p.points}</span></li>`).join('')}</ul>`
      : `<div class="empty">${seasonTab ? 'Пока пусто — очки начисляются после вскрытия ролей.' : 'Итоги появятся после вскрытия ролей.'}</div>`}
    ${!seasonTab && g && g.outcome === 'replay' ? `<p class="muted">Последняя игра закончилась переигровкой — очки не начислялись.</p>`
      : !seasonTab && g && g.top && !g.ranked ? `<p class="muted">Эта игра была вне зачёта — в рейтинг сезона не пошла.</p>` : ''}
    ${!seasonTab && g && g.outcomeLabel && g.outcome !== 'replay' ? `<p class="muted">Исход: ${esc(g.outcomeLabel)}</p>` : ''}
    <p class="muted" style="margin-top:14px">Чем раньше угадал — тем дороже. Лучший ход до +${S.scoring.lh[3]}, тройка и голос дешевеют с каждым кругом. Подробно — во вкладке «Как играть».</p>
    ${S.me.isAdmin && seasonTab ? `<div class="card"><h3>Новый сезон</h3>
      <p class="muted">Сезон — отрезок времени (например, месяц), за который считается рейтинг. Новый сезон: текущая таблица сохранится в Google Таблице отдельным листом, у всех очки начнутся с нуля. Делай это, когда хочешь подвести итоги и наградить лидера.</p>
      <input class="field" data-f="seasonName" placeholder="Сезон ${S.season.n + 1}" value="${esc(ui.seasonName)}">
      <button class="btn danger" data-act="newSeason">Начать новый сезон</button></div>` : ''}
    ${S.me.isAdmin && seasonTab ? hostsAdminCard() : ''}
    ${S.me.isAdmin && seasonTab ? bannedCard() : ''}
    <div class="card notif">
      <div><b>Приглашения на новые игры</b>
        <p class="muted">Бот пишет, когда создана новая игра. Сигналы «приём открыт» приходят только в игре, которую ты открыл.</p></div>
      <button class="switch ${S.me.invites !== false ? 'on' : ''}" data-act="invites" aria-label="Приглашения"><i></i></button>
    </div>
    ${hostRequestLink()}`;
}

function bannedCard() {
  const list = S.me.bannedList || [];
  return `<div class="card"><h3>Блокировки</h3>
    <p class="muted">Нажми на игрока в таблице выше, чтобы обнулить его очки или заблокировать. Заблокированный не может играть, не получает уведомлений и пропадает из рейтинга.</p>
    ${list.length ? `<ul class="rounds">${list.map(b => `<li><span>${esc(b.name)}</span>
      <button class="mini" data-act="unban" data-id="${esc(b.id)}">Разблокировать</button></li>`).join('')}</ul>` : '<p class="muted">Заблокированных нет.</p>'}
  </div>`;
}

function hostsAdminCard() {
  const reqs = S.me.requests || [], hs = S.me.hosts || [];
  return `<div class="card"><h3>Ведущие</h3>
    <p class="muted">Ведущие создают свои игры. Игры обычных ведущих идут вне зачёта, игры <b>доверенных</b> — в рейтинг сезона. Одновременно идёт только одна игра на всех.</p>
    ${reqs.length ? `<h4>Заявки</h4><ul class="rounds">${reqs.map(r => `<li><span>${esc(r.name)}${r.username ? ` <span class="muted">@${esc(r.username)}</span>` : ''}</span>
      <span class="acts"><button class="mini ok" data-act="approve" data-id="${esc(r.id)}">Одобрить</button><button class="mini" data-act="reject" data-id="${esc(r.id)}">Отклонить</button></span></li>`).join('')}</ul>`
      : `<p class="muted">Новых заявок нет.</p>`}
    ${hs.length ? `<h4>Сейчас ведущие</h4><ul class="rounds">${hs.map(h => `<li><span>${esc(h.name)}${h.trusted ? ' <span class="trusted">доверенный</span>' : ''}</span>
      <span class="acts"><button class="mini ${h.trusted ? '' : 'ok'}" data-act="trust" data-id="${esc(h.id)}" data-on="${h.trusted ? 0 : 1}">${h.trusted ? 'Снять доверие' : 'Доверенный'}</button>
      <button class="mini" data-act="revoke" data-id="${esc(h.id)}">Забрать права</button></span></li>`).join('')}</ul>` : ''}
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
  const el = e.target.closest('[data-seat],[data-act],[data-pick],[data-fpick],[data-mode],[data-lb],[data-nmode],[data-evhow],[data-evseat],[data-outcome],[data-evround]');
  if (!el || !S) return;
  const g = S.game;

  if (el.dataset.lb) { ui.lb = el.dataset.lb; haptic(); return render(); }
  if (el.dataset.evhow) { ui.ev.how = el.dataset.evhow; if (ui.ev.how !== 'vote' && ui.ev.seats.size > 1) ui.ev.seats.clear(); haptic(); return render(); }
  if (el.dataset.evround) { ui.ev.round = +el.dataset.evround; haptic(); return render(); }
  if (el.dataset.evseat) {
    const n = +el.dataset.evseat, set = ui.ev.seats;
    if (set.has(n)) set.delete(n);
    else { if (ui.ev.how !== 'vote') set.clear(); set.add(n); } // несколько — только при подъёме
    haptic(); return render();
  }
  if (el.dataset.nmode) { ui.form.mode = el.dataset.nmode; haptic(); return render(); }
  if (el.dataset.pick) { ui.pick = el.dataset.pick; haptic(); return render(); }
  if (el.dataset.fpick) { ui.fpick = el.dataset.fpick; haptic(); return render(); }
  if (el.dataset.mode !== undefined) { ui.mode = el.dataset.mode || null; ui.finish.clear(); ui.outcome = null; ui.fpick = 'blacks'; ui.fSheriff = ui.fDon = null; haptic(); return render(); }
  if (el.dataset.outcome) { ui.outcome = el.dataset.outcome; haptic(); return render(); }
  if (el.dataset.seat) return onSeat(+el.dataset.seat, g);

  switch (el.dataset.act) {
    case 'gameImg': makeGameImage(g); break;
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
    {
      const label = OUTCOMES.find(o => o[0] === ui.outcome)[1];
      const bl = [...ui.finish].sort((a, b) => a - b);
      const q = ui.outcome === 'replay'
        ? 'Завершить игру как переигровку? Очки не начислятся, всем придёт сообщение.'
        : `${label}. Чёрные: ${bl.join(', ')}, дон ${ui.fDon}, шериф ${ui.fSheriff}. Завершить игру и начислить очки?`;
      if (await ask(q)) {
        await act('host_finish', { outcome: ui.outcome, blacks: bl, sheriff: ui.fSheriff, don: ui.fDon },
          ui.outcome === 'replay' ? 'Переигровка: очки не начислены' : g.ranked ? 'Игра завершена, очки начислены' : 'Игра завершена (вне зачёта)');
        ui.mode = null; ui.finish.clear(); ui.outcome = null; ui.form = null; ui.fpick = 'blacks'; ui.fSheriff = ui.fDon = null; render();
      }
      break;
    }
    case 'create': {
      const f = ui.form;
      if (!f.tournament.trim() && !f.gameNo.trim() && !(await ask('Не указаны турнир и номер игры. Всё равно запустить?'))) break;
      await act('host_create', {
        tournament: f.tournament, gameNo: f.gameNo, stream: f.stream,
        nicks: f.mode === 'none' ? [] : f.nicks, unranked: !!f.unranked, hard: !!f.hard, hostOnly: !!f.hostOnly,
      }, 'Игра создана, зрители получили уведомление');
      if (S.game && S.game.status === 'live') ui.form = null;
      break;
    }
    case 'evOpen': ui.ev = { how: g.round <= 1 ? 'zero' : 'vote', seats: new Set(), round: Math.max(g.round, 1) }; haptic(); return render();
    case 'evClose': ui.ev = null; return render();
    case 'evSave': {
      const seats = [...ui.ev.seats], how = ui.ev.how, round = ui.ev.round;
      ui.ev = null; render();
      if (how === 'reveal') return act('host_reveal', { seat: seats[0], round }, `№${seats[0]} — вскрыт чёрный с круга ${round}`);
      return act('host_out', { seats, how }, `Отмечено: ${OUT[how].label}`);
    }
    case 'rvUndo': return act('host_reveal', { seat: +el.dataset.id, round: null }, 'Отметка «вскрыт» снята');
    case 'copyPrev': {
      const r = g.rounds[g.rounds.length - 1], pv = g.rounds[g.rounds.length - 2];
      r.triple = [...pv.triple]; render(); haptic();
      return act('triple', { seats: r.triple }, 'Тройка повторена');
    }
    case 'evUndo': return act('host_out', { seats: [+el.dataset.id], how: null }, 'Игрок возвращён в игру');
    case 'lvl': ui.form.hard = el.dataset.id === '1'; haptic(); return render();
    case 'invites': {
      const on = S.me.invites === false;
      S.me.invites = on; render();
      return act('set_invites', { on }, on ? 'Приглашения включены' : 'Приглашения выключены — бот не будет звать на новые игры');
    }
    case 'hideHint': store.set('hideHostHint', '1'); return render();
    case 'requestHost':
      if (await ask('Ведущий может создавать свои игры для друзей (вне зачёта). Отправить админу заявку?')) act('request_host', {}, 'Заявка отправлена');
      break;
    case 'approve': return act('admin_approve', { id: el.dataset.id }, 'Права ведущего выданы');
    case 'reject': return act('admin_reject', { id: el.dataset.id }, 'Заявка отклонена');
    case 'player': {
      const id = el.dataset.id, name = el.dataset.name;
      const c = await choose(name, 'Что сделать с игроком?', [
        { id: 'reset', type: 'default', text: 'Обнулить очки' },
        { id: 'ban', type: 'destructive', text: 'Заблокировать' },
        { type: 'cancel' },
      ]);
      if (c === 'reset') {
        if (await ask(`Обнулить очки «${name}» в текущем сезоне? Это нельзя отменить.`)) act('admin_resetPoints', { id }, 'Очки обнулены');
      } else if (c === 'ban') {
        const how = await choose('Блокировка', `«${name}» не сможет играть и пропадёт из рейтинга. Его очки:`, [
          { id: 'wipe', type: 'destructive', text: 'Обнулить' },
          { id: 'keep', type: 'default', text: 'Сохранить' },
          { type: 'cancel' },
        ]);
        if (how) act('admin_ban', { id, name, reset: how === 'wipe' }, 'Игрок заблокирован');
      }
      break;
    }
    case 'unban':
      if (await ask('Разблокировать игрока?')) act('admin_unban', { id: el.dataset.id }, 'Игрок разблокирован');
      break;
    case 'trust': {
      const on = el.dataset.on === '1';
      if (await ask(on ? 'Сделать доверенным? Его игры будут идти в рейтинг сезона.' : 'Снять доверие? Его новые игры пойдут вне зачёта.'))
        act('admin_trust', { id: el.dataset.id, on }, on ? 'Теперь доверенный ведущий' : 'Доверие снято');
      break;
    }
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

  if (ui.mode === 'finish') {
    if (ui.fpick === 'sheriff' && ui.outcome !== 'replay') {
      if (ui.finish.has(n)) { haptic('err'); return toast('Шериф не может быть чёрным'); }
      ui.fSheriff = ui.fSheriff === n ? null : n;
      if (ui.fSheriff && !ui.fDon) ui.fpick = 'don';
      haptic(); return render();
    }
    if (ui.fpick === 'don' && ui.outcome !== 'replay') {
      if (!ui.finish.has(n)) { haptic('err'); return toast('Дон должен быть среди отмеченных чёрных'); }
      ui.fDon = ui.fDon === n ? null : n;
      haptic(); return render();
    }
    if (ui.finish.has(n)) { ui.finish.delete(n); if (ui.fDon === n) ui.fDon = null; }
    else if (ui.finish.size < 3) { ui.finish.add(n); if (ui.fSheriff === n) ui.fSheriff = null; }
    else return toast('Уже выбрано три чёрных');
    if (ui.finish.size === 3 && !ui.fSheriff && ui.outcome !== 'replay') ui.fpick = 'sheriff'; // дальше — шериф
    haptic(); return render();
  }

  if (g.hostOnly && g.mine) { haptic('err'); return toast('Ты ведёшь без участия — прогнозы недоступны'); }
  if (!g.open) { haptic('err'); return toast('Приём закрыт — ждём голосования на трансляции'); }
  const r = g.rounds[g.rounds.length - 1];
  if ((ui.pick === 'sheriff' || ui.pick === 'don') && g.round <= 1) {
    const kind = ui.pick, other = kind === 'sheriff' ? 'don' : 'sheriff';
    r.roles = r.roles || { sheriff: null, don: null };
    const val = r.roles[kind] === n ? null : n;
    if (val && r.roles[other] === val) { haptic('err'); return toast(kind === 'sheriff' ? 'Этого игрока ты уже назвал доном' : 'Этого игрока ты уже назвал шерифом'); }
    r.roles[kind] = val; haptic(); render();
    return act('role', { kind, seat: val });
  }
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

// ---------- картинка итогов игры (квадрат 1080×1080) ----------
let h2c = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve();
  return h2c || (h2c = new Promise((ok, fail) => {
    const sc = document.createElement('script'); sc.src = 'html2canvas.min.js?v=1';
    sc.onload = ok; sc.onerror = () => { h2c = null; fail(new Error('Не загрузился модуль картинок')); };
    document.head.appendChild(sc);
  }));
}

/** Квадратная карточка итогов — собирается отдельно от экрана, чтобы всегда помещаться в 540×540 (×2 = 1080). */
function squareCard(g) {
  const nick = n => g.seats[n - 1] && g.seats[n - 1].nick;
  const chip = (n, cls, tag) => `<div class="sq-chip ${cls}"><span class="sq-num">${n}</span><span class="sq-nick">${esc(nick(n) || 'Игрок №' + n)}</span>${tag ? `<em>${tag}</em>` : ''}</div>`;
  const replay = g.outcome === 'replay';
  const blacks = g.blacks || [];
  const top = (g.top || []).filter(p => p.points > 0).slice(0, 3);
  const sub = [g.tournament && g.gameNo ? `Игра ${g.gameNo}` : '', g.level === 'hard' ? 'сложный уровень' : '', g.ranked ? '' : 'вне зачёта'].filter(Boolean).join(' · ');
  const roles = replay ? '<div class="sq-replay">Игру переиграют — очки не начислялись</div>' : `
    <div class="sq-label">Чёрные</div>
    <div class="sq-chips">${blacks.map(n => chip(n, 'black', n === g.don ? 'дон' : '')).join('')}</div>
    ${g.sheriff ? `<div class="sq-chips">${chip(g.sheriff, 'sher', 'шериф')}</div>` : ''}`;
  const best = replay ? '' : top.length ? `
    <div class="sq-label">Лучшие в угадывании</div>
    <ol class="sq-top">${top.map((p, i) => `<li><span class="sq-pl p${i + 1}">${i + 1}</span><span class="sq-name">${esc(p.name)}</span><b>+${p.points}</b></li>`).join('')}</ol>`
    : '<div class="sq-label">Прогнозов в этой игре не было</div>';
  return `<div class="sq">
    <div class="sq-head"><img src="logo.png" alt=""><span>Итоги игры</span></div>
    <div class="sq-title">${esc(g.tournament || g.title)}</div>
    ${sub ? `<div class="sq-sub">${esc(sub)}</div>` : ''}
    <div class="sq-outcome">${esc(g.outcomeLabel || 'Игра завершена')}</div>
    ${roles}
    ${best}
    <div class="sq-foot"><span>${g.count ? `Прогнозов: <b>${g.count}</b>` : ''}</span><span>Mafia News Drop · угадай мафию</span></div>
  </div>`;
}

async function makeGameImage(g) {
  toast('Готовлю картинку…');
  try {
    await loadH2C();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;height:540px;background:#0b0c0a';
    wrap.innerHTML = squareCard(g);
    document.body.appendChild(wrap);
    await Promise.all([...wrap.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const canvas = await window.html2canvas(wrap, { scale: 2, width: 540, height: 540, backgroundColor: '#0b0c0a', logging: false });
    wrap.remove();
    const data = canvas.toDataURL('image/png');
    const old = document.getElementById('imgview'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'imgview';
    box.innerHTML = `<div class="iv-inner"><img src="${data}" alt="">
      <p class="muted center">Зажми картинку, чтобы сохранить, или пусть бот пришлёт её тебе.</p>
      <button class="btn primary" data-iv="me">Прислать мне в Telegram</button>
      <button class="btn" data-iv="close">Закрыть</button></div>`;
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-iv]'); if (!b) return;
      if (b.dataset.iv === 'close') return box.remove();
      b.disabled = true; b.textContent = 'Отправляю…';
      try { await call('host_image', { png: data.split(',')[1] }); toast('Картинка отправлена тебе в личку от бота'); haptic('ok'); box.remove(); }
      catch (err) { toast(err.message); b.disabled = false; b.textContent = 'Попробовать ещё раз'; }
    });
    document.body.appendChild(box);
  } catch (e) { toast(e.message || 'Не получилось сделать картинку'); }
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
