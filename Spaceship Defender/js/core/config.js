'use strict';

/* =========================================================
   CONFIG - all the tunable numbers and data tables.

   If you want to rebalance the game, this is the place:
   difficulty, level pacing, meteor stats, shop prices and
   ship paint jobs are all defined here.
   ========================================================= */

// ---------- HUD / menu color themes ----------
// These only change the interface colors (text, meters, menus).
// Ship colors come from SKINS below.
const HUD_THEMES = {
  cyan:  { label: 'CYAN',     fg: '#dff6ff', accent: '#4de1ff', warn: '#ffd84d', danger: '#ff4f5e' },
  white: { label: 'WHITE',    fg: '#eef2ff', accent: '#ffffff', warn: '#ffd84d', danger: '#ff4f5e' },
  green: { label: 'PHOSPHOR', fg: '#8dffb3', accent: '#39ff7a', warn: '#e8ff5a', danger: '#ff5a5a' },
  amber: { label: 'AMBER',    fg: '#ffd9a0', accent: '#ffb43c', warn: '#fff06a', danger: '#ff5a3c' },
};

// ---------- Difficulty ----------
// maxDev   = how far (px) the mothership may drift from its course before the game ends
// speed    = meteor speed multiplier
// impulse  = how hard meteors shove the mothership
// stabTime = seconds the mothership is "destabilized" (autopilot offline) after a hit
const DIFFICULTY = {
  easy:   { maxDev: 260, speed: 0.8, impulse: 0.75, stabTime: 1.6 },
  normal: { maxDev: 210, speed: 1.0, impulse: 1.0,  stabTime: 2.2 },
  hard:   { maxDev: 170, speed: 1.2, impulse: 1.2,  stabTime: 2.8 },
};

// ---------- Settings ----------
// Each setting lists its allowed values; the settings menus cycle through them.
// The rows that show these live in index.html (data-setting="...").
const onOff = v => (v ? 'ON' : 'OFF');
const CONTROL_LABELS = { classic: 'CLASSIC', direct: 'DIRECT', mouse: 'MOUSE AIM' };
const SETTINGS_DEF = {
  // Gameplay
  difficulty: { values: ['easy', 'normal', 'hard'], label: v => v.toUpperCase() },
  gameSpeed:  { values: [0.5, 0.75, 1], label: v => Math.round(v * 100) + '%' },
  autoFire:   { values: [false, true], label: onOff },
  autoPause:  { values: [true, false], label: onOff },
  guide:      { values: [true, false], label: onOff },
  arrows:     { values: [true, false], label: onOff },
  popups:     { values: [true, false], label: onOff },
  hints:      { values: [true, false], label: onOff },
  // Controls
  controls:   { values: ['classic', 'direct', 'mouse'], label: v => CONTROL_LABELS[v] },
  // Graphics
  quality:    { values: ['high', 'low'], label: v => v.toUpperCase() },
  theme:      { values: Object.keys(HUD_THEMES), label: v => HUD_THEMES[v].label },
  shake:      { values: [true, false], label: onOff },
  reduceFlash:{ values: [false, true], label: onOff },
  crt:        { values: [true, false], label: onOff },
  fps:        { values: [false, true], label: onOff },
  // Audio
  sound:      { values: [true, false], label: onOff },
  volume:     { values: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], label: v => v + '%' },
  alarm:      { values: [true, false], label: onOff },
  heartbeat:  { values: [true, false], label: onOff },
};

const DEFAULT_SETTINGS = {
  difficulty: 'normal', gameSpeed: 1, autoFire: false, autoPause: true, guide: true,
  arrows: true, popups: true, hints: true,
  controls: 'classic',
  quality: 'high', theme: 'cyan', shake: true, reduceFlash: false, crt: true, fps: false,
  sound: true, volume: 70, alarm: true, heartbeat: true,
};

