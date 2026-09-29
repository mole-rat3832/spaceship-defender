'use strict';

/* =========================================================
   SPRITES - pre-drawn artwork.

   Drawing gradients, craters and shading is slow, so each
   ship / meteor / planet is painted ONCE onto its own small
   off-screen canvas (a "sprite"). Every frame the game just
   copies that sprite onto the screen, rotated into place.
   ========================================================= */

// ---------- Glow sprites ----------
// A soft round glow in a given color. Drawn with the 'lighter' blend
// mode it makes engines, lasers and explosions look bright.
const glowCache = new Map();

function glowSprite(color) {
  let c = glowCache.get(color);
  if (!c) {
    let g;
    [c, g] = makeCanvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.2, rgba(color, 0.55));
    grad.addColorStop(0.5, rgba(color, 0.14));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
  }
  return c;
}

// Draw a glow of radius r centered on (x, y). Set the blend mode before calling.
function drawGlow(color, x, y, r, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
}

// ---------- Defender ship ----------
// Points are in "ship space": the nose points toward +x.
const SHIP_HULL = [
  [17, 0], [6, -4], [-2, -6], [-7, -13], [-12, -13], [-9, -5],
  [-11, 0], [-9, 5], [-12, 13], [-7, 13], [-2, 6], [6, 4],
];
const SHIP_SIZE = 40; // sprite is 40x40 logical pixels, ship centered in it
const shipCache = {};

// One sprite per paint job, built the first time it is needed.
function shipSprite(skinId) {
  if (shipCache[skinId]) return shipCache[skinId];
  const sk = SKINS[skinId];
  const [c, g] = makeCanvas(SHIP_SIZE * SS, SHIP_SIZE * SS);
  g.scale(SS, SS);
  g.translate(SHIP_SIZE / 2, SHIP_SIZE / 2);

  // Hull: metallic gradient from top edge to bottom edge
  tracePath(g, SHIP_HULL);
  const grad = g.createLinearGradient(0, -13, 0, 13);
  grad.addColorStop(0, shade(sk.hull, -0.45));
  grad.addColorStop(0.4, sk.hull);
  grad.addColorStop(0.55, shade(sk.hull, 0.3));
  grad.addColorStop(1, shade(sk.hull, -0.55));
  g.fillStyle = grad;
  g.fill();

  // Colored wing stripes
  g.fillStyle = sk.trim;
  tracePath(g, [[-2, -6], [-7, -13], [-9.5, -13], [-4.5, -6]]);
  g.fill();
  tracePath(g, [[-2, 6], [-7, 13], [-9.5, 13], [-4.5, 6]]);
  g.fill();
  g.fillRect(-9, -1, 5, 2);

  // Cockpit glass
  const glass = g.createLinearGradient(2, -3, 8, 3);
  glass.addColorStop(0, '#ffffff');
  glass.addColorStop(0.35, sk.cockpit);
  glass.addColorStop(1, shade(sk.cockpit, -0.6));
  g.fillStyle = glass;
  g.beginPath();
  g.ellipse(5, 0, 4.5, 2.4, 0, 0, TAU);
  g.fill();

  // Thin bright outline
  tracePath(g, SHIP_HULL);
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 0.8;
  g.stroke();

  shipCache[skinId] = c;
  return c;
}

// ---------- Mothership ----------
// Points are in "mothership space": the nose points up (-y).
const MOTHER_HULL = [
  [0, -56], [9, -46], [13, -26], [16, -8], [40, 6], [44, 24], [18, 22], [15, 34],
  [-15, 34], [-18, 22], [-44, 24], [-40, 6], [-16, -8], [-13, -26], [-9, -46],
];
const MOTHER_SPRITE = { w: 100, h: 104, ox: 50, oy: 58 }; // ox/oy = where the ship's center is inside the sprite
let motherCanvas = null;

