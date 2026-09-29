'use strict';

/* =========================================================
   PROGRESS - everything that is saved between sessions:
   unlocked levels, high scores, credits, shop purchases and
   the daily quests. Saved in the browser's localStorage.
   ========================================================= */

const DEFAULT_PROGRESS = {
  unlocked: 1,          // highest mission level the player may pick
  highScore: 0,         // best score in mission mode
  infiniteBest: 0,      // best score in Infinite Voyage
  bestDistance: 0,      // furthest distance (light-years) in Infinite Voyage
  credits: 0,           // shop currency
  upgrades: {},         // { upgradeId: level }
  skins: ['standard'],  // paint jobs the player owns
  skin: 'standard',     // paint job currently equipped
  daily: null,          // today's quests (see ensureDaily)
};

const progress = Object.assign({}, DEFAULT_PROGRESS, Store.load('sd-progress', {}));

// Repair anything missing or broken in old/corrupted saves.
progress.unlocked = clamp(progress.unlocked | 0, 1, MAX_LEVEL);
if (!progress.upgrades || typeof progress.upgrades !== 'object') progress.upgrades = {};
if (!Array.isArray(progress.skins)) progress.skins = ['standard'];
if (!SKINS[progress.skin] || !progress.skins.includes(progress.skin)) progress.skin = 'standard';

// Saving on every meteor kill would be wasteful, so changes just mark the
// save as "dirty" and main.js writes it out every couple of seconds.
let progressDirty = false;
const markDirty = () => (progressDirty = true);

function saveProgress() {
  Store.save('sd-progress', progress);
  progressDirty = false;
}

function resetProgress() {
  const daily = progress.daily; // keep today's quests so they can't be re-rolled
  Object.assign(progress, JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), { daily });
  saveProgress();
}

// ---------- Upgrade effects ----------
const up = id => progress.upgrades[id] || 0;       // current level of an upgrade
const skin = () => SKINS[progress.skin];
const maxHits = () => BASE_HITS + up('hull');

// All the blaster numbers, with shop upgrades applied.
// HEAT: every shot adds heatPerShot. Heat drains at coolRate while firing and
// faster (coolRate + idleCool) once you stop. Reaching 100% = overheat, and you
// can't fire until it drops back to 30%. This is what stops endless spamming.
// JAM: each shot has a small chance to jam, higher when the blaster is hot.
// A jammed blaster won't fire until the player taps F jamTaps times.
function blasterStats() {
  const cool = up('cooling');
  return {
    cooldown: 0.2 * (1 - 0.12 * up('rapid')),
    heatPerShot: 0.11 * (1 - 0.15 * cool),
    coolRate: 0.25 * (1 + 0.25 * cool),
    idleCool: 0.35 * (1 + 0.25 * cool),
    jamChance: heat => (0.015 + 0.07 * heat * heat) * (1 - 0.3 * up('jamguard')),
    jamTaps: Math.max(1, 3 - up('jamguard')),
    twin: up('twin') > 0,
  };
}

// Mothership upgrade multipliers.
const motherStabMult = () => 1 - 0.2 * up('stabilizer');
const motherArmorMult = () => 1 - 0.12 * up('armor');

function addCredits(n) {
  progress.credits += n;
  if (game) game.creditsEarned += n;
  markDirty();
}

// =========================================================
// DAILY QUESTS
// Three quests are picked each day. The pick is seeded by the
// date, so everyone gets the same quests on the same day and
// reloading the page can't re-roll them. Progress is tracked
// through questEvent() calls sprinkled through the game code.
// =========================================================
const DAILY_BONUS = 250; // extra credits for finishing all three

// id      = the event name passed to questEvent()
// mode    = 'add' counts up; 'max' keeps the best single value (e.g. score in one game)
// targets = possible goals; reward[i] matches targets[i]
const QUEST_POOL = [
  { id: 'kill',     mode: 'add', text: n => `DESTROY ${n} METEORS`,             targets: [40, 60, 90],       reward: [100, 140, 200] },
  { id: 'magma',    mode: 'add', text: n => `DESTROY ${n} MAGMA METEORS`,       targets: [8, 12, 18],        reward: [120, 160, 220] },
  { id: 'iron',     mode: 'add', text: n => `DESTROY ${n} IRON METEORS`,        targets: [5, 8, 12],         reward: [140, 180, 240] },
  { id: 'comet',    mode: 'add', text: n => `DESTROY ${n} COMETS`,              targets: [3, 5, 8],          reward: [140, 180, 240] },
  { id: 'clear',    mode: 'add', text: n => `CLEAR ${n} MISSION LEVELS`,        targets: [2, 3, 5],          reward: [120, 180, 260] },
  { id: 'perfect',  mode: 'add', text: n => `CLEAR ${n} LEVEL${n > 1 ? 'S' : ''} WITHOUT THE MOTHERSHIP GETTING HIT`, targets: [1, 2, 3], reward: [150, 220, 300] },
  { id: 'score',    mode: 'max', text: n => `SCORE ${n} POINTS IN ONE GAME`,    targets: [3000, 6000, 10000], reward: [120, 180, 260] },
  { id: 'distance', mode: 'max', text: n => `TRAVEL ${n} LY IN INFINITE VOYAGE`, targets: [10, 25, 50],      reward: [120, 180, 260] },
  { id: 'jams',     mode: 'add', text: n => `CLEAR ${n} BLASTER JAMS`,          targets: [3, 5, 8],          reward: [100, 140, 180] },
  { id: 'buy',      mode: 'add', text: () => 'BUY SOMETHING IN THE HANGAR SHOP', targets: [1],              reward: [80] },
];
const QUEST_MAP = Object.fromEntries(QUEST_POOL.map(q => [q.id, q]));

// Today's date as 'YYYY-MM-DD' in the player's local time zone.
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

// Make sure progress.daily holds today's quests, generating new ones after midnight.
function ensureDaily() {
  const key = todayKey();
  if (progress.daily && progress.daily.date === key) return;

  const rng = mulberry32(hashString('spaceship-defender-' + key));
  const pool = QUEST_POOL.slice();
  const quests = [];
  while (quests.length < 3) {
    const def = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const tier = Math.floor(rng() * def.targets.length);
    quests.push({ id: def.id, target: def.targets[tier], reward: def.reward[tier], progress: 0, done: false });
  }
  progress.daily = { date: key, quests, bonusDone: false };
  saveProgress();
}

const questText = q => QUEST_MAP[q.id].text(q.target);

// Report that something quest-worthy happened, e.g. questEvent('kill').
// For 'max' quests pass the new value, e.g. questEvent('score', 4200).
function questEvent(id, amount = 1) {
  ensureDaily();
  const daily = progress.daily;
  for (const q of daily.quests) {
    if (q.id !== id || q.done) continue;
    q.progress = QUEST_MAP[id].mode === 'max' ? Math.max(q.progress, amount) : q.progress + amount;
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.done = true;
      addCredits(q.reward);
      toast(`QUEST COMPLETE! +${q.reward} CR`, questText(q));
      Sound.quest();
    }
    markDirty();
  }
  if (!daily.bonusDone && daily.quests.every(q => q.done)) {
    daily.bonusDone = true;
    addCredits(DAILY_BONUS);
    toast(`ALL DAILY QUESTS DONE! +${DAILY_BONUS} CR`, 'COME BACK TOMORROW FOR MORE');
  }
}

// "hh:mm:ss" until local midnight (when new quests appear).
function timeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  return `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}`;
}