// Load saved settings, and throw away any value that is no longer valid
// (for example a theme that was removed in an update).
const settings = Object.assign({}, DEFAULT_SETTINGS, Store.load('sd-settings', {}));
for (const key of Object.keys(SETTINGS_DEF)) {
  if (!SETTINGS_DEF[key].values.includes(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
}

const saveSettings = () => Store.save('sd-settings', settings);
const hud = () => HUD_THEMES[settings.theme];
// How far the mothership may drift. The WEAK HULL twist shrinks it.
const maxDev = () => DIFFICULTY[settings.difficulty].maxDev * ((game && game.cfg && game.cfg.fx.maxDevMult) || 1);
const highQuality = () => settings.quality === 'high';

// Blinking helper. Returns true/false in a steady rhythm so text and lights
// can flash - unless "Reduce Flashing" is on, then it just stays on.
const blink = rate => settings.reduceFlash || Math.floor(time * rate) % 2 === 0;

// Push the current settings out to the page (CSS colors, CRT overlay, volume).
function applySettings() {
  const th = hud();
  const root = document.documentElement.style;
  root.setProperty('--fg', th.fg);
  root.setProperty('--accent', th.accent);
  root.setProperty('--warn', th.warn);
  root.setProperty('--danger', th.danger);
  $('crt').classList.toggle('off', !settings.crt);
  Sound.applyVolume();
}

// ---------- Ship paint jobs (cosmetic, bought in the shop) ----------
const SKINS = {
  standard: { label: 'STANDARD',  cost: 0,    hull: '#dfe8f5', trim: '#4de1ff', cockpit: '#9ff3ff', engine: '#4dc3ff', bullet: '#7df9ff' },
  crimson:  { label: 'CRIMSON',   cost: 400,  hull: '#f2d0d0', trim: '#ff4d6a', cockpit: '#ffc2cc', engine: '#ff6a3d', bullet: '#ff7a7a' },
  stealth:  { label: 'STEALTH',   cost: 600,  hull: '#8a93a3', trim: '#3e4655', cockpit: '#b48cff', engine: '#9d6bff', bullet: '#c9a6ff' },
  gold:     { label: 'GOLD RUSH', cost: 800,  hull: '#fff1c2', trim: '#ffc93d', cockpit: '#fff7d6', engine: '#ffb13d', bullet: '#ffe27a' },
  neon:     { label: 'NEON',      cost: 1000, hull: '#e6fff3', trim: '#39ff9c', cockpit: '#ff5ad1', engine: '#ff5ad1', bullet: '#5dff9e' },
};

// ---------- Upgrades (bought in the shop) ----------
// costs[i] is the price of level i+1. The number of costs is the max level.
// What each upgrade actually does is applied in progress.js (blasterStats etc.)
const UPGRADES = [
  { id: 'hull',       label: 'HULL PLATING',    costs: [300, 700],      desc: '+1 DEFENDER HULL. TAKE ONE MORE HIT BEFORE GAME OVER.' },
  { id: 'rapid',      label: 'RAPID FIRE',      costs: [150, 300, 550], desc: 'BLASTER FIRES FASTER.' },
  { id: 'cooling',    label: 'HEAT SINKS',      costs: [150, 300, 550], desc: 'BLASTER HEATS UP SLOWER AND COOLS DOWN FASTER.' },
  { id: 'jamguard',   label: 'JAM GUARD',       costs: [200, 450],      desc: 'FEWER JAMS, AND FEWER F PRESSES TO CLEAR ONE.' },
  { id: 'twin',       label: 'TWIN BLASTERS',   costs: [900],           desc: 'FIRE TWO BOLTS AT ONCE (SAME HEAT).' },
  { id: 'engine',     label: 'ENGINE BOOST',    costs: [150, 350],      desc: 'MORE THRUST AND A HIGHER TOP SPEED.' },
  { id: 'stabilizer', label: 'MOTHER STABILIZERS', costs: [250, 500, 800], desc: 'MOTHERSHIP AUTOPILOT COMES BACK ONLINE SOONER AFTER A HIT.' },
  { id: 'armor',      label: 'MOTHER ARMOR',    costs: [250, 500, 800], desc: 'METEORS PUSH THE MOTHERSHIP OFF COURSE LESS.' },
];
const UPGRADE_MAP = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// =========================================================
// LEVELS & TWISTS
// Every mission level has one TWIST that changes how it plays.
// A twist is a bundle of "mods". Some change the spawn rules
// (applied in applyTwist below); others switch on special
// effects that game.js checks through game.cfg.fx:
//
//   Spawn rules                      Effects (game.cfg.fx.*)
//   speedMult    meteor speed x      heatMult    blaster heat x
//   totalMult    meteor count x      jamMult     jam chance x
//   intervalMult time between x      wind        sideways push strength
//   burst        meteors per spawn   dark        only see near your ships
//   spread       aim randomness      emp         {every, dur} blaster blackouts
//   sides        which screen edges  supply      seconds between supply crates
//   sizePool     sizes to pick from  blind       no course guide / radar arrows
//   sameSideBurst  whole burst from one side    zeroG     almost no drag
//   oppositePairs  pairs from opposite sides    maxDevMult  safe zone size x
//   magma/iron/cometChance  type odds           weave     course sways (px)
//   mineChance / giantChance / homingChance     well      gravity-well planet
//   splitCount   pieces per split                bhPull    black hole tugs meteors
// =========================================================
const MAX_LEVEL = 25;
const BASE_HITS = 3; // defender hits allowed before game over (hull upgrades add more)

const TWISTS = {
  none:      { label: 'OPEN SPACE',      tip: 'CLEAR SKIES - FOR NOW',                                     mods: {} },
  basic:     { label: 'BASIC TRAINING',  tip: 'ONLY PLAIN ROCKS - LEARN THE ROPES',                        mods: { magmaChance: 0, ironChance: 0, cometChance: 0 } },
  magma:     { label: 'MAGMA FIELD',     tip: 'RED-HOT MAGMA METEORS TAKE TWO HITS',                       mods: { magmaChance: 0.45 } },
  heat:      { label: 'HEAT WAVE',       tip: 'A NEARBY STAR HEATS YOUR BLASTER 60% FASTER',               mods: { heatMult: 1.6 } },
  iron:      { label: 'IRON RAIN',       tip: 'IRON METEORS TAKE EXTRA HITS AND PUSH HARDER',              mods: { ironChance: 0.4 } },
  headon:    { label: 'HEAD-ON',         tip: 'EVERY METEOR COMES FROM STRAIGHT AHEAD',                    mods: { sides: [0], spread: 0.45 } },
  comet:     { label: 'COMET STORM',     tip: 'COMETS ARE TINY AND VERY FAST',                             mods: { cometChance: 0.45 } },
  wind:      { label: 'SOLAR WIND',      tip: 'A SOLAR WIND PUSHES EVERYTHING SIDEWAYS - AND IT SHIFTS',   mods: { wind: 80 } },
  dark:      { label: 'DARK SECTOR',     tip: 'NO STARLIGHT - YOU CAN ONLY SEE NEAR YOUR SHIPS',           mods: { dark: true } },
  pairs:     { label: 'CROSSFIRE',       tip: 'METEORS ARRIVE IN PAIRS FROM OPPOSITE SIDES',               mods: { burst: 2, oppositePairs: true } },
  ion:       { label: 'ION STORM',       tip: 'STATIC EVERYWHERE - YOUR BLASTER JAMS 3X MORE OFTEN',       mods: { jamMult: 3 } },
  well:      { label: 'GRAVITY WELL',    tip: "A DENSE PLANET BENDS METEOR PATHS - DON'T CRASH INTO IT",   mods: { well: true } },
  splitters: { label: 'SPLITTERS',       tip: 'METEORS SHATTER INTO THREE PIECES INSTEAD OF TWO',          mods: { splitCount: 3, totalMult: 0.8 } },
  emp:       { label: 'EMP BURSTS',      tip: 'EMP BLASTS KNOCK YOUR BLASTER OFFLINE EVERY FEW SECONDS',   mods: { emp: { every: 11, dur: 2.2 } } },
  mines:     { label: 'MINEFIELD',       tip: "SHOOT MINES TO BLOW UP NEARBY METEORS - DON'T TOUCH THEM",  mods: { mineChance: 0.3 } },
  swift:     { label: 'SWIFT CURRENT',   tip: 'FEWER METEORS, BUT 40% FASTER',                             mods: { speedMult: 1.4, totalMult: 0.75 } },
  supply:    { label: 'SUPPLY RUN',      tip: 'SHOOT OR GRAB CRATES FOR REPAIRS, COOLANT AND CREDITS',     mods: { supply: 9 } },
  blind:     { label: 'SENSORS OFFLINE', tip: 'NO COURSE GUIDE AND NO RADAR ARROWS - TRUST YOUR EYES',     mods: { blind: true } },
  giants:    { label: 'GIANTS',          tip: 'HUGE METEORS - TOUGH TO CRACK AND EVEN TOUGHER TO STOP',    mods: { giantChance: 0.4, totalMult: 0.8 } },
  zerog:     { label: 'ZERO DRAG',       tip: 'YOUR SHIP BARELY SLOWS DOWN - YOU DRIFT FOREVER',           mods: { zeroG: true } },
  fragile:   { label: 'WEAK HULL',       tip: "THE MOTHERSHIP IS DAMAGED - ITS SAFE ZONE IS 30% SMALLER",  mods: { maxDevMult: 0.7 } },
  shower:    { label: 'METEOR SHOWER',   tip: 'CALM... THEN A SHOWER OF SMALL METEORS FROM ONE SIDE',      mods: { burst: 7, intervalMult: 3.2, sizePool: [1, 1, 2], sameSideBurst: true } },
  weave:     { label: 'COURSE CHANGE',   tip: 'THE MOTHERSHIP IS WEAVING THROUGH THE BELT - KEEP UP',      mods: { weave: 150 } },
  magnet:    { label: 'MAGNETIC',        tip: 'PURPLE MAGNETIC METEORS STEER TOWARD THE MOTHERSHIP',       mods: { homingChance: 0.35 } },
  gauntlet:  { label: 'THE GAUNTLET',    tip: 'EVERYTHING AT ONCE. GOOD LUCK',                             mods: { burst: 2, speedMult: 1.1, mineChance: 0.1, magmaChance: 0.25, ironChance: 0.2, cometChance: 0.2, homingChance: 0.1 } },
  horizon:   { label: 'EVENT HORIZON',   tip: 'A BLACK HOLE LIES AHEAD - ITS GRAVITY PULLS ON THE METEORS', mods: { bhPull: 45 } },
};

// The 25 mission levels. Base difficulty ramps up with the level number;
// the twist makes each one different.
const LEVELS = [
  { name: 'FIRST CONTACT', twist: 'basic' },
  { name: 'EMBER DRIFT',   twist: 'magma' },
  { name: 'SUNSIDE',       twist: 'heat' },
  { name: 'IRON RAIN',     twist: 'iron' },
  { name: 'NARROW PASS',   twist: 'headon' },
  { name: 'COMET TAIL',    twist: 'comet' },
  { name: 'SOLAR GALE',    twist: 'wind' },
  { name: 'THE VOID',      twist: 'dark' },
  { name: 'CROSSFIRE',     twist: 'pairs' },
  { name: 'STATIC FIELD',  twist: 'ion' },
  { name: 'HEAVY WORLD',   twist: 'well' },
  { name: 'SHATTER BELT',  twist: 'splitters' },
  { name: 'PULSE ZONE',    twist: 'emp' },
  { name: 'MINEFIELD',     twist: 'mines' },
  { name: 'RAPIDS',        twist: 'swift' },
  { name: 'SUPPLY LINE',   twist: 'supply' },
  { name: 'GHOST RUN',     twist: 'blind' },
  { name: 'TITANS',        twist: 'giants' },
  { name: 'ICE SLIDE',     twist: 'zerog' },
  { name: 'LIMPING HOME',  twist: 'fragile' },
  { name: 'STARFALL',      twist: 'shower' },
  { name: 'SLALOM',        twist: 'weave' },
  { name: 'LODESTONE',     twist: 'magnet' },
  { name: 'THE GAUNTLET',  twist: 'gauntlet' },
  { name: 'EVENT HORIZON', twist: 'horizon' },
];

// Twists that Infinite Voyage can roll for each new sector.
const INFINITE_TWISTS = ['wind', 'dark', 'ion', 'splitters', 'emp', 'mines', 'supply', 'giants',
  'zerog', 'shower', 'magnet', 'heat', 'comet', 'magma', 'iron', 'pairs', 'weave'];

// Apply a twist's mods on top of a base config.
function applyTwist(cfg, key) {
  const tw = TWISTS[key] || TWISTS.none;
  const m = tw.mods;
  cfg.twistKey = key;
  cfg.twist = tw;
  cfg.fx = m; // effects are read straight from here by game.js
  cfg.speed *= m.speedMult || 1;
  if (cfg.total !== Infinity) cfg.total = Math.round(cfg.total * (m.totalMult || 1));
  cfg.interval *= m.intervalMult || 1;
  if (m.burst) cfg.burst = Math.max(cfg.burst, m.burst);
  if (m.spread !== undefined) cfg.spread = m.spread;
  for (const k of ['magmaChance', 'ironChance', 'cometChance']) if (m[k] !== undefined) cfg[k] = m[k];
  cfg.mineChance = m.mineChance || 0;
  cfg.giantChance = m.giantChance || 0;
  cfg.homingChance = m.homingChance || 0;
  cfg.splitCount = m.splitCount || 2;
  cfg.sides = m.sides || [0, 1, 2, 3];      // 0 top, 1 right, 2 bottom, 3 left
  cfg.sizePool = m.sizePool || [3, 2];
  cfg.sameSideBurst = !!m.sameSideBurst;
  cfg.oppositePairs = !!m.oppositePairs;
  cfg.maxOnScreen = Math.max(cfg.maxOnScreen, cfg.burst + 4);
  return cfg;
}

// Build the spawn rules for a mission level. Everything ramps up with n.
function levelConfig(n) {
  const info = LEVELS[n - 1];
  const cfg = {
    name: info.name,
    total: 6 + Math.round(n * 1.4),                  // meteors spawned this wave
    interval: Math.max(1.0, 3.0 - n * 0.08),         // seconds between spawns
    burst: n >= 12 ? 2 : 1,                          // meteors per spawn
    speed: 40 + n * 3.2,                             // base meteor speed (px/s)
    spread: Math.max(0.1, 0.26 - n * 0.006),         // aim randomness in radians (lower = more accurate)
    magmaChance: n >= 2 ? Math.min(0.3, 0.15 + (n - 2) * 0.01) : 0,
    ironChance: n >= 4 ? Math.min(0.25, 0.1 + (n - 4) * 0.01) : 0,
    cometChance: n >= 6 ? Math.min(0.2, 0.08 + (n - 6) * 0.008) : 0,
    maxOnScreen: 8 + n,                              // don't spawn more while this many are alive
  };
  return applyTwist(cfg, info.twist);
}

// Spawn rules for Infinite Voyage. t = seconds survived; it keeps getting harder.
function infiniteConfig(t, twistKey = 'none') {
  const k = t / 60; // minutes survived
  const cfg = {
    name: 'INFINITE VOYAGE',
    total: Infinity,
    interval: Math.max(0.7, 2.8 - k * 0.45),
    burst: k > 6 ? 3 : k > 2.5 ? 2 : 1,
    speed: Math.min(130, 45 + k * 12),
    spread: Math.max(0.1, 0.26 - k * 0.03),
    magmaChance: Math.min(0.25, 0.08 + k * 0.04),
    ironChance: k > 1.5 ? Math.min(0.25, 0.05 + k * 0.03) : 0,
    cometChance: k > 3 ? Math.min(0.25, 0.05 + k * 0.03) : 0,
    maxOnScreen: Math.min(40, 10 + k * 4),
  };
  return applyTwist(cfg, twistKey);
}

// Seconds per sector in Infinite Voyage (each sector gives a bonus, new scenery and a new twist).
const SECTOR_TIME = 45;

// ---------- Meteors ----------
// Sizes: 4 = giant, 3 = large, 2 = medium, 1 = small. Bigger ones split into smaller ones.
const METEOR_RADIUS = { 4: 62, 3: 40, 2: 23, 1: 12 };
// How hard each size shoves the mothership.
const METEOR_MASS = { 4: 1.6, 3: 1.0, 2: 0.55, 1: 0.3 };

// Points for destroying each type/size. Mines and crates are special objects
// that live in the meteor list (see entities.js).
const SCORE = {
  rock:  { 4: 10, 3: 20, 2: 50, 1: 100 },
  magma: { 4: 30, 3: 40, 2: 90, 1: 160 },
  iron:  { 4: 50, 3: 60, 2: 120, 1: 200 },
  comet: { 1: 150 },
  mine:  { 1: 50 },
  crate: { 1: 0 },
};

// Shop credits for destroying each type.
const CREDIT = { rock: 1, magma: 2, iron: 3, comet: 3, mine: 2, crate: 0 };

// Art colors for each meteor type (used when pre-drawing sprites and for explosions).
const METEOR_STYLE = {
  rock:  { light: '#b3a594', base: '#6f655b', dark: '#241f1b', edge: '#d8cab8' },
  magma: { light: '#8a4a36', base: '#4a2019', dark: '#140605', edge: '#ff8a4a', vein: '#ff6a1a', crack: '#ffb13d' },
  iron:  { light: '#dbe6f5', base: '#6d7d92', dark: '#1b222c', edge: '#e8f0fa', crack: '#cfe6ff' },
  comet: { light: '#ffffff', base: '#9adfff', dark: '#2d6f9c', edge: '#e6fbff', vein: '#6fdcff' },
  mine:  { edge: '#ff4f5e', crack: '#ff4f5e' },
  crate: { edge: '#5dff9e', crack: '#5dff9e' },
};

// Mines: how far their explosion reaches (px).
const MINE_BLAST = 120;
