'use strict';

/* =========================================================
   GAME - the rules of the game and the per-frame update.

   MODES (what the whole app is doing)
     'attract' - main menu, with a demo scene behind it
     'game'    - playing
     'paused'  - pause menu open, everything frozen
     'over'    - game over / victory screen

   PHASES (what the current level is doing, inside 'game')
     'intro'     - level name banner, no meteors yet
     'play'      - meteors spawning
     'clear'     - wave beaten, bonus tally
     'blackhole' - final level (40) black hole cinematic
     'done'      - finished (victory screen showing)
   ========================================================= */

let mode = 'attract';
let game = null;   // everything about the current run (see newGame)
let time = 0;      // seconds since the page loaded (used for animations)

// ---------- Starting, pausing, quitting ----------

// Start a fresh run. Either a mission level or Infinite Voyage.
function newGame({ level = 1, infinite = false } = {}) {
  Menu.hide();
  Menu.clearStack();
  clearKeys();
  ensureDaily();
  mode = 'game';
  game = {
    infinite,
    level: infinite ? 1 : level,
    score: 0,
    lives: maxHits(),
    player: null,
    creditsEarned: 0,
    distance: 0,       // light-years traveled (Infinite Voyage)
    lastLy: 0,
    sector: 1,         // Infinite Voyage sector
    sectorTwist: 'none', // Infinite Voyage: the current sector's twist
  };
  startLevel(game.level);
}

// Reset everything that belongs to a single level/wave.
function startLevel(n) {
  const g = game;
  g.level = n;
  g.cfg = g.infinite ? infiniteConfig(0, g.sectorTwist) : levelConfig(n);
  g.levelStart = { score: g.score, lives: g.lives };
  g.meteors = [];
  g.bullets = [];
  particles = [];
  floaters = [];
  g.spawned = 0;
  g.spawnTimer = 0;
  g.phase = 'intro';
  g.phaseTimer = 3;
  g.playTime = 0;
  g.mother = newMother();
  g.motherHits = 0;
  g.devSum = 0;      // used to work out the average course deviation for the bonus
  g.devTime = 0;
  g.beatTimer = 0;
  g.beatHigh = false;
  g.alarmTimer = 0;
  g.ending = null;   // set when the game is about to end: { reason, t }
  g.shake = 0;
  g.flash = 0;       // white screen flash 0..1
  g.bonus = null;
  g.sectorBanner = 0;
  g.blackHole = !g.infinite && n === MAX_LEVEL ? makeBlackHole() : null;
  if (!g.player || !g.player.alive) g.player = newPlayer();
  g.courseX = COURSE_X; // the point the mothership steers for (moves with the COURSE CHANGE twist)
  g.courseY = COURSE_Y;
  g.courseVx = 0;
  g.courseVy = 0;
  rechargeShields();
  initTwistState();

  // New scenery for each level (the final level gets the black-hole palette)
  setNebula(g.infinite ? 0 : n === MAX_LEVEL ? 5 : (n - 1) % 5);
  space.speed = 1;
  Sound.levelStart();
}

// DEFLECTOR SHIELD and MOTHER SHIELD upgrades recharge every level / sector.
function rechargeShields() {
  game.shield = up('shield');
  game.motherShield = up('mshield');
}

// "RESTART" in the pause menu: replay the current level from its start.
function restartGame() {
  if (game.infinite) {
    newGame({ infinite: true });
    return;
  }
  Menu.hide();
  clearKeys();
  mode = 'game';
  game.score = game.levelStart.score;
  game.lives = game.levelStart.lives;
  game.player = null;
  startLevel(game.level);
}

function pauseGame() {
  if (mode !== 'game') return;
  mode = 'paused';
  clearKeys();
  Sound.setThrust(false);
  Menu.show('menu-pause');
}

function resumeGame() {
  Menu.hide();
  Menu.clearStack();
  clearKeys();
  mode = 'game';
}

function goMainMenu() {
  if (game) {
    if (game.infinite) progress.infiniteBest = Math.max(progress.infiniteBest, game.score);
    else progress.highScore = Math.max(progress.highScore, game.score);
    saveProgress();
  }
  game = null;
  mode = 'attract';
  particles = [];
  floaters = [];
  space.speed = 1;
  clearKeys();
  Sound.setThrust(false);
  initAttract();
  Menu.clearStack();
  Menu.show('menu-main');
}

function addScore(n, x, y) {
  game.score += n;
  if (x !== undefined) addFloater(`+${n}`, x, y, hud().fg);
}

function addShake(amount) {
  game.shake = Math.min(24, game.shake + amount);
}

// =========================================================
// MAIN UPDATE - called once per frame while playing
// =========================================================
function updateGame(dt) {
  const g = game;
  g.flash = Math.max(0, g.flash - dt * 1.5);

  switch (g.phase) {
    case 'intro':
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) {
        g.phase = 'play';
        g.spawnTimer = 0.4;
      }
      break;
    case 'play':
      g.playTime += dt;
      if (g.infinite) updateInfinite(dt);
      updateSpawning(dt);
      break;
    case 'clear':
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) nextLevel();
      break;
    case 'blackhole':
      updateFinale(dt);
      break;
  }
  if (mode !== 'game') return; // the phase logic may have ended the game

  if (g.phase !== 'blackhole') updateTwists(dt);
  updatePlayer(dt);
  if (g.phase !== 'blackhole') updateMother(dt);
  updateBullets(dt);
  updateMeteors(dt);
  updateParticles(dt);
  updateFloaters(dt);
  if (g.blackHole) updateBlackHole(dt);
  if (g.phase !== 'blackhole') handleCollisions();
  updateAudioCues(dt);
  g.shake *= Math.exp(-7 * dt);

  if (g.ending) {
    g.ending.t -= dt;
    if (g.ending.t <= 0) showGameOver();
  }
}

