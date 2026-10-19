'use strict';

/* =========================================================
   MENUS - the HTML screens layered over the canvas.

   Every screen is a <div class="screen" id="menu-..."> in
   index.html. Selectable rows have class "item" and either:
     data-action="name"   -> runs ACTIONS[name] when chosen
     data-setting="key"   -> an option row; left/right changes it
   Screens can also have:
     data-escape="action" -> what ESC does on that screen
     data-cols="8"        -> grid navigation (level select)
   Rows inside side-by-side .menu-col columns (the shop) use
   left/right to jump between columns.

   Menu.open() remembers where you came from, and Menu.back()
   returns there - so e.g. SETTINGS opened from the pause menu
   goes back to the pause menu.
   ========================================================= */

const Menu = {
  current: null, // the visible screen element
  items: [],     // its selectable rows
  index: 0,      // which row is highlighted
  stack: [],     // screens to return to

  // Show a screen (replacing whatever is showing). focus = row to highlight.
  show(id, focus = null) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(id);
    if (ON_SHOW[id]) ON_SHOW[id](el);
    el.classList.add('active');
    this.current = el;
    this.items = [...el.querySelectorAll('.item')];
    this.items.forEach((it, i) => {
      it.onmouseenter = () => this.select(i, true);
      it.onclick = () => {
        Sound.init();
        if (this.isDisabled(i)) return;
        this.index = i;
        this.render();
        this.activate();
      };
    });
    const first = this.items.findIndex((_, i) => !this.isDisabled(i));
    this.index = focus !== null && this.items[focus] && !this.isDisabled(focus) ? focus : Math.max(0, first);
    this.render();
  },

  // Go to a screen and remember this one for Menu.back().
  open(id, focus = null) {
    if (this.current) this.stack.push({ id: this.current.id, index: this.index });
    this.show(id, focus);
  },

  back() {
    const prev = this.stack.pop();
    this.show(prev ? prev.id : 'menu-main', prev ? prev.index : null);
  },

  clearStack() {
    this.stack.length = 0;
  },

  hide() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this.current = null;
  },

  isDisabled(i) {
    return this.items[i].classList.contains('disabled');
  },

  select(i, quiet = false) {
    if (this.isDisabled(i) || i === this.index) return;
    this.index = i;
    if (!quiet) Sound.blip();
    this.render();
  },

  // Highlight the selected row and show its hint text.
  render() {
    this.items.forEach((it, i) => it.classList.toggle('selected', i === this.index));
    // If the screen is scrolled, keep the highlighted row on screen
    const sel = this.items[this.index];
    if (sel && this.current.scrollHeight > this.current.clientHeight) sel.scrollIntoView({ block: 'nearest' });
    const hint = this.current.querySelector('.hint');
    if (hint && !capture) {
      hint.classList.remove('bad');
      hint.textContent = this.items[this.index].dataset.hint || '';
    }
    if (this.current.id === 'menu-shop') drawShopPreview();
  },

  // Arrow-key navigation. Grid screens (data-cols) move in 2D.
  nav(dir) {
    const it = this.items[this.index];
    if (!it) return;
    const horiz = dir === 'left' || dir === 'right';
    if (horiz && it.classList.contains('option')) {
      cycleSetting(it.dataset.setting, dir === 'left' ? -1 : 1);
      return;
    }
    const cols = Number(this.current.dataset.cols) || 1;
    if (horiz && cols === 1) {
      const col = it.closest('.menu-col');
      if (col) this.navColumn(col, it, dir === 'left' ? -1 : 1);
      return;
    }

    const n = this.items.length;
    const step = dir === 'up' ? -cols : dir === 'down' ? cols : dir === 'left' ? -1 : 1;
    let i = cols === 1 ? (this.index + step + n) % n : clamp(this.index + step, 0, n - 1);
    // Skip over locked/disabled rows
    const s = Math.sign(step);
    let guard = n;
    while (this.isDisabled(i) && guard-- > 0) i = (i + s + n) % n;
    this.select(i);
  },

  // Jump to the row at the same height in the neighboring column.
  navColumn(col, it, step) {
    const cols = [...col.parentElement.children].filter(c => c.classList.contains('menu-col'));
    const other = cols[cols.indexOf(col) + step];
    if (!other) return;
    const rows = [...other.querySelectorAll('.item')];
    const pos = [...col.querySelectorAll('.item')].indexOf(it);
    const target = rows[Math.min(pos, rows.length - 1)];
    if (target) this.select(this.items.indexOf(target));
  },

  activate() {
    const it = this.items[this.index];
    if (!it || this.isDisabled(this.index)) return;
    if (it.classList.contains('option')) {
      cycleSetting(it.dataset.setting, 1);
      return;
    }
    Sound.select();
    const fn = ACTIONS[it.dataset.action];
    if (fn) fn(it);
  },

  // Menus always accept arrows/WASD/Enter/Space/Esc, plus the player's own movement keys.
  handleKey(e) {
    const bound = actionForCode(e.code);
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }[e.code]
      || (['up', 'down', 'left', 'right'].includes(bound) ? bound : null);
    if (dir) {
      this.nav(dir);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (!e.repeat) this.activate();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      const action = this.current.dataset.escape;
      if (action && !e.repeat) {
        Sound.blip();
        ACTIONS[action]();
      }
    }
  },
};

