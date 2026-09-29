'use strict';

/* =========================================================
   INPUT - keyboard and mouse.

   Keys are stored as KeyboardEvent.code values ('KeyA',
   'ArrowLeft', 'Space', ...). Mouse buttons use the made-up
   codes 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right)
   so they can be rebound exactly like keys.

   `keys` holds which HELD actions are currently down
   (movement + fire). One-shot actions (fix jam, pause) run
   immediately when pressed.
   ========================================================= */

// Actions the player can rebind, in the order shown in the menu.
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
  fire:  ['Space', 'Mouse0'],   // left-click fires by default
  fix:   ['KeyF', null],
  pause: ['KeyP', 'Escape'],
};

// Load saved keybinds, falling back to defaults for anything missing/broken.
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

// Give an action new keys. If another action was using one of them, it loses it.
// Returns the labels of actions that lost a key, so the menu can warn the player.
function assignKeys(action, first, second) {
  const moved = [];
  for (const [id, codes] of Object.entries(keybinds)) {
    if (id === action) continue;
    const kept = codes.map(c => (c && (c === first || c === second) ? null : c));
    if (kept.join() !== codes.join()) moved.push(BIND_ACTIONS.find(b => b.id === id).label);
    // Keep the remaining key in the first slot
    keybinds[id] = kept[0] ? kept : [kept[1], null];
  }
  keybinds[action] = [first, second];
  saveKeybinds();
  return moved;
}

// Which action (if any) is bound to this key code?
function actionForCode(code) {
  for (const [id, codes] of Object.entries(keybinds)) if (codes.includes(code)) return id;
  return null;
}

// Human-readable key names for the HUD and menus.
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

// ---------- Live input state ----------
const keys = { left: false, right: false, up: false, down: false, fire: false };
const clearKeys = () => Object.keys(keys).forEach(k => (keys[k] = false));

// Mouse position in game coordinates (0..W, 0..H), used by MOUSE AIM.
const mouse = { x: W / 2, y: H / 2, inside: false };

// While rebinding, the next key/button press goes to this object instead of the game.
// Set by startBind() in menu.js: { assign(code), cancel() }
let capture = null;

// Run the action bound to a key/button being pressed during play.
function pressAction(action, repeat) {
  if (action === 'pause') {
    if (!repeat) pauseGame();
  } else if (action === 'fix') {
    if (!repeat) fixJam();
  } else if (action in keys) {
    keys[action] = true;
  }
}

// ---------- Keyboard ----------
const PAGE_KEYS = ['Space', 'Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', e => {
  Sound.init(); // browsers only allow audio after a user gesture

  if (capture) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') capture.cancel();
    else capture.assign(e.code);
    return;
  }

  const action = actionForCode(e.code);
  if (action || PAGE_KEYS.includes(e.code)) e.preventDefault(); // stop the page scrolling

  if (Menu.current) {
    Menu.handleKey(e);
    return;
  }
  if (mode === 'game') {
    // ESC always pauses, even if the player rebound PAUSE to something else
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

// ---------- Mouse ----------
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
canvas.addEventListener('contextmenu', e => e.preventDefault()); // right-click can be bound

window.addEventListener('mousedown', e => {
  Sound.init();
  const code = 'Mouse' + e.button;

  if (capture) {
    e.preventDefault();
    capture.assign(code);
    // A left press is followed by a 'click' event - swallow it so it doesn't
    // also press whatever menu row is under the cursor
    if (e.button === 0) window.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true });
    return;
  }

  // Menus handle their own clicks; in-game clicks land on the canvas
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

// ---------- Losing focus ----------
// Releasing all keys avoids "stuck" movement when the window loses focus.
function onFocusLost() {
  clearKeys();
  if (settings.autoPause && mode === 'game') pauseGame();
}
window.addEventListener('blur', onFocusLost);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onFocusLost();
});