// After the game ends, keep the wreckage drifting behind the menu.
function updateAfterlife(dt) {
  if (!game) return;
  game.flash = Math.max(0, game.flash - dt * 0.6);
  if (game.phase !== 'done') updateMother(dt);
  updateMeteors(dt);
  updateBullets(dt);
  updateParticles(dt);
  updateFloaters(dt);
  if (game.blackHole) updateBlackHole(dt);
  game.meteors = game.meteors.filter(m => !m.dead);
  game.shake *= Math.exp(-7 * dt);
}

// =========================================================
// DEFENDER
// =========================================================
function turnToward(a, target, maxStep) {
  return a + clamp(wrapAngle(target - a), -maxStep, maxStep);
}

function updatePlayer(dt) {
  const g = game;
  const p = g.player;
  const finale = g.phase === 'blackhole';
  if (p.captured) return;
  if (!p.alive) {
    if (!g.ending && !finale) {
      p.respawn -= dt;
      if (p.respawn <= 0) respawnPlayer();
    }
    return;
  }

  const on = !g.ending; // controls lock once the game is ending
  let L = on && keys.left, R = on && keys.right;
  const U = on && keys.up, D = on && keys.down;
  if (g.cfg.fx.mirror) [L, R] = [R, L]; // MIRROR DRIVE twist: steering is crossed
  const engine = 1 + 0.15 * up('engine');
  const zeroG = !!g.cfg.fx.zeroG; // ZERO DRAG twist: the ship barely slows down
  p.thrusting = false;

  if (settings.controls === 'classic') {
    // Asteroids-style: rotate, thrust forward, brake
    if (L) p.a -= 4.4 * dt;
    if (R) p.a += 4.4 * dt;
    if (U) {
      p.vx += Math.cos(p.a) * 420 * engine * dt;
      p.vy += Math.sin(p.a) * 420 * engine * dt;
      p.thrusting = true;
    }
    const drag = Math.exp(-(D ? 3.2 : zeroG ? 0.04 : 0.45) * dt);
    p.vx *= drag;
    p.vy *= drag;
  } else {
    // DIRECT and MOUSE AIM: the movement keys push the ship in screen directions
    let ix = (R ? 1 : 0) - (L ? 1 : 0);
    let iy = (D ? 1 : 0) - (U ? 1 : 0);
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      ix /= len;
      iy /= len;
      const accel = zeroG ? 650 : 1100;
      p.vx += ix * accel * engine * dt;
      p.vy += iy * accel * engine * dt;
      p.thrusting = true;
      // DIRECT: the ship faces the way it moves
      if (settings.controls === 'direct') p.a = turnToward(p.a, Math.atan2(iy, ix), 11 * dt);
    }
    const drag = Math.exp(-(zeroG ? 0.35 : 2.8) * dt);
    p.vx *= drag;
    p.vy *= drag;
    // MOUSE AIM: the ship always faces the cursor
    if (settings.controls === 'mouse' && on) {
      p.a = turnToward(p.a, Math.atan2(mouse.y - p.y, mouse.x - p.x), 16 * dt);
    }
  }

  // Speed limit + screen wrap (both off while falling into the black hole)
  if (!finale) {
    const speed = Math.hypot(p.vx, p.vy);
    const maxSpeed = (settings.controls === 'classic' ? 380 : 340) * (1 + 0.08 * up('engine'));
    if (speed > maxSpeed) {
      p.vx *= maxSpeed / speed;
      p.vy *= maxSpeed / speed;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (!finale) {
    if (p.x < -15) p.x = W + 15;
    if (p.x > W + 15) p.x = -15;
    if (p.y < -15) p.y = H + 15;
    if (p.y > H + 15) p.y = -15;
  }

  // Blaster heat: cools slowly while firing, faster once you stop
  const b = blasterStats();
  p.lastShot += dt;
  const cool = (p.lastShot > 0.3 ? b.coolRate + b.idleCool : b.coolRate) * (g.cfg.fx.coolMult || 1); // COOLANT LEAK twist
  p.heat = Math.max(0, p.heat - cool * dt);
  if (p.overheated && p.heat <= 0.3) p.overheated = false;

  // Sparks fly off a jammed blaster
  if (p.jammed && Math.random() < 0.15) burst(p.x + Math.cos(p.a) * 14, p.y + Math.sin(p.a) * 14, 1, '#ffb13d', 60, 0.3, 3);

  p.invuln = Math.max(0, p.invuln - dt);
  p.cooldown -= dt;

  // AUTO FIRE (setting) keeps shooting while the blaster is below 80% heat
  const autoFire = settings.autoFire && p.heat < 0.8 && !p.jammed && !p.overheated;
  if (on && !finale && (keys.fire || autoFire)) tryFire();
}

function tryFire() {
  const p = game.player;
  if (p.cooldown > 0) return;
  if (p.jammed) {
    // Pulling the trigger on a jammed blaster just clicks
    Sound.dryFire();
    p.cooldown = 0.3;
    return;
  }
  if (game.emp && game.emp.active > 0) return; // EMP twist: blaster offline
  if (p.overheated || game.bullets.length >= 12) return;
  fire();
}

function fire() {
  const p = game.player;
  const b = blasterStats();
  const fx = game.cfg.fx;
  const c = Math.cos(p.a), s = Math.sin(p.a);
  // Twin blasters fire two bolts side by side
  const offsets = b.twin ? [-5, 5] : [0];
  for (const o of offsets) {
    game.bullets.push({
      x: p.x + c * 16 - s * o, y: p.y + s * 16 + c * o,
      vx: c * b.boltSpeed + p.vx * 0.5, vy: s * b.boltSpeed + p.vy * 0.5,
      life: b.boltLife * (fx.rangeMult || 1), // SHORT RANGE twist
      pierce: b.pierce,  // PIERCING BOLTS: meteors it can still smash through
      lastHit: null,
      dead: false,
    });
  }
  p.cooldown = b.cooldown;
  p.lastShot = 0;
  p.heat += b.heatPerShot * (fx.heatMult || 1); // HEAT WAVE twist
  Sound.shoot();

  if (p.heat >= 1) {
    p.heat = 1;
    p.overheated = true;
    Sound.overheat();
    addFloater('OVERHEAT!', p.x, p.y - 24, hud().danger, 10);
  } else if (Math.random() < b.jamChance(p.heat) * (fx.jamMult || 1)) { // ION STORM twist
    p.jammed = true;
    p.jamLeft = b.jamTaps;
    Sound.jam();
    addFloater('JAMMED!', p.x, p.y - 24, hud().danger, 10);
  }
}

// Called when the player presses the FIX JAM key.
function fixJam() {
  const p = game && game.player;
  if (mode !== 'game' || !p || !p.alive || !p.jammed) return;
  p.jamLeft--;
  Sound.fixTap();
  burst(p.x, p.y, 4, '#ffd84d', 80, 0.3, 3);
  if (p.jamLeft <= 0) {
    p.jammed = false;
    p.cooldown = 0.1;
    Sound.unjam();
    addFloater('FIXED!', p.x, p.y - 24, hud().accent, 10);
    questEvent('jams');
  }
}

function respawnPlayer() {
  const mo = game.mother;
  const p = newPlayer();
  p.x = mo.x;
  p.y = mo.y + 110;
  p.invuln = 2.5;
  game.player = p;
}

function hitPlayer() {
  const g = game;
  const p = g.player;
  // DEFLECTOR SHIELD: soak up the hit instead
  if (g.shield > 0) {
    g.shield--;
    p.invuln = 1.5;
    shockwave(p.x, p.y, 60, skin().trim, 0.5);
    burst(p.x, p.y, 16, skin().trim, 140, 0.5, 4);
    addShake(6);
    addFloater(g.shield ? `SHIELD! ${g.shield} LEFT` : 'SHIELD DOWN!', p.x, p.y - 24, skin().trim, 10);
    Sound.clink();
    return;
  }
  p.alive = false;
  p.respawn = 1.6;
  g.lives--;
  explode(p.x, p.y, 3, skin().trim);
  debris(p.x, p.y, 8, skin().hull, 120);
  addShake(14);
  g.flash = Math.max(g.flash, 0.25);
  Sound.playerHit();
  Sound.setThrust(false);
  if (g.lives <= 0) triggerEnd('defender');
}

// =========================================================
// MOTHERSHIP
// When hit, the mothership is DESTABILIZED: it drifts and spins
// with its autopilot offline. When the timer runs out, the
// autopilot acts like a spring pulling it back to the course
// point. Drift past maxDev() and the game is over.
// =========================================================
function updateMother(dt) {
  const g = game;
  const mo = g.mother;
  mo.x += mo.vx * dt;
  mo.y += mo.vy * dt;
  mo.a += mo.va * dt;

  if (mo.destab > 0) {
    mo.destab -= dt;
    const f = Math.exp(-0.7 * dt);
    mo.vx *= f;
    mo.vy *= f;
    mo.va *= Math.exp(-0.5 * dt);
    // Sparks and smoke while damaged
    if (Math.random() < 0.3) {
      const a = rand(0, TAU);
      burst(mo.x + Math.cos(a) * 20, mo.y + Math.sin(a) * 20, 1, '#ffb13d', 80, 0.5, 3);
    }
    if (Math.random() < 0.08) smoke(mo.x + rand(-15, 15), mo.y + rand(-20, 20), 1, 10);
  } else {
    // Autopilot: a damped spring back toward the course point, and straighten out.
    // The damping uses velocity RELATIVE to the course point, so when the course
    // itself moves (COURSE CHANGE twist) the ship keeps pace instead of lagging.
    mo.a = wrapAngle(mo.a);
    mo.vx += (-(mo.x - g.courseX) * 2.0 - (mo.vx - g.courseVx) * 2.6) * dt;
    mo.vy += (-(mo.y - g.courseY) * 2.0 - (mo.vy - g.courseVy) * 2.6) * dt;
    mo.va += (-mo.a * 6 - mo.va * 4.5) * dt;
  }

  mo.flash = Math.max(0, mo.flash - dt);
  mo.dev = Math.hypot(mo.x - g.courseX, mo.y - g.courseY);

  // Track average deviation for the end-of-level course bonus
  if (g.phase === 'play' && !g.ending) {
    g.devSum += (mo.dev / maxDev()) * dt;
    g.devTime += dt;
  }
  if (!g.ending && mo.dev > maxDev()) triggerEnd('course');
}

function impactMother(m) {
  const g = game;
  const mo = g.mother;
  const diff = DIFFICULTY[settings.difficulty];

  // MOTHER SHIELD: the barrier destroys the meteor before it can push the ship
  if (g.motherShield > 0) {
    g.motherShield--;
    m.dead = true;
    explode(m.x, m.y, Math.min(m.size, 3), METEOR_STYLE[m.type].edge);
    shockwave(mo.x, mo.y, 80, '#6fdcff', 0.5);
    addFloater(g.motherShield ? `BARRIER! ${g.motherShield} LEFT` : 'BARRIER DOWN!', mo.x, mo.y - 50, '#6fdcff', 10);
    Sound.clink();
    return;
  }

  const typeMult = { iron: 1.6, comet: 1.4, magma: 1.2, mine: 4 }[m.type] || 1; // a mine blast shoves hard
  const mass = METEOR_MASS[m.size] * typeMult;

  // Push mostly along the meteor's travel direction, partly away from the impact point
  let dx = mo.x - m.x, dy = mo.y - m.y;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const sp = Math.hypot(m.vx, m.vy) || 1;
  let px = (m.vx / sp) * 0.6 + dx * 0.4;
  let py = (m.vy / sp) * 0.6 + dy * 0.4;
  const pl = Math.hypot(px, py) || 1;
  px /= pl;
  py /= pl;

  const impulse = 75 * mass * diff.impulse * motherArmorMult();
  mo.vx += px * impulse;
  mo.vy += py * impulse;
  mo.va = clamp(mo.va + (Math.random() < 0.5 ? -1 : 1) * (0.6 + mass), -3, 3);
  mo.destab = Math.max(mo.destab, diff.stabTime * motherStabMult());
  mo.flash = 0.4;
  g.motherHits++;

  m.dead = true;
  const cx = (m.x + mo.x) / 2, cy = (m.y + mo.y) / 2;
  explode(cx, cy, m.size, METEOR_STYLE[m.type].edge);
  burst(cx, cy, 8, hud().danger, 120, 0.6);
  addShake(6 + mass * 10);
  Sound.motherHit();
}

// =========================================================
// METEORS, MINES, CRATES & BULLETS
// =========================================================

// A point just off the given screen edge (0 top, 1 right, 2 bottom, 3 left).
function edgePoint(side, margin = 60) {
  if (side === 0) return [rand(0, W), -margin];
  if (side === 1) return [W + margin, rand(0, H)];
  if (side === 2) return [rand(0, W), H + margin];
  return [-margin, rand(0, H)];
}

function spawnMeteor(side = pick(game.cfg.sides)) {
  const g = game;
  const cfg = g.cfg;
  const mo = g.mother;
  const diff = DIFFICULTY[settings.difficulty];
  const [x, y] = edgePoint(side);
  g.spawned++;

  // MINEFIELD: mines drift slowly across the screen toward a random spot
  if (Math.random() < cfg.mineChance) {
    const a = Math.atan2(rand(H * 0.2, H * 0.8) - y, rand(W * 0.2, W * 0.8) - x);
    const s = rand(30, 45);
    g.meteors.push(makeMine(x, y, Math.cos(a) * s, Math.sin(a) * s));
    return;
  }

  // Pick a type based on the level's chances
  let type = 'rock';
  let size = pick(cfg.sizePool);
  let speed = cfg.speed * diff.speed * rand(0.8, 1.2);
  const roll = Math.random();
  if (roll < cfg.ironChance) type = 'iron';
  else if (roll < cfg.ironChance + cfg.cometChance) {
    type = 'comet';
    size = 1;
    speed *= 2.3;
  } else if (roll < cfg.ironChance + cfg.cometChance + cfg.magmaChance) type = 'magma';

  // GIANTS: some become huge, slow meteors
  if (type !== 'comet' && Math.random() < cfg.giantChance) {
    size = 4;
    speed *= 0.7;
  }

  // Aim at the mothership, with some randomness so not every meteor hits
  const aim = Math.atan2(mo.y - y, mo.x - x) + rand(-cfg.spread, cfg.spread);
  const m = makeMeteor(x, y, Math.cos(aim) * speed, Math.sin(aim) * speed, size, type, cfg.fx.hpBonus || 0);
  // MAGNETIC: this one will steer toward the mothership
  if (type !== 'comet' && Math.random() < cfg.homingChance) m.homing = true;
  g.meteors.push(m);
}

// SUPPLY RUN: a crate floats across the screen from the left or right.
function spawnCrate() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -30 : W + 30;
  game.meteors.push(makeCrate(x, rand(140, H - 140), (fromLeft ? 1 : -1) * rand(50, 70), rand(-15, 15)));
}