// ---------- What each menu row does ----------
const ACTIONS = {
  start: () => newGame({ level: 1 }),
  infinite: () => newGame({ infinite: true }),
  levels: () => Menu.open('menu-levels', progress.unlocked - 1),
  level: it => newGame({ level: Number(it.dataset.level) }),
  shop: () => Menu.open('menu-shop'),
  buy: it => shopActivate(it),
  quests: () => Menu.open('menu-quests'),
  help: () => Menu.open('menu-help'),
  settings: () => Menu.open('menu-settings'),
  setGameplay: () => Menu.open('menu-set-gameplay'),
  setControls: () => Menu.open('menu-set-controls'),
  setGraphics: () => Menu.open('menu-set-graphics'),
  setAudio: () => Menu.open('menu-set-audio'),
  keybinds: () => Menu.open('menu-keybinds'),
  bind: it => startBind(it),
  resetKeys: () => {
    resetKeybinds();
    renderBinds();
    setHint('KEYS RESET TO DEFAULTS.');
  },
  fullscreen: () => toggleFullscreen(),
  back: () => Menu.back(),
  main: () => goMainMenu(),
  resume: () => resumeGame(),
  restart: () => restartGame(),
  retry: () => newGame({ level: game.level, infinite: game.infinite }),
  reset: it => {
    // Two presses needed so progress isn't wiped by accident
    if (!it.dataset.armed) {
      it.dataset.armed = '1';
      it.textContent = 'PRESS AGAIN TO CONFIRM';
      return;
    }
    delete it.dataset.armed;
    resetProgress();
    it.textContent = 'PROGRESS RESET';
  },
};

// Things to refresh right before a screen appears.
const ON_SHOW = {
  'menu-main': () => {
    $('hi-main').textContent = pad(progress.highScore, 6);
    $('voyage-main').textContent = progress.bestDistance.toFixed(1) + ' LY';
    $('credits-main').textContent = progress.credits;
  },
  'menu-levels': buildLevelGrid,
  'menu-shop': buildShop,
  'menu-quests': renderQuests,
  'menu-settings': () => {
    const reset = $('reset-item');
    delete reset.dataset.armed;
    reset.textContent = 'RESET PROGRESS';
  },
  'menu-keybinds': renderBinds,
};

function setHint(msg, bad = false) {
  const hint = Menu.current && Menu.current.querySelector('.hint');
  if (!hint) return;
  hint.textContent = msg;
  hint.classList.toggle('bad', bad);
}

// ---------- Settings ----------
function cycleSetting(key, dir) {
  const vals = SETTINGS_DEF[key].values;
  const i = (vals.indexOf(settings[key]) + dir + vals.length) % vals.length;
  settings[key] = vals[i];
  saveSettings();
  applySettings();
  renderSettings();
  Sound.blip();
}

function renderSettings() {
  document.querySelectorAll('[data-setting]').forEach(it => {
    const key = it.dataset.setting;
    it.querySelector('.value').textContent = `◀ ${SETTINGS_DEF[key].label(settings[key])} ▶`;
  });
}

// Fullscreen the whole page (not just the game box) so it stays 4:3 and centered.
function toggleFullscreen() {
  const fail = () => setHint('FULLSCREEN IS NOT AVAILABLE HERE.', true);
  try {
    const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (req && req.catch) req.catch(fail);
  } catch (e) {
    fail();
  }
}

