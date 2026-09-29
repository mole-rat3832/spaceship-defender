'use strict';

/* =========================================================
   SPACE BACKGROUND
   Layers, drawn back to front:
     1. Nebula   - big soft color clouds, pre-painted onto a tall
                   canvas that scrolls slowly and repeats
     2. Far stars - tiny twinkling dots
     3. Shooting stars
     4. Planets  - pass by now and then
     5. Near stars - bright stars with sparkle spikes
     6. Space dust - fast faint streaks that sell the sense of speed

   The mothership flies "up" the screen, so everything in the
   background scrolls DOWN. Closer layers scroll faster
   (parallax), which makes the scene feel deep.
   ========================================================= */

const BG_H = H * 2; // the nebula canvas is twice the screen height and tiles vertically

// Color sets for the nebula. Each level picks one; the final level gets the ominous red one.
const NEBULA_PALETTES = [
  ['#3b1f6e', '#123a6b', '#0d5a63'], // violet / blue / teal
  ['#5a1f4f', '#2b1f6e', '#1b3a6b'], // magenta
  ['#0d4a5a', '#12306b', '#1f6b55'], // teal / green
  ['#6b3a12', '#5a1f2f', '#2b1f5a'], // amber / red
  ['#1f2b6b', '#3b1f6e', '#0d2a4a'], // deep blue
  ['#4a0d1f', '#6b2a12', '#1a0a2a'], // black-hole red (level 25)
];

const STAR_COLORS = ['#ffffff', '#dce8ff', '#fff1d6', '#ffd6d6', '#d6fff6', '#cfd9ff'];

const space = {
  scroll: 0,         // how far we have traveled (drives nebula scrolling)
  speed: 1,          // travel speed multiplier (Infinite Voyage speeds this up)
  nebula: null,      // current nebula canvas
  nebulaOld: null,   // previous nebula, faded out when the palette changes
  fade: 1,
  paletteIndex: -1,
  stars: [],
  dust: [],
  planets: [],
  planetTimer: 20,
  shooting: [],
  shootTimer: 5,
};

// Paint a nebula onto a tall canvas. Every cloud is also painted one canvas-
// height above and below, so the top and bottom edges match up seamlessly.
function buildNebula(palette) {
  const [c, g] = makeCanvas(W, BG_H);
  g.fillStyle = '#03040b';
  g.fillRect(0, 0, W, BG_H);

  const blob = (x, y, r, color, alpha) => {
    for (const oy of [-BG_H, 0, BG_H]) {
      const grad = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      grad.addColorStop(0, rgba(color, alpha));
      grad.addColorStop(0.6, rgba(color, alpha * 0.35));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y + oy - r, r * 2, r * 2);
    }
  };

  for (let i = 0; i < 30; i++) {
    blob(rand(-100, W + 100), rand(0, BG_H), rand(140, 420), palette[i % palette.length], rand(0.08, 0.22));
  }
  // Dark dust lanes cut through the glow
  for (let i = 0; i < 10; i++) blob(rand(0, W), rand(0, BG_H), rand(80, 220), '#000000', 0.3);

  // A few far-off galaxies: squashed glowing ovals
  for (let i = 0; i < 3; i++) {
    const x = rand(60, W - 60), y = rand(80, BG_H - 80), r = rand(18, 40);
    g.save();
    g.translate(x, y);
    g.rotate(rand(0, TAU));
    g.scale(1, 0.35);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, 'rgba(255,245,230,0.7)');
    grad.addColorStop(0.3, rgba(palette[0], 0.45));
    grad.addColorStop(1, rgba(palette[0], 0));
    g.fillStyle = grad;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
  }
  return c;
}

// Switch to another nebula palette with a smooth cross-fade.
function setNebula(index) {
  index %= NEBULA_PALETTES.length;
  if (index === space.paletteIndex) return;
  space.nebulaOld = space.nebula;
  space.nebula = buildNebula(NEBULA_PALETTES[index]);
  space.fade = space.nebulaOld ? 0 : 1;
  space.paletteIndex = index;
}

function initSpace() {
  // Three star layers: far (many, small, slow) -> near (few, big, fast)
  const layers = [
    { n: 170, speed: 6, size: [0.5, 1.1], a: [0.25, 0.6] },
    { n: 70, speed: 16, size: [0.9, 1.6], a: [0.45, 0.85] },
    { n: 22, speed: 34, size: [1.4, 2.4], a: [0.7, 1] },
  ];
  space.stars = [];
  layers.forEach((L, layer) => {
    for (let i = 0; i < L.n; i++) {
      space.stars.push({
        x: rand(0, W), y: rand(0, H), layer, speed: L.speed,
        size: rand(...L.size), a: rand(...L.a),
        tw: rand(1, 4), ph: rand(0, TAU), // twinkle speed + phase
        color: pick(STAR_COLORS),
      });
    }
  });
  space.dust = Array.from({ length: 30 }, () => ({ x: rand(0, W), y: rand(0, H), speed: rand(90, 160), len: rand(6, 16) }));
  setNebula(0);
  spawnPlanet(true);
}