function updateSpawning(dt) {
  const g = game;
  const cfg = g.cfg;
  if (g.spawned < cfg.total) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0 && g.meteors.length < cfg.maxOnScreen) {
      const count = Math.min(cfg.burst, cfg.total - g.spawned);
      const first = pick(cfg.sides);
      for (let i = 0; i < count; i++) {
        // METEOR SHOWER: whole burst from one side. CROSSFIRE: alternate opposite sides.
        let side = pick(cfg.sides);
        if (cfg.sameSideBurst) side = first;
        else if (cfg.oppositePairs) side = i % 2 ? (first + 2) % 4 : first;
        spawnMeteor(side);
      }
      g.spawnTimer = cfg.interval * rand(0.75, 1.25);
    }
  } else if (g.meteors.every(m => m.harmless) && !g.ending) {
    // Only mines/crates left: they fizzle out and the level is clear
    for (const m of g.meteors) burst(m.x, m.y, 6, METEOR_STYLE[m.type].edge, 60, 0.4, 3);
    g.meteors = [];
    levelClear();
  }
}

function updateMeteors(dt) {
  const g = game;
  const finale = g.phase === 'blackhole';
  const accel = !finale && g.cfg.fx.accel;
  for (const m of g.meteors) {
    // ACCELERATION: meteors keep speeding up (up to a limit)
    if (accel && !m.harmless && Math.hypot(m.vx, m.vy) < 340) {
      const k = 1 + accel * dt;
      m.vx *= k;
      m.vy *= k;
    }
    // MAGNETIC: turn toward the mothership (keeping the same speed)
    if (m.homing && !finale) {
      const sp = Math.hypot(m.vx, m.vy);
      const a = turnToward(Math.atan2(m.vy, m.vx), Math.atan2(g.mother.y - m.y, g.mother.x - m.x), 0.8 * dt);
      m.vx = Math.cos(a) * sp;
      m.vy = Math.sin(a) * sp;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.rot += m.spin * dt;
    m.flash = Math.max(0, m.flash - dt);
    if (m.type === 'comet' && Math.random() < 0.6 * particleScale()) {
      addParticle({ kind: 'spark', x: m.x, y: m.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, color: '#9adfff', size: 4 });
    }
    // Remove objects that have left the screen and are heading away
    if (!finale) {
      const offscreen = m.x < -m.r || m.x > W + m.r || m.y < -m.r || m.y > H + m.r;
      const outward = (W / 2 - m.x) * m.vx + (H / 2 - m.y) * m.vy < 0;
      if (offscreen && outward) m.dead = true;
    }
  }
}

function updateBullets(dt) {
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Bullets wrap around the screen like the arcade original
    if (b.x < 0) b.x += W;
    if (b.x > W) b.x -= W;
    if (b.y < 0) b.y += H;
    if (b.y > H) b.y -= H;
    if (b.life <= 0) b.dead = true;
  }
  game.bullets = game.bullets.filter(b => !b.dead);
}

