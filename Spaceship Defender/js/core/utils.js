'use strict';

/* =========================================================
   UTILS - shared constants and small helper functions.

   HOW THE SCRIPTS FIT TOGETHER
   ----------------------------
   The game uses plain <script> tags (not ES modules) so it works
   by simply double-clicking index.html - browsers block modules
   on file:// URLs. Every script shares one global scope, so the
   ORDER of the <script> tags in index.html matters:

     core/utils.js      <- this file (loaded first)
     core/config.js     settings, levels, shop items
     core/progress.js   save data + daily quests
     audio/sound.js     synthesized sound effects
     gfx/sprites.js     pre-drawn images of ships/meteors/planets
     gfx/space.js       scrolling background (nebula, stars, planets)
     game/entities.js   factories for game objects + particles
     game/game.js       game rules and the update step
     game/render.js     drawing the game world and HUD
     ui/menu.js         HTML menus, shop and quest screens
     input.js           keyboard handling
     main.js            boots everything and runs the game loop

   Files only DEFINE things at the top level; main.js is what
   actually starts the game once everything is loaded.
   ========================================================= */

// ---------- World size ----------
// The game is simulated in a fixed 960x720 "logical" space. The canvas
// is scaled up or down to fit the window (see resize() in main.js).
const W = 960;
const H = 720;
const TAU = Math.PI * 2;

// The point the mothership is supposed to stay on ("the course").
const COURSE_X = W / 2;
const COURSE_Y = H / 2 + 30;

// Sprites are pre-drawn at 2x resolution so they stay sharp on
// high-DPI screens when the canvas is scaled up.
const SS = 2;

// ---------- DOM handles ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- Math helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (n, len) => String(n).padStart(len, '0');

// Keep an angle between -PI and PI (so "turn toward" math picks the short way round).
const wrapAngle = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// ---------- Color helpers ----------
// All colors in the game are 6-digit hex strings like '#ff9a3d'.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// '#ff0000', 0.5  ->  'rgba(255,0,0,0.5)'
function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Lighten (amt > 0) or darken (amt < 0) a color. amt is 0..1.
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = c => Math.round(c + (target - c) * p);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// ---------- Canvas helpers ----------
// Create an off-screen canvas. Used to pre-draw sprites once and then
// copy them onto the main canvas every frame (much faster than redrawing).
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

// Trace a closed polygon from a list of [x, y] points.
function tracePath(g, points) {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

// ---------- Seeded random numbers ----------
// Daily quests must be the same for everyone on the same day, so they are
// generated from a random number generator seeded with the date string.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: tiny, fast seeded PRNG. Returns a function that gives 0..1.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Local storage ----------
// Wrapped in try/catch because storage can be blocked (private windows,
// school-managed browsers). The game still works, it just won't save.
const Store = {
  load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable - ignore */ }
  },
};