// Add a planet. `initial` places it on screen right away instead of above it.
function spawnPlanet(initial = false) {
  const def = pick(PLANET_KINDS);
  const r = Math.random() < 0.2 ? rand(120, 170) : rand(35, 110);
  const ringed = (def.kind === 'gas' && Math.random() < 0.6) || Math.random() < 0.12;
  const sprite = buildPlanetSprite(def, r, ringed);
  // Keep planets toward the sides so they don't hide the action in the middle
  const x = Math.random() < 0.5 ? rand(20, W * 0.28) : rand(W * 0.72, W - 20);
  const y = initial ? rand(120, H - 160) : -sprite.half;
  space.planets.push({ sprite, x, y, r, speed: 3 + r * 0.05 });
  space.planets.sort((a, b) => a.r - b.r); // small (far) planets drawn first
}

function updateSpace(dt) {
  const sp = space.speed;
  space.scroll += 20 * dt * sp;

  for (const s of space.stars) {
    s.y += s.speed * dt * sp;
    if (s.y > H) {
      s.y -= H;
      s.x = rand(0, W);
    }
  }
  for (const d of space.dust) {
    d.y += d.speed * dt * sp;
    if (d.y > H + d.len) {
      d.y = -d.len;
      d.x = rand(0, W);
    }
  }

  for (const p of space.planets) p.y += p.speed * dt * sp;
  space.planets = space.planets.filter(p => p.y - p.sprite.half < H + 10);
  space.planetTimer -= dt * sp;
  if (space.planetTimer <= 0) {
    if (space.planets.length < 2) spawnPlanet();
    space.planetTimer = rand(30, 55);
  }

  // Shooting stars every few seconds
  space.shootTimer -= dt;
  if (space.shootTimer <= 0) {
    const a = rand(0.3, 1.2) + (Math.random() < 0.5 ? 0 : Math.PI - 1.5);
    const speed = rand(500, 800);
    space.shooting.push({ x: rand(0, W), y: rand(0, H * 0.5), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.7, max: 0.7 });
    space.shootTimer = rand(5, 12);
  }
  for (const s of space.shooting) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
  space.shooting = space.shooting.filter(s => s.life > 0);

  if (space.fade < 1) {
    space.fade = Math.min(1, space.fade + dt * 0.5);
    if (space.fade === 1) space.nebulaOld = null;
  }
}

function drawSpace() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, H);

  // 1. Nebula (two copies stacked so the scroll wraps without a gap)
  const off = (space.scroll * 0.15) % BG_H;
  const blit = (img, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, 0, off - BG_H, W, BG_H);
    ctx.drawImage(img, 0, off, W, BG_H);
  };
  if (space.nebulaOld) blit(space.nebulaOld, 1);
  if (space.nebula) blit(space.nebula, space.fade);

  // 2. Far and mid stars, twinkling
  for (const s of space.stars) {
    if (s.layer === 2) continue;
    ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(time * s.tw + s.ph));
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }

  // 3. Shooting stars (skipped on LOW graphics)
  const hq = highQuality();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const s of hq ? space.shooting : []) {
    const a = s.life / s.max;
    const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
    ctx.stroke();
  }

  // 4. Planets
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.95;
  for (const p of space.planets) {
    const h = p.sprite.half;
    ctx.drawImage(p.sprite.canvas, p.x - h, p.y - h, h * 2, h * 2);
  }

  // 5. Near stars: glow + four-point sparkle
  ctx.globalCompositeOperation = 'lighter';
  for (const s of space.stars) {
    if (s.layer !== 2) continue;
    const tw = 0.6 + 0.4 * Math.sin(time * s.tw + s.ph);
    if (hq) drawGlow(s.color, s.x, s.y, s.size * 4, s.a * tw * 0.8);
    ctx.globalAlpha = s.a * tw * 0.6;
    ctx.fillStyle = s.color;
    const len = s.size * 4 * tw;
    ctx.fillRect(s.x - len, s.y - 0.5, len * 2, 1);
    ctx.fillRect(s.x - 0.5, s.y - len, 1, len * 2);
  }

  // 6. Space dust streaks (longer when traveling faster; skipped on LOW graphics)
  ctx.strokeStyle = 'rgba(180,210,255,0.14)';
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of hq ? space.dust : []) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x, d.y - d.len * space.speed);
  }
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