function hitMeteor(m) {
  if (m.type === 'mine') return detonateMine(m);
  if (m.type === 'crate') return openCrate(m);
  m.hp--;
  m.flash = 0.1;
  if (m.hp > 0) {
    // Survived: chip sparks + a clink
    burst(m.x, m.y, 6, METEOR_STYLE[m.type].crack || '#ffffff', 100, 0.35, 3);
    Sound.clink();
    return;
  }
  destroyMeteor(m, true);
}

function destroyMeteor(m, scored) {
  const g = game;
  if (m.dead) return;
  m.dead = true;
  explode(m.x, m.y, Math.min(m.size, 3), METEOR_STYLE[m.type].edge);
  Sound.explode(Math.min(m.size, 3));

  if (scored) {
    addScore(SCORE[m.type][m.size], m.x, m.y);
    addCredits(CREDIT[m.type] + salvageBonus());
    questEvent('kill');
    if (m.type !== 'rock') questEvent(m.type);
  }

  // Bigger meteors split into smaller ones (2 pieces, or 3 with SPLITTERS).
  // Magma cools and cracks into ordinary rock; iron stays iron.
  if (m.size > 1 && m.type !== 'comet') {
    const childType = m.type === 'magma' ? 'rock' : m.type;
    const pieces = g.cfg.splitCount;
    const heading = Math.atan2(m.vy, m.vx);
    const speed = Math.hypot(m.vx, m.vy);
    const fan = rand(0.4, 0.8) * (pieces > 2 ? 1.2 : 1);
    for (let i = 0; i < pieces; i++) {
      const a = heading + (i - (pieces - 1) / 2) * fan * (pieces === 2 ? 1.6 : 1);
      const s = speed * rand(1.1, 1.4);
      g.meteors.push(makeMeteor(m.x, m.y, Math.cos(a) * s, Math.sin(a) * s, m.size - 1, childType, g.cfg.fx.hpBonus || 0));
    }
  }
}

