'use strict';

/* =========================================================
   ENTITIES - functions that create game objects, plus the
   particle effects (sparks, smoke, debris, shockwaves) and
   floating score text.

   All objects are plain JavaScript objects with x/y position
   and vx/vy velocity (pixels per second). game.js moves them
   and render.js draws them.
   ========================================================= */

let particles = []; // visual effects only - they never collide with anything
let floaters = [];  // floating "+100" text

// ---------- Defender (the player's ship) ----------
function newPlayer() {
  return {
    x: COURSE_X, y: COURSE_Y + 110, vx: 0, vy: 0,
    a: -Math.PI / 2,       // facing angle (radians); -PI/2 = pointing up
    r: 10,                 // collision radius
    cooldown: 0,           // seconds until the blaster can fire again
    heat: 0,               // blaster heat 0..1
    overheated: false,     // true = locked out until heat drops to 30%
    jammed: false,         // true = must tap FIX JAM to fire again
    jamLeft: 0,            // taps still needed to clear the jam
    lastShot: 1,           // seconds since the last shot (cooling is faster when idle)
    invuln: 2,             // seconds of invulnerability (after spawning or being hit)
    alive: true,
    respawn: 0,            // countdown to respawn after being hit
    thrusting: false,
    captured: false,       // swallowed by the black hole (level 25 finale)
    stretch: null,         // squash/stretch while falling into the black hole
  };
}

// ---------- Mothership ----------
function newMother() {
  return {
    x: COURSE_X, y: COURSE_Y, vx: 0, vy: 0,
    a: 0, va: 0,           // tilt angle and spin speed
    r: 34,                 // collision radius
    destab: 0,             // seconds left with autopilot offline after a hit
    flash: 0,              // red hit-flash timer
    dev: 0,                // current distance from the course point
    captured: false,
    stretch: null,
  };
}

// ---------- Meteors ----------
// type: 'rock' | 'magma' | 'iron' | 'comet'    size: 3 (large), 2, 1 (small)
function makeMeteor(x, y, vx, vy, size, type) {
  const r = METEOR_RADIUS[size];

  // Random lumpy outline: points around a circle at random distances
  const n = type === 'comet' ? 7 : Math.floor(rand(9, 13));
  const shape = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.15, 0.15);
    const rr = r * rand(0.72, 1.05);
    shape.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }

  // Hit points: magma takes 2 hits, iron takes more the bigger it is,
  // and giants (size 4) take 2 extra hits on top of that
  let hp = type === 'magma' ? 2 : type === 'iron' ? Math.min(size, 3) : 1;
  if (size === 4) hp += 2;

  // Crack lines that glow once a multi-hit meteor has been damaged
  const cracks = [];
  if (hp > 1) {
    for (let k = 0; k < 3; k++) {
      let cx = rand(-2, 2), cy = rand(-2, 2), a = rand(0, TAU);
      const pts = [[cx, cy]];
      for (let s = 0; s < 4; s++) {
        a += rand(-0.6, 0.6);
        cx += Math.cos(a) * r * 0.22;
        cy += Math.sin(a) * r * 0.22;
        pts.push([cx, cy]);
      }
      cracks.push(pts);
    }
  }

  const m = {
    x, y, vx, vy, size, type, r, shape, cracks,
    rot: rand(0, TAU), spin: rand(-1.2, 1.2),
    hp, maxHp: hp,
    flash: 0,              // white flash when hit
    dead: false,
    decor: false,          // true = scenery only (black hole finale), no score/collisions
    harmless: false,       // true = doesn't have to be cleared to finish the level (mines, crates)
    homing: false,         // true = steers toward the mothership (MAGNETIC twist)
    stretch: null,
  };
  m.sprite = buildMeteorSprite(m);
  return m;
}

// Mines and supply crates live in the same list as meteors so they move and
// collide the same way, but they use their own sprites and rules (game.js).
function makeSpecial(type, x, y, vx, vy, r, sprite) {
  return {
    x, y, vx, vy, size: 1, type, r, shape: [], cracks: [],
    rot: rand(0, TAU), spin: rand(-1, 1),
    hp: 1, maxHp: 1, flash: 0, dead: false, decor: false,
    harmless: true, homing: false, stretch: null, sprite,
  };
}