function motherSprite() {
  if (motherCanvas) return motherCanvas;
  const { w, h, ox, oy } = MOTHER_SPRITE;
  const [c, g] = makeCanvas(w * SS, h * SS);
  g.scale(SS, SS);
  g.translate(ox, oy);

  // Hull: a left-to-right metallic gradient makes it look like a rounded cylinder
  tracePath(g, MOTHER_HULL);
  const metal = g.createLinearGradient(-44, 0, 44, 0);
  metal.addColorStop(0, '#343b47');
  metal.addColorStop(0.35, '#c3ccd8');
  metal.addColorStop(0.5, '#eef3f8');
  metal.addColorStop(0.65, '#b3bcc8');
  metal.addColorStop(1, '#2e3440');
  g.fillStyle = metal;
  g.fill();
  // ...and a top-to-bottom gradient darkens the back end
  const depth = g.createLinearGradient(0, -56, 0, 34);
  depth.addColorStop(0, 'rgba(255,255,255,0.15)');
  depth.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = depth;
  g.fill();

  // Orange wing stripes
  g.fillStyle = '#ff9a2e';
  tracePath(g, [[17, -2], [38, 9], [40, 15], [17, 7]]);
  g.fill();
  tracePath(g, [[-17, -2], [-38, 9], [-40, 15], [-17, 7]]);
  g.fill();

  // Panel lines
  g.strokeStyle = 'rgba(20,25,35,0.5)';
  g.lineWidth = 0.8;
  g.beginPath();
  for (const y of [-30, -12, 10, 26]) {
    const half = y < -8 ? 11 : 15;
    g.moveTo(-half, y);
    g.lineTo(half, y);
  }
  g.moveTo(0, -24);
  g.lineTo(0, 32);
  g.stroke();

  // Bridge window
  const glass = g.createLinearGradient(0, -48, 0, -32);
  glass.addColorStop(0, '#c8fbff');
  glass.addColorStop(1, '#1b4a66');
  g.fillStyle = glass;
  g.beginPath();
  g.ellipse(0, -40, 4, 7, 0, 0, TAU);
  g.fill();

  // Rows of lit cabin windows
  g.fillStyle = '#ffe9a8';
  for (let y = -22; y <= 18; y += 8) {
    g.fillRect(-8, y, 2, 2);
    g.fillRect(6, y, 2, 2);
  }

  // Engine housings
  g.fillStyle = '#20252e';
  g.fillRect(-12, 30, 8, 6);
  g.fillRect(4, 30, 8, 6);

  // Outline
  tracePath(g, MOTHER_HULL);
  g.strokeStyle = 'rgba(230,240,255,0.75)';
  g.lineWidth = 1.2;
  g.stroke();

  motherCanvas = c;
  return c;
}