// MINEFIELD: a mine blows up everything (meteors and other mines) near it.
function detonateMine(m) {
  const g = game;
  if (m.dead) return;
  m.dead = true;
  explode(m.x, m.y, 3, '#ff4f5e');
  shockwave(m.x, m.y, MINE_BLAST, '#ffb13d', 0.5);
  addShake(10);
  Sound.explode(3);
  addScore(SCORE.mine[1], m.x, m.y);
  addCredits(CREDIT.mine);
  // Walk the live list by index: destroying a meteor appends its fragments,
  // and those fragments get caught in the blast too
  for (let i = 0; i < g.meteors.length; i++) {
    const o = g.meteors[i];
    if (o.dead || o.type === 'crate' || o.decor) continue;
    if (Math.hypot(o.x - m.x, o.y - m.y) < MINE_BLAST + o.r * 0.5) {
      if (o.type === 'mine') detonateMine(o);
      else destroyMeteor(o, true);
    }
  }
}

// SUPPLY RUN: a crate gives a random useful reward.
function openCrate(m) {
  const g = game;
  const p = g.player;
  if (m.dead) return;
  m.dead = true;
  burst(m.x, m.y, 18, '#5dff9e', 120, 0.6, 5);
  shockwave(m.x, m.y, 40, '#5dff9e');
  Sound.buy();

  const damaged = g.lives < maxHits();
  const roll = Math.random();
  if (damaged && roll < 0.5) {
    g.lives++;
    addFloater('HULL REPAIRED +1', m.x, m.y - 10, '#5dff9e', 10);
  } else if (roll < 0.75) {
    p.heat = 0;
    p.overheated = false;
    p.jammed = false;
    addFloater('COOLANT! BLASTER RESET', m.x, m.y - 10, '#5dff9e', 10);
  } else {
    addCredits(40);
    addFloater('+40 CREDITS', m.x, m.y - 10, '#5dff9e', 10);
  }
}

function handleCollisions() {
  const g = game;

  // Bullets vs meteors / mines / crates
  for (const b of g.bullets) {
    if (b.dead) continue;
    for (const m of g.meteors) {
      if (m.dead || m === b.lastHit) continue;
      if (Math.hypot(b.x - m.x, b.y - m.y) < m.r * 0.92) {
        hitMeteor(m);
        // PIERCING BOLTS keep going until they run out of punch
        if (b.pierce > 0) {
          b.pierce--;
          b.lastHit = m;
        } else {
          b.dead = true;
          break;
        }
      }
    }
  }

  // Meteors vs mothership (crates just float past)
  const mo = g.mother;
  for (const m of g.meteors) {
    if (m.dead || m.type === 'crate') continue;
    if (Math.hypot(m.x - mo.x, m.y - mo.y) < m.r * 0.8 + mo.r) impactMother(m);
  }

  // Meteors vs defender (flying into a crate collects it)
  const p = g.player;
  if (p.alive && !g.ending) {
    for (const m of g.meteors) {
      if (m.dead || Math.hypot(m.x - p.x, m.y - p.y) >= m.r * 0.8 + p.r) continue;
      if (m.type === 'crate') {
        openCrate(m);
      } else if (p.invuln <= 0) {
        if (m.type === 'mine') detonateMine(m);
        else destroyMeteor(m, false);
        hitPlayer();
        break;
      }
    }
  }

  g.bullets = g.bullets.filter(b => !b.dead);
  g.meteors = g.meteors.filter(m => !m.dead);
}

// =========================================================
// TWISTS - per-level special effects (see TWISTS in config.js)
// =========================================================