// ---------- Key rebinding ----------
// Each action has up to two keys. Choosing a row starts "capture": the next
// key (or mouse button) becomes key 1, the one after that key 2 (ESC skips it).
function renderBinds() {
  const list = $('bind-list');
  list.querySelectorAll('.bind-row').forEach(row => {
    const [a, b] = keybinds[row.dataset.bind];
    row.querySelector('.bkeys').innerHTML = `<b>${keyLabel(a)}</b><b>${keyLabel(b)}</b>`;
    row.classList.remove('capturing');
  });
}

function buildBindRows() {
  const list = $('bind-list');
  list.innerHTML = '';
  for (const act of BIND_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'item bind-row';
    row.dataset.action = 'bind';
    row.dataset.bind = act.id;
    row.dataset.hint = 'PRESS ENTER OR CLICK, THEN PRESS THE NEW KEY OR MOUSE BUTTON.';
    row.innerHTML = `<span>${act.label}</span><span class="bkeys"></span>`;
    list.appendChild(row);
  }
}

function startBind(row) {
  const action = row.dataset.bind;
  const label = BIND_ACTIONS.find(b => b.id === action).label;
  const newKeys = [];
  row.classList.add('capturing');
  row.querySelector('.bkeys').innerHTML = '<b>...</b><b>...</b>';
  setHint(`PRESS A KEY FOR ${label}  (ESC = CANCEL)`);

  const finish = () => {
    capture = null;
    const [first, second] = newKeys;
    const moved = assignKeys(action, first, second && second !== first ? second : null);
    renderBinds();
    Sound.select();
    setHint(moved.length ? `SAVED. THAT KEY WAS TAKEN FROM: ${moved.join(', ')}` : 'SAVED!', moved.length > 0);
  };

  capture = {
    assign(code) {
      newKeys.push(code);
      if (newKeys.length === 1) {
        row.querySelector('.bkeys').innerHTML = `<b>${keyLabel(code)}</b><b>...</b>`;
        setHint(`NOW A SECOND KEY FOR ${label}  (ESC = KEEP JUST ONE)`);
        Sound.blip();
      } else {
        finish();
      }
    },
    cancel() {
      if (newKeys.length) {
        finish();
      } else {
        capture = null;
        renderBinds();
        setHint('CANCELLED.');
      }
    },
  };
}

// ---------- Level select ----------
function buildLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  for (let n = 1; n <= MAX_LEVEL; n++) {
    const locked = n > progress.unlocked;
    const info = LEVELS[n - 1];
    const tw = TWISTS[info.twist];
    const card = document.createElement('div');
    card.className = 'item level-card' + (locked ? ' disabled' : '');
    card.dataset.action = 'level';
    card.dataset.level = n;
    card.dataset.hint = `${info.name} - TWIST: ${tw.label}. ${tw.tip}`;
    card.innerHTML = `<span class="lnum">${pad(n, 2)}</span>` +
      `<span class="lname">${locked ? 'LOCKED' : info.name}</span>` +
      `<span class="ltwist">${locked ? '' : tw.label}</span>`;
    grid.appendChild(card);
  }
}

// ---------- Shop ----------
// Rows use data-shop="up:<id>" for upgrades and "skin:<id>" for paint jobs.
// Upgrades and paint jobs sit in two side-by-side columns.
function buildShop() {
  const list = $('shop-list');
  list.innerHTML = '';
  const column = (title, ids) => {
    const col = document.createElement('div');
    col.className = 'shop-col menu-col';
    const h = document.createElement('div');
    h.className = 'shop-head';
    h.textContent = title;
    col.appendChild(h);
    for (const id of ids) {
      const r = document.createElement('div');
      r.className = 'item shop-row';
      r.dataset.action = 'buy';
      r.dataset.shop = id;
      col.appendChild(r);
      renderShopRow(r);
    }
    list.appendChild(col);
  };
  column('UPGRADES', UPGRADES.map(u => 'up:' + u.id));
  column('PAINT JOBS', Object.keys(SKINS).map(id => 'skin:' + id));
  $('shop-credits').textContent = progress.credits;
}