// ---------- Meteors ----------
// Each meteor gets its own sprite because every meteor has a unique
// random outline (m.shape) and random craters.
function buildMeteorSprite(m) {
  const st = METEOR_STYLE[m.type];
  const half = m.r * 1.08 + 3;
  const [c, g] = makeCanvas(half * 2 * SS, half * 2 * SS);
  g.scale(SS, SS);
  g.translate(half, half);

  // Body: lit from the top-left
  tracePath(g, m.shape);
  const body = g.createRadialGradient(-m.r * 0.35, -m.r * 0.4, m.r * 0.1, 0, 0, m.r * 1.1);
  body.addColorStop(0, st.light);
  body.addColorStop(0.45, st.base);
  body.addColorStop(1, st.dark);
  g.fillStyle = body;
  g.fill();

  // Everything below is clipped to the meteor's outline
  g.save();
  tracePath(g, m.shape);
  g.clip();

  // Craters: a dark dip with a lit lower-right rim
  const craters = m.type === 'comet' ? 2 : 2 + m.size * 2;
  for (let i = 0; i < craters; i++) {
    const a = rand(0, TAU);
    const d = rand(0, m.r * 0.55);
    const cr = rand(0.1, 0.22) * m.r;
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.arc(cx, cy, cr, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, cr, -0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
  }

  if (m.type === 'iron') {
    // Shiny metallic streaks
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const o = rand(-m.r, m.r);
      g.beginPath();
      g.moveTo(-m.r, o - m.r * 0.5);
      g.lineTo(m.r, o + m.r * 0.5);
      g.stroke();
    }
  }

  if (st.vein) {
    // Glowing veins (magma) or icy streaks (comet)
    g.strokeStyle = rgba(st.vein, 0.6);
    g.lineWidth = 1.2;
    for (let i = 0; i < 2 + m.size; i++) {
      let x = rand(-m.r * 0.5, m.r * 0.5), y = rand(-m.r * 0.5, m.r * 0.5), a = rand(0, TAU);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        a += rand(-0.8, 0.8);
        x += Math.cos(a) * m.r * 0.22;
        y += Math.sin(a) * m.r * 0.22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.restore();

  tracePath(g, m.shape);
  g.strokeStyle = rgba(st.edge, 0.55);
  g.lineWidth = 1.2;
  g.stroke();

  return { canvas: c, half };
}

// ---------- Planets ----------
const PLANET_KINDS = [
  { kind: 'gas',   colors: ['#d9a066', '#b5763f', '#f0d2a0', '#8f5a33'], atm: '#ffc98a', ring: '#e8d8b8' },
  { kind: 'gas',   colors: ['#7fa8d9', '#4f6fb5', '#bcd4f0', '#39508a'], atm: '#9fc6ff', ring: '#cfe0ff' },
  { kind: 'gas',   colors: ['#c98fd9', '#8a4fb5', '#f0c9f5', '#5a2f7a'], atm: '#e0a8ff', ring: '#f0d8ff' },
  { kind: 'rocky', colors: ['#9a8f86', '#6e645c', '#c2b8ae'],            atm: '#d8d0c8', ring: '#c8c0b8' },
  { kind: 'lava',  colors: ['#3a1a14', '#1e0c0a', '#ff6a1a'],            atm: '#ff7a3d', ring: '#ffb08a' },
  { kind: 'ice',   colors: ['#d6f1ff', '#9fd0ea', '#ffffff'],            atm: '#bff0ff', ring: '#e6f8ff' },
  { kind: 'ocean', colors: ['#1f5fa8', '#2f8a4a', '#ffffff'],            atm: '#7fc8ff', ring: '#d0ecff' },
];

// Rings are drawn in two halves: the back half before the planet and
// the front half after it, so the planet looks like it sits inside the ring.
function drawPlanetRing(g, r, tilt, def, front) {
  g.save();
  g.rotate(tilt);
  const start = front ? 0 : Math.PI;
  const end = front ? Math.PI : TAU;
  for (const [k, lw, a] of [[1.35, 3, 0.35], [1.55, 5, 0.5], [1.8, 3, 0.3], [2.0, 2, 0.2]]) {
    g.strokeStyle = rgba(def.ring, a);
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(0, 0, r * k, r * k * 0.28, 0, start, end);
    g.stroke();
  }
  g.restore();
}

function buildPlanetSprite(def, r, ringed) {
  const half = r + (ringed ? r * 1.15 : r * 0.35);
  const [c, g] = makeCanvas(half * 2 * SS, half * 2 * SS);
  g.scale(SS, SS);
  g.translate(half, half);
  const tilt = rand(-0.5, 0.5);

  if (ringed) drawPlanetRing(g, r, tilt, def, false);

  // Soft atmosphere glow around the rim
  const atm = g.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.3);
  atm.addColorStop(0, rgba(def.atm, 0.35));
  atm.addColorStop(1, rgba(def.atm, 0));
  g.fillStyle = atm;
  g.beginPath();
  g.arc(0, 0, r * 1.3, 0, TAU);
  g.fill();

  // Surface details, clipped to the planet disc
  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.clip();
  g.fillStyle = def.colors[0];
  g.fillRect(-r, -r, r * 2, r * 2);

  if (def.kind === 'gas') {
    // Wavy cloud bands
    for (let y = -r; y < r; y += rand(3, 9)) {
      const bandH = rand(2, 8);
      const phase = rand(0, TAU);
      g.fillStyle = rgba(pick(def.colors), rand(0.25, 0.7));
      g.beginPath();
      g.moveTo(-r, y);
      for (let x = -r; x <= r; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + phase) * 1.5);
      g.lineTo(r, y + bandH);
      g.lineTo(-r, y + bandH);
      g.fill();
    }
    // A big storm spot
    g.fillStyle = rgba(def.colors[3], 0.7);
    g.beginPath();
    g.ellipse(rand(-r * 0.4, r * 0.4), rand(-r * 0.4, r * 0.4), r * 0.18, r * 0.09, 0, 0, TAU);
    g.fill();
  } else if (def.kind === 'ocean') {
    // Continents...
    for (let i = 0; i < 6; i++) {
      const cx = rand(-r, r), cy = rand(-r, r), cr = rand(r * 0.15, r * 0.4);
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        pts.push([cx + Math.cos(a) * cr * rand(0.6, 1.1), cy + Math.sin(a) * cr * rand(0.6, 1.1)]);
      }
      tracePath(g, pts);
      g.fillStyle = def.colors[1];
      g.fill();
    }
    // ...and swirling clouds
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.ellipse(rand(-r, r), rand(-r, r), rand(r * 0.1, r * 0.35), rand(r * 0.03, r * 0.07), rand(-0.3, 0.3), 0, TAU);
      g.fill();
    }
  } else {
    // Rocky / lava / ice worlds: craters
    for (let i = 0; i < 16; i++) {
      const cx = rand(-r, r), cy = rand(-r, r), cr = rand(r * 0.04, r * 0.16);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.arc(cx, cy, cr, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, cr, -0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
    }
    if (def.kind === 'lava' || def.kind === 'ice') {
      // Glowing lava rivers or icy cracks
      g.strokeStyle = def.kind === 'lava' ? rgba('#ff6a1a', 0.75) : 'rgba(255,255,255,0.4)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        let x = rand(-r, r), y = rand(-r, r), a = rand(0, TAU);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          a += rand(-0.7, 0.7);
          x += Math.cos(a) * r * 0.12;
          y += Math.sin(a) * r * 0.12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  }

  // Day/night shading: light comes from the top-left
  const sh = g.createRadialGradient(-r * 0.45, -r * 0.45, r * 0.1, -r * 0.2, -r * 0.2, r * 1.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)');
  sh.addColorStop(0.35, 'rgba(0,0,0,0)');
  sh.addColorStop(0.75, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0.92)');
  g.fillStyle = sh;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();

  // Thin bright rim on the lit side
  g.strokeStyle = rgba(def.atm, 0.45);
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r - 0.5, Math.PI * 0.9, Math.PI * 1.6);
  g.stroke();

  if (ringed) drawPlanetRing(g, r, tilt, def, true);

  return { canvas: c, half };
}