// Reset the state that twist effects need. Called when a level or sector starts.
function initTwistState() {
  const g = game;
  const fx = g.cfg.fx;
  g.levelTime = 0;
  g.wind = fx.wind ? { dir: Math.random() < 0.5 ? -1 : 1, timer: rand(10, 14) } : null;
  g.emp = fx.emp ? { timer: fx.emp.every, active: 0 } : null;
  g.supplyTimer = 4;
  g.well = fx.well ? makeWell() : null;
}

function updateTwists(dt) {
  const g = game;
  const fx = g.cfg.fx;
  const p = g.player;
  const mo = g.mother;
  g.levelTime += dt;

  // COURSE CHANGE: the course point sways left and right
  if (fx.weave) {
    const w = 0.35;
    g.courseX = COURSE_X + Math.sin(g.levelTime * w) * fx.weave;
    g.courseVx = Math.cos(g.levelTime * w) * w * fx.weave;
  } else {
    // Ease back to center (matters when an Infinite Voyage sector's weave ends)
    const step = (COURSE_X - g.courseX) * Math.min(1, dt * 1.5);
    g.courseX += step;
    g.courseVx = dt > 0 ? step / dt : 0;
  }

  // TURBULENCE: the course point bobs up and down
  if (fx.bob) {
    const w = 0.55;
    g.courseY = COURSE_Y + Math.sin(g.levelTime * w) * fx.bob;
    g.courseVy = Math.cos(g.levelTime * w) * w * fx.bob;
  } else {
    const step = (COURSE_Y - g.courseY) * Math.min(1, dt * 1.5);
    g.courseY += step;
    g.courseVy = dt > 0 ? step / dt : 0;
  }

  // SOLAR WIND: a sideways push on everything that flips every 10-14 seconds
  if (g.wind) {
    const w = g.wind;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.dir *= -1;
      w.timer = rand(10, 14);
      Sound.windShift();
    }
    const push = w.dir * fx.wind * dt;
    if (p.alive) p.vx += push;
    mo.vx += push * 0.3;
    for (const m of g.meteors) m.vx += push * 0.3;
    for (const q of particles) q.vx += push * 0.6;
  }

  // EMP BURSTS: the blaster goes offline for a moment every few seconds
  if (g.emp && g.phase === 'play') {
    const e = g.emp;
    if (e.active > 0) {
      e.active -= dt;
    } else {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.active = fx.emp.dur;
        e.timer = fx.emp.every;
        Sound.emp();
        if (p.alive) burst(p.x, p.y, 16, '#6fdcff', 160, 0.5, 4);
      }
    }
  }

  // SUPPLY RUN: crates float by now and then
  if (fx.supply && g.phase === 'play') {
    g.supplyTimer -= dt;
    if (g.supplyTimer <= 0) {
      spawnCrate();
      g.supplyTimer = fx.supply * rand(0.8, 1.2);
    }
  }

  // GRAVITY WELL: the planet pulls meteors and your ship; meteors that hit it are absorbed
  if (g.well) {
    const wl = g.well;
    const pull = (o, mult) => {
      const dx = wl.x - o.x, dy = wl.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      const acc = Math.min(260, 2.4e6 / (d * d)) * mult;
      o.vx += (dx / d) * acc * dt;
      o.vy += (dy / d) * acc * dt;
      return d;
    };
    for (const m of g.meteors) {
      if (pull(m, 1) < wl.r + m.r * 0.5) {
        m.dead = true;
        burst(m.x, m.y, 10, '#b48cff', 90, 0.5, 4);
      }
    }
    if (p.alive && pull(p, 0.6) < wl.r + p.r) {
      if (p.invuln <= 0) hitPlayer();
      else {
        // Bounce off while invulnerable
        const a = Math.atan2(p.y - wl.y, p.x - wl.x);
        p.x = wl.x + Math.cos(a) * (wl.r + p.r + 2);
        p.y = wl.y + Math.sin(a) * (wl.r + p.r + 2);
        p.vx = Math.cos(a) * 150;
        p.vy = Math.sin(a) * 150;
      }
    }
    for (const b of g.bullets) if (Math.hypot(b.x - wl.x, b.y - wl.y) < wl.r) b.dead = true;
  }

  // EVENT HORIZON: the distant black hole tugs on meteors, and swallows any that reach it
  if (fx.bhPull && g.blackHole) {
    const bh = g.blackHole;
    for (const m of g.meteors) {
      const dx = bh.x - m.x, dy = bh.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      m.vx += (dx / d) * fx.bhPull * dt;
      m.vy += (dy / d) * fx.bhPull * dt;
      if (d < bh.r) m.dead = true;
    }
  }
}

// =========================================================
// LEVEL FLOW
// =========================================================
function levelClear() {
  const g = game;
  g.phase = 'clear';
  g.phaseTimer = 4;

  // Course bonus: the closer the mothership stayed to its course, the bigger
  const avgFrac = g.devTime > 0 ? clamp(g.devSum / g.devTime, 0, 1) : 0;
  const course = Math.round((g.level * 200 * (1 - avgFrac)) / 10) * 10;
  // Perfect defense: the mothership was never hit
  const shield = g.motherHits === 0 ? g.level * 250 : 0;
  const credits = g.level * 10 + (shield ? g.level * 15 : 0);
  g.bonus = { course, shield, credits };
  addScore(course + shield);
  addCredits(credits);

  if (g.level < MAX_LEVEL && g.level + 1 > progress.unlocked) progress.unlocked = g.level + 1;
  questEvent('clear');
  if (shield) questEvent('perfect');
  questEvent('score', g.score);
  saveProgress();
  Sound.levelClear();
}

function nextLevel() {
  if (game.level === MAX_LEVEL) startFinale();
  else startLevel(game.level + 1);
}

// Something went wrong: 'course' (mothership lost) or 'defender' (out of hull).
// The game keeps running for a couple of seconds so the player sees what happened.
function triggerEnd(reason) {
  const g = game;
  if (g.ending) return;
  g.ending = { reason, t: 2.2 };
  Sound.setThrust(false);
  if (reason === 'course') {
    const mo = g.mother;
    mo.destab = 999; // autopilot never comes back
    mo.vx *= 1.8;
    mo.vy *= 1.8;
    addShake(10);
    Sound.courseLost();
  }
}

