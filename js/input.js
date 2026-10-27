'use strict';

const BIND_ACTIONS = [
  { id: 'up',    label: 'UP / THRUST' },
  { id: 'down',  label: 'DOWN / BRAKE' },
  { id: 'left',  label: 'LEFT / TURN LEFT' },
  { id: 'right', label: 'RIGHT / TURN RIGHT' },
  { id: 'fire',  label: 'FIRE' },
  { id: 'fix',   label: 'FIX JAM' },
  { id: 'pause', label: 'PAUSE' },
];

const DEFAULT_KEYBINDS = {
  up:    ['KeyW', 'ArrowUp'],
  down:  ['KeyS', 'ArrowDown'],
  left:  ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  fire:  ['Space', 'Mouse0'],
  fix:   ['KeyF', null],
  pause: ['KeyP', 'Escape'],
};

const keybinds = (() => {
  const saved = Store.load('sd-keys', {});
  const out = {};
  for (const id of Object.keys(DEFAULT_KEYBINDS)) {
    const v = saved[id];
    out[id] = Array.isArray(v) && v.length === 2 ? v : DEFAULT_KEYBINDS[id].slice();
  }
  return out;
})();

const saveKeybinds = () => Store.save('sd-keys', keybinds);

function resetKeybinds() {
  for (const id of Object.keys(DEFAULT_KEYBINDS)) keybinds[id] = DEFAULT_KEYBINDS[id].slice();
  saveKeybinds();
}

function assignKeys(action, first, second) {
  const moved = [];
  for (const [id, codes] of Object.entries(keybinds)) {
    if (id === action) continue;
    const kept = codes.map(c => (c && (c === first || c === second) ? null : c));
    if (kept.join() !== codes.join()) moved.push(BIND_ACTIONS.find(b => b.id === id).label);
    keybinds[id] = kept[0] ? kept : [kept[1], null];
  }
  keybinds[action] = [first, second];
  saveKeybinds();
  return moved;
}

function actionForCode(code) {
  for (const [id, codes] of Object.entries(keybinds)) if (codes.includes(code)) return id;
  return null;
}

const KEY_NAMES = {
  Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: 'BKSP', CapsLock: 'CAPS',
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', MetaLeft: 'L-META', MetaRight: 'R-META',
  Mouse0: 'L-CLICK', Mouse1: 'M-CLICK', Mouse2: 'R-CLICK', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5',
  Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Backquote: '`',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
};

function keyLabel(code) {
  if (!code) return '---';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  return code.toUpperCase();
}

const keys = { left: false, right: false, up: false, down: false, fire: false };
const clearKeys = () => Object.keys(keys).forEach(k => (keys[k] = false));

const mouse = { x: W / 2, y: H / 2, inside: false };

let capture = null;

function pressAction(action, repeat) {
  if (action === 'pause') {
    if (!repeat) pauseGame();
  } else if (action === 'fix') {
    if (!repeat) fixJam();
  } else if (action in keys) {
    keys[action] = true;
  }
}

const PAGE_KEYS = ['Space', 'Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', e => {
  Sound.init();

  if (capture) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') capture.cancel();
    else capture.assign(e.code);
    return;
  }

  const action = actionForCode(e.code);
  if (action || PAGE_KEYS.includes(e.code)) e.preventDefault();

  if (Menu.current) {
    Menu.handleKey(e);
    return;
  }
  if (mode === 'game') {
    if (e.code === 'Escape' && action !== 'pause') {
      if (!e.repeat) pauseGame();
      return;
    }
    if (action) pressAction(action, e.repeat);
  }
});

window.addEventListener('keyup', e => {
  const action = actionForCode(e.code);
  if (action in keys) keys[action] = false;
});

function updateMousePos(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * W;
  mouse.y = ((e.clientY - r.top) / r.height) * H;
}

canvas.addEventListener('mousemove', e => {
  updateMousePos(e);
  mouse.inside = true;
});
canvas.addEventListener('mouseleave', () => (mouse.inside = false));
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('mousedown', e => {
  Sound.init();
  const code = 'Mouse' + e.button;

  if (capture) {
    e.preventDefault();
    capture.assign(code);
    if (e.button === 0) window.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true });
    return;
  }

  if (mode === 'game' && !Menu.current && e.target === canvas) {
    updateMousePos(e);
    const action = actionForCode(code);
    if (action) pressAction(action, false);
  }
});

window.addEventListener('mouseup', e => {
  const action = actionForCode('Mouse' + e.button);
  if (action in keys) keys[action] = false;
});

function onFocusLost() {
  clearKeys();
  if (settings.autoPause && mode === 'game') pauseGame();
}
window.addEventListener('blur', onFocusLost);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onFocusLost();
});