function renderShopRow(r) {
  const [kind, id] = r.dataset.shop.split(':');
  r.classList.remove('cant', 'owned');
  if (kind === 'up') {
    const u = UPGRADE_MAP[id];
    const lvl = up(id);
    const maxed = lvl >= u.costs.length;
    const pips = u.costs.map((_, i) => `<i class="pip${i < lvl ? ' on' : ''}"></i>`).join('');
    const cost = maxed ? 'MAXED' : `${u.costs[lvl]} CR`;
    if (maxed) r.classList.add('owned');
    else if (progress.credits < u.costs[lvl]) r.classList.add('cant');
    r.dataset.hint = u.desc;
    r.innerHTML = `<span class="sname">${u.label}</span><span class="spips">${pips}</span><span class="scost">${cost}</span>`;
  } else {
    const s = SKINS[id];
    const owned = progress.skins.includes(id);
    const cost = progress.skin === id ? 'EQUIPPED' : owned ? 'EQUIP' : `${s.cost} CR`;
    if (owned) r.classList.add('owned');
    else if (progress.credits < s.cost) r.classList.add('cant');
    r.dataset.hint = `${s.label} PAINT JOB. COSMETIC ONLY - ${owned ? 'PRESS ENTER TO EQUIP.' : 'BUY IT TO UNLOCK.'}`;
    r.innerHTML = `<span class="sname"><i class="swatch" style="background:${s.trim};box-shadow:0 0 .6cqw ${s.trim}"></i>${s.label}</span><span class="spips"></span><span class="scost">${cost}</span>`;
  }
}

function shopActivate(r) {
  const [kind, id] = r.dataset.shop.split(':');
  if (kind === 'up') {
    const u = UPGRADE_MAP[id];
    const lvl = up(id);
    if (lvl >= u.costs.length) {
      Sound.error();
      setHint('ALREADY MAXED OUT.', true);
      return;
    }
    if (progress.credits < u.costs[lvl]) {
      Sound.error();
      setHint(`NOT ENOUGH CREDITS - NEED ${u.costs[lvl] - progress.credits} MORE.`, true);
      return;
    }
    progress.credits -= u.costs[lvl];
    progress.upgrades[id] = lvl + 1;
    questEvent('buy');
    Sound.buy();
  } else {
    const s = SKINS[id];
    if (!progress.skins.includes(id)) {
      if (progress.credits < s.cost) {
        Sound.error();
        setHint(`NOT ENOUGH CREDITS - NEED ${s.cost - progress.credits} MORE.`, true);
        return;
      }
      progress.credits -= s.cost;
      progress.skins.push(id);
      questEvent('buy');
      Sound.buy();
    }
    progress.skin = id;
  }
  saveProgress();
  // Refresh every row (credits changed, so affordability changed too)
  $('shop-list').querySelectorAll('.shop-row').forEach(renderShopRow);
  $('shop-credits').textContent = progress.credits;
  Menu.render();
}

// Draws the highlighted paint job (or the equipped one) in the shop.
function drawShopPreview() {
  const c = $('shop-preview');
  const g = c.getContext('2d');
  const it = Menu.items[Menu.index];
  const skinId = it && it.dataset.shop && it.dataset.shop.startsWith('skin:') ? it.dataset.shop.slice(5) : progress.skin;
  const sk = SKINS[skinId];
  g.clearRect(0, 0, c.width, c.height);
  g.save();
  g.translate(c.width / 2 + 10, c.height / 2);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glowSprite(sk.engine), -90, -26, 52, 52);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(shipSprite(skinId), -60, -60, 120, 120);
  g.restore();
}

// ---------- Daily quests ----------
function renderQuests() {
  ensureDaily();
  const d = progress.daily;
  $('quest-list').innerHTML = d.quests.map(q => {
    const pct = Math.round((q.progress / q.target) * 100);
    return `<div class="quest${q.done ? ' done' : ''}">
      <div class="qtop"><span>${q.done ? '✓ ' : ''}${questText(q)}</span><span class="qreward">+${q.reward} CR</span></div>
      <div class="qbar"><i style="width:${pct}%"></i></div>
      <div class="qprog">${q.done ? 'COMPLETE!' : `${q.progress} / ${q.target}`}</div>
    </div>`;
  }).join('');
  $('quest-bonus').textContent = d.bonusDone
    ? 'ALL DONE TODAY! COME BACK TOMORROW.'
    : `COMPLETE ALL 3 FOR A +${DAILY_BONUS} CR BONUS`;
  $('quest-reset').textContent = timeUntilMidnight();
}

// ---------- Toast pop-ups ----------
function toast(title, sub = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = title;
  if (sub) {
    const s = document.createElement('span');
    s.textContent = sub;
    el.appendChild(s);
  }
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2800);
  setTimeout(() => el.remove(), 3400);
}