const makeMine = (x, y, vx, vy) => makeSpecial('mine', x, y, vx, vy, 15, mineSprite());
const makeCrate = (x, y, vx, vy) => makeSpecial('crate', x, y, vx, vy, 14, crateSprite());

// The GRAVITY WELL twist's planet: pulls meteors (and you) toward it.
function makeWell() {
  return { x: W * 0.2, y: H * 0.32, r: 30, sprite: buildPlanetSprite(WELL_PLANET, 30, false) };
}

// ---------- Black hole (level 25, the final level) ----------
// The accretion disk is a ring of glowing particles orbiting the hole.
function makeBlackHole() {
  const disk = [];
  const colors = ['#fff3d6', '#ffcf7a', '#ff9a3d', '#ff6a2a', '#ffd9a8'];
  for (let i = 0; i < 240; i++) {
    disk.push({ a: rand(0, TAU), d: rand(1.35, 3.4), s: rand(0.6, 1.2), size: rand(1, 2.6), c: pick(colors) });
  }
  return {
    x: W / 2, y: 110,
    r: 6, targetR: 6,       // event horizon radius (grows as the level goes on)
    targetY: 110,
    disk,
    pull: 0,                // 0..1 gravity strength during the finale
    collapsing: false,
    collapseT: 0,
  };
}

// =========================================================
// PARTICLES
// kind: 'spark'  - glowing dot (additive blend)
//       'debris' - spinning line segment
//       'smoke'  - soft gray puff that grows and fades
//       'ring'   - expanding shockwave circle
// =========================================================
const MAX_PARTICLES = 900;
const particleScale = () => (highQuality() ? 1 : 0.4); // LOW graphics = fewer particles

function addParticle(p) {
  if (particles.length < MAX_PARTICLES) particles.push(p);
}

function burst(x, y, count, color, speed = 140, life = 0.8, size = 4) {
  count = Math.ceil(count * particleScale());
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(0.2, 1) * speed;
    const l = rand(0.4, 1) * life;
    addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, color, size: rand(0.6, 1.2) * size });
  }
}

function debris(x, y, count, color, speed = 90) {
  count = Math.ceil(count * particleScale());
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(0.3, 1) * speed;
    const l = rand(0.9, 1.6);
    addParticle({ kind: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, a: rand(0, TAU), va: rand(-6, 6), len: rand(4, 11), life: l, max: l, color });
  }
}

function smoke(x, y, count, size = 14) {
  count = Math.ceil(count * particleScale());
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(5, 35);
    const l = rand(0.8, 1.6);
    addParticle({ kind: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: size * rand(0.7, 1.3) });
  }
}

function shockwave(x, y, radius, color, life = 0.45) {
  addParticle({ kind: 'ring', x, y, vx: 0, vy: 0, r0: 4, r1: radius, life, max: life, color });
}

// A full explosion: flash + shockwave + sparks + debris + smoke. size 1..3
function explode(x, y, size, color) {
  addParticle({ kind: 'spark', x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, color: '#ffffff', size: 16 + size * 8 });
  shockwave(x, y, 18 + size * 16, color);
  burst(x, y, 8 + size * 8, color, 60 + size * 50, 0.9, 5);
  burst(x, y, 4 + size * 3, '#ffd9a8', 40 + size * 30, 0.6, 4);
  debris(x, y, size * 3, color, 70 + size * 20);
  smoke(x, y, size * 2, 8 + size * 5);
}

function updateParticles(dt) {
  const drag = Math.exp(-1.2 * dt);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
    if (p.kind === 'debris') p.a += p.va * dt;
  }
  particles = particles.filter(p => p.life > 0);
}

// ---------- Floating text ----------
function addFloater(text, x, y, color, size = 9) {
  if (!settings.popups) return;
  floaters.push({ text, x, y, color, size, life: 1.1, max: 1.1 });
}

function updateFloaters(dt) {
  for (const f of floaters) {
    f.y -= 28 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter(f => f.life > 0);
}