function showGameOver() {
  const g = game;
  mode = 'over';
  Sound.setThrust(false);
  const course = g.ending.reason === 'course';

  let newBest;
  if (g.infinite) {
    newBest = g.score > progress.infiniteBest;
    progress.infiniteBest = Math.max(progress.infiniteBest, g.score);
    progress.bestDistance = Math.max(progress.bestDistance, g.distance);
  } else {
    newBest = g.score > progress.highScore;
    progress.highScore = Math.max(progress.highScore, g.score);
  }
  questEvent('score', g.score);
  saveProgress();

  $('over-title').textContent = course ? 'MOTHERSHIP LOST' : 'DEFENDER DOWN';
  $('over-reason').textContent = course
    ? 'THE MOTHERSHIP WAS KNOCKED TOO FAR OFF COURSE.'
    : 'YOUR DEFENDER RAN OUT OF HULL AND WAS DESTROYED.';
  const rows = [
    ['SCORE', pad(g.score, 6)],
    g.infinite ? ['DISTANCE', g.distance.toFixed(1) + ' LY'] : ['LEVEL', pad(g.level, 2)],
    ['BEST', pad(g.infinite ? progress.infiniteBest : progress.highScore, 6)],
    ['CREDITS EARNED', '+' + g.creditsEarned],
  ];
  $('over-stats').innerHTML = rows.map(([k, v]) => `<div>${k} <span>${v}</span></div>`).join('');
  $('over-newhi').classList.toggle('show', newBest && g.score > 0);
  $('over-retry').textContent = g.infinite ? 'NEW VOYAGE' : 'RETRY LEVEL';
  Sound.gameOver();
  Menu.show('menu-over');
}

function showVictory() {
  const g = game;
  mode = 'over';
  g.phase = 'done';
  g.blackHole = null;
  Sound.setThrust(false);
  addCredits(300); // mission complete bonus
  const newBest = g.score > progress.highScore;
  progress.highScore = Math.max(progress.highScore, g.score);
  questEvent('score', g.score);
  saveProgress();

  const rows = [
    ['FINAL SCORE', pad(g.score, 6)],
    ['HULL REMAINING', `${g.lives} / ${maxHits()}`],
    ['CREDITS EARNED', '+' + g.creditsEarned + ' (INCL. +300 BONUS)'],
  ];
  $('win-stats').innerHTML = rows.map(([k, v]) => `<div>${k} <span>${v}</span></div>`).join('');
  $('win-newhi').classList.toggle('show', newBest);
  Sound.victory();
  Menu.show('menu-victory');
}

// =========================================================
// INFINITE VOYAGE
// No levels: the difficulty ramps up with time survived.
// Distance earns score, and every SECTOR_TIME seconds a new
// sector gives a bonus and changes the scenery.
// =========================================================
function updateInfinite(dt) {
  const g = game;
  g.cfg = infiniteConfig(g.playTime, g.sectorTwist);
  space.speed = 1 + Math.min(1.5, g.playTime / 240); // stars rush past faster over time

  g.distance += (0.18 + g.playTime / 900) * dt;
  const ly = Math.floor(g.distance);
  if (ly > g.lastLy) {
    g.lastLy = ly;
    addScore(25);
    questEvent('distance', ly);
  }

  const sector = 1 + Math.floor(g.playTime / SECTOR_TIME);
  if (sector > g.sector) {
    g.sector = sector;
    g.sectorBanner = 3.5;
    addScore(sector * 100);
    addCredits(15);
    setNebula(sector - 1);
    // Every new sector rolls a random twist (never the same one twice in a row)
    const choices = INFINITE_TWISTS.filter(t => t !== g.sectorTwist);
    g.sectorTwist = pick(choices);
    g.cfg = infiniteConfig(g.playTime, g.sectorTwist);
    initTwistState();
    rechargeShields();
    Sound.levelClear();
  }
  g.sectorBanner = Math.max(0, g.sectorBanner - dt);
}

// =========================================================
// BLACK HOLE (level 40, the final level)
// During the final level the black hole sits in the distance and grows
// as the wave goes on. When the wave is cleared the finale
// starts: it moves in, its gravity pulls in the mothership,
// the defender and a ring of meteors, stretching them
// ("spaghettification") until they vanish. Then it collapses
// in a white flash and the victory screen appears.
// =========================================================
function updateBlackHole(dt) {
  const g = game;
  const bh = g.blackHole;
  if (g.phase === 'intro' || g.phase === 'play') {
    bh.targetR = 6 + 26 * (g.spawned / g.cfg.total);
  }
  bh.r += (bh.targetR - bh.r) * Math.min(1, dt * 0.8);
  bh.y += (bh.targetY - bh.y) * Math.min(1, dt * 0.8);
  for (const d of bh.disk) d.a += ((2.2 * d.s) / d.d) * dt; // inner particles orbit faster
}

function startFinale() {
  const g = game;
  const bh = g.blackHole;
  g.phase = 'blackhole';
  g.phaseTimer = 0;
  bh.targetR = 70;
  bh.targetY = 190;

  // A ring of meteors drifting around the black hole, about to be swallowed too
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU);
    const d = rand(300, 520);
    const size = pick([1, 2, 2, 3]);
    const m = makeMeteor(W / 2 + Math.cos(a) * d, 190 + Math.sin(a) * d * 0.8,
      -Math.sin(a) * 40, Math.cos(a) * 40, size, pick(['rock', 'rock', 'magma', 'iron']));
    m.decor = true;
    g.meteors.push(m);
  }
  Sound.setThrust(false);
  Sound.blackHole();
}