// ---------- Space mine (MINEFIELD twist) ----------
// A dark sphere with spikes. The blinking light is drawn live in render.js.
let mineCache = null;
function mineSprite() {
  if (mineCache) return mineCache;
  const half = 22;
  const [c, g] = makeCanvas(half * 2 * SS, half * 2 * SS);
  g.scale(SS, SS);
  g.translate(half, half);

  // Spikes
  g.strokeStyle = '#8a8f99';
  g.lineWidth = 2.5;
  g.fillStyle = '#c9ced8';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
    g.stroke();
    g.beginPath();
    g.arc(Math.cos(a) * 18, Math.sin(a) * 18, 2, 0, TAU);
    g.fill();
  }
  // Body
  const body = g.createRadialGradient(-4, -4, 1, 0, 0, 12);
  body.addColorStop(0, '#9aa0ab');
  body.addColorStop(0.5, '#4a4f5a');
  body.addColorStop(1, '#16181d');
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, 11, 0, TAU);
  g.fill();
  // Red warning band
  g.strokeStyle = '#ff4f5e';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 7, 0, TAU);
  g.stroke();

  mineCache = { canvas: c, half };
  return mineCache;
}

// ---------- Supply crate (SUPPLY RUN twist) ----------
let crateCache = null;
function crateSprite() {
  if (crateCache) return crateCache;
  const half = 16;
  const [c, g] = makeCanvas(half * 2 * SS, half * 2 * SS);
  g.scale(SS, SS);
  g.translate(half, half);

  const metal = g.createLinearGradient(-11, -11, 11, 11);
  metal.addColorStop(0, '#9fb5a8');
  metal.addColorStop(0.5, '#4d6358');
  metal.addColorStop(1, '#1e2a24');
  g.fillStyle = metal;
  g.fillRect(-11, -11, 22, 22);
  g.strokeStyle = '#c8ffe0';
  g.lineWidth = 1.2;
  g.strokeRect(-11, -11, 22, 22);
  // Glowing green cross
  g.fillStyle = '#5dff9e';
  g.fillRect(-2.5, -7, 5, 14);
  g.fillRect(-7, -2.5, 14, 5);

  crateCache = { canvas: c, half };
  return crateCache;
}

// ---------- Gravity-well planet (GRAVITY WELL twist) ----------
const WELL_PLANET = { kind: 'rocky', colors: ['#3a2a5a', '#241a3a', '#6a4a9a'], atm: '#b48cff', ring: '#d0b8ff' };