function updateFinale(dt) {
  const g = game;
  const bh = g.blackHole;
  g.phaseTimer += dt;
  const t = g.phaseTimer;
  bh.pull = clamp((t - 1.2) / 4, 0, 1);
  const strength = 60 + bh.pull * 1400;

  // Gravity: pull toward the center, plus a sideways swirl so things spiral in
  const pullBody = (b, mult = 1) => {
    const dx = bh.x - b.x, dy = bh.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const acc = (strength * 120 * mult) / Math.max(d, 40);
    b.vx += (ux * acc - uy * acc * 0.55) * dt;
    b.vy += (uy * acc + ux * acc * 0.55) * dt;
    return { d, dx, dy };
  };

  // Stretch things along the direction of the pull as they get close
  const stretchBody = (b, d, dx, dy) => {
    const s = clamp((d - bh.r) / (bh.r * 2.2), 0, 1);
    b.stretch = { a: Math.atan2(dy, dx), sx: 0.25 + 0.75 * s + (1 - s) * 0.9, sy: Math.max(0.03, s) };
  };

  const swallow = (x, y, color) => {
    burst(x, y, 20, color, 150, 0.6, 5);
    shockwave(bh.x, bh.y, bh.r * 2, '#ffcf7a', 0.6);
    Sound.swallowed();
    addShake(8);
  };

  // Mothership (moves here - updateMother is skipped during the finale)
  const mo = g.mother;
  if (!mo.captured) {
    const { d, dx, dy } = pullBody(mo, 0.8);
    mo.x += mo.vx * dt;
    mo.y += mo.vy * dt;
    mo.va += 1.5 * dt;
    mo.a += mo.va * dt;
    stretchBody(mo, d, dx, dy);
    if (d < bh.r * 0.9) {
      mo.captured = true;
      swallow(mo.x, mo.y, '#ffcf7a');
    }
  }

  // Defender (its own update moves it; the player can fight the pull, but not for long)
  const p = g.player;
  if (p.alive && !p.captured) {
    const { d, dx, dy } = pullBody(p, 1.1);
    stretchBody(p, d, dx, dy);
    if (d < bh.r * 0.9) {
      p.captured = true;
      swallow(p.x, p.y, skin().trim);
    }
  }

  // Meteors
  for (const m of g.meteors) {
    const { d, dx, dy } = pullBody(m);
    stretchBody(m, d, dx, dy);
    if (d < bh.r * 0.9) {
      m.dead = true;
      burst(m.x, m.y, 6, '#ffcf7a', 80, 0.4, 3);
    }
  }
  g.meteors = g.meteors.filter(m => !m.dead);

  // Particles get sucked in too
  for (const q of particles) {
    const d = Math.hypot(bh.x - q.x, bh.y - q.y) || 1;
    const acc = (strength * 60) / Math.max(d, 40);
    q.vx += ((bh.x - q.x) / d) * acc * dt;
    q.vy += ((bh.y - q.y) / d) * acc * dt;
    if (d < bh.r) q.life = 0;
  }

  // Once everything is gone (or after a time limit), the black hole collapses
  const allGone = mo.captured && (p.captured || !p.alive) && g.meteors.length === 0;
  if (!bh.collapsing && (allGone || t > 13)) {
    bh.collapsing = true;
    bh.targetR = 0;
    Sound.collapse();
  }
  if (bh.collapsing) {
    bh.collapseT += dt;
    g.flash = Math.min(1, bh.collapseT / 1.2);
    if (bh.collapseT > 2.2) showVictory();
  }
}

// =========================================================
// AUDIO CUES - heartbeat, low-course alarm, engine rumble
// =========================================================
function updateAudioCues(dt) {
  const g = game;
  if (g.phase === 'play' && !g.ending && settings.heartbeat) {
    // The classic arcade "heartbeat" speeds up as the wave goes on
    g.beatTimer -= dt;
    if (g.beatTimer <= 0) {
      g.beatHigh = !g.beatHigh;
      Sound.beat(g.beatHigh);
      const prog = g.infinite ? Math.min(1, g.playTime / 300) : g.spawned / g.cfg.total;
      g.beatTimer = 1.0 - 0.6 * prog;
    }
  }
  if (settings.alarm && !g.ending && g.phase !== 'blackhole' && g.mother.dev / maxDev() > 0.65) {
    g.alarmTimer -= dt;
    if (g.alarmTimer <= 0) {
      Sound.alarm();
      g.alarmTimer = 0.5;
    }
  } else {
    g.alarmTimer = 0;
  }
  Sound.setThrust(g.player.alive && !g.player.captured && g.player.thrusting && !g.ending);
}

// =========================================================
// ATTRACT MODE - the demo scene behind the main menu
// =========================================================
const attract = { mother: null, ship: null, meteors: [] };

function initAttract() {
  attract.mother = newMother();
  attract.ship = newPlayer();
  attract.ship.invuln = 0;
  attract.meteors = [3, 3, 2, 2, 1, 1, 3, 2].map((size, i) =>
    makeMeteor(rand(0, W), rand(0, H), rand(-40, 40), rand(-40, 40), size, ['iron', 'magma', 'rock'][i % 3]));
}

function updateAttract(dt) {
  const mo = attract.mother;
  mo.x = COURSE_X + Math.sin(time * 0.6) * 14;
  mo.y = COURSE_Y + Math.sin(time * 0.9) * 8;
  mo.a = Math.sin(time * 0.7) * 0.06;

  // The defender flies laps around the mothership
  const s = attract.ship;
  const a = time * 0.7;
  s.x = mo.x + Math.cos(a) * 170;
  s.y = mo.y + Math.sin(a) * 105;
  s.a = Math.atan2(Math.cos(a) * 105, -Math.sin(a) * 170);
  s.thrusting = true;

  for (const m of attract.meteors) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.rot += m.spin * dt;
    if (m.x < -m.r) m.x = W + m.r;
    if (m.x > W + m.r) m.x = -m.r;
    if (m.y < -m.r) m.y = H + m.r;
    if (m.y > H + m.r) m.y = -m.r;
  }
  updateParticles(dt);
}
