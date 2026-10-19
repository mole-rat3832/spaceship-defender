'use strict';

/* =========================================================
   RENDER - draws one frame.

   Draw order (back to front):
     space background -> black hole -> course guide -> mothership
     -> meteors -> bullets -> defender -> particles -> HUD -> banners

   Two blend modes are used a lot:
     'source-over' - normal painting
     'lighter'     - adds colors together, so overlapping glows get
                     brighter. Used for engines, lasers, explosions.
   ========================================================= */

// Draw text in the pixel font with a soft glow.
function text(str, x, y, size, color, align = 'center', alpha = 1, glow = 6) {
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

// Squash/stretch an object toward the black hole (set in updateFinale).
function applyStretch(o) {
  if (!o.stretch) return;
  const s = o.stretch;
  ctx.translate(o.x, o.y);
  ctx.rotate(s.a);
  ctx.scale(s.sx, s.sy);
  ctx.rotate(-s.a);
  ctx.translate(-o.x, -o.y);
}

// ---------- Mothership ----------
function drawMother(mo) {
  if (mo.captured) return;
  const S = MOTHER_SPRITE;
  ctx.save();
  applyStretch(mo);
  ctx.translate(mo.x, mo.y);
  ctx.rotate(mo.a);

  // Engine plumes (they sputter while the ship is destabilized)
  ctx.globalCompositeOperation = 'lighter';
  const sputter = mo.destab > 0 && Math.random() < 0.45;
  if (!sputter) {
    for (const ex of [-8, 8]) {
      drawGlow('#ffb13d', ex, 40, 16, 0.7);
      const len = rand(14, 26);
      const grad = ctx.createLinearGradient(0, 36, 0, 36 + len);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.3, rgba('#ffb13d', 0.8));
      grad.addColorStop(1, rgba('#ff6a1a', 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ex - 4, 35);
      ctx.lineTo(ex, 35 + len);
      ctx.lineTo(ex + 4, 35);
      ctx.fill();
    }
  }

  // Hull sprite
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(motherSprite(), -S.ox, -S.oy, S.w, S.h);

  // Blinking navigation lights: red port, green starboard, white nose strobe
  ctx.globalCompositeOperation = 'lighter';
  const on = blink(1.2);
  drawGlow('#ff3b3b', -43, 23, 7, on ? 1 : 0.2);
  drawGlow('#3bff7a', 43, 23, 7, on ? 0.2 : 1);
  if (time % 1.5 < 0.08 && !settings.reduceFlash) drawGlow('#ffffff', 0, -54, 12, 1);

  // Red glow when hit
  if (mo.flash > 0) drawGlow(hud().danger, 0, 0, 80, mo.flash * (settings.reduceFlash ? 0.5 : 1.2));

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Defender ----------
function drawPlayer(p) {
  if (!p.alive || p.captured) return;
  const sk = skin();
  ctx.save();
  applyStretch(p);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a);

  // Engine glow + flame
  ctx.globalCompositeOperation = 'lighter';
  const thr = p.thrusting ? 1 : 0.35;
  drawGlow(sk.engine, -11, 0, 10 + thr * 8, 0.5 * thr + 0.2);
  if (p.thrusting) {
    const len = rand(12, 22);
    const grad = ctx.createLinearGradient(-9, 0, -10 - len, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.3, rgba(sk.engine, 0.8));
    grad.addColorStop(1, rgba(sk.engine, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-9, -3.5);
    ctx.lineTo(-10 - len, 0);
    ctx.lineTo(-9, 3.5);
    ctx.fill();
  }
  // Barrel glows red as the blaster heats up
  if (p.heat > 0.4) drawGlow('#ff5a3c', 16, 0, 6 + p.heat * 6, (p.heat - 0.4) * 1.2);

  // Hull (flickers while invulnerable)
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = p.invuln > 0 && !blink(14) ? 0.35 : 1;
  ctx.drawImage(shipSprite(progress.skin), -SHIP_SIZE / 2, -SHIP_SIZE / 2, SHIP_SIZE, SHIP_SIZE);

  // Shield bubble while invulnerable
  if (p.invuln > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(time * 8);
    ctx.strokeStyle = sk.trim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.stroke();
    drawGlow(sk.trim, 0, 0, 26, 0.15);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Shields (DEFLECTOR SHIELD / MOTHER SHIELD upgrades) ----------
function drawShieldBubble(x, y, r, color, charges) {
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(color, x, y, r * 1.3, 0.12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  // One dashed ring per charge
  ctx.setLineDash([3, 6]);
  for (let i = 0; i < charges; i++) {
    ctx.globalAlpha = 0.45 + 0.15 * Math.sin(time * 3 + i);
    ctx.lineDashOffset = time * (i % 2 ? -18 : 18);
    ctx.beginPath();
    ctx.arc(x, y, r + i * 5, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawShields() {
  const g = game;
  if (g.phase === 'blackhole' || g.phase === 'done') return;
  if (g.motherShield > 0 && !g.mother.captured) drawShieldBubble(g.mother.x, g.mother.y, 62, '#6fdcff', g.motherShield);
  const p = g.player;
  if (g.shield > 0 && p.alive && !p.captured) drawShieldBubble(p.x, p.y, 22, skin().trim, g.shield);
}

// ---------- Meteors ----------
// CLOAKED twist: real meteors fade in and out (hits and mines/crates stay visible).
function meteorFade(m) {
  if (mode === 'attract' || !game || !game.cfg.fx.cloak || m.harmless || m.decor) return 1;
  return clamp(0.45 + 0.8 * Math.sin(time * 1.5 + m.phase), 0.04, 1);
}

function drawMeteor(m) {
  const spr = m.sprite;
  const fade = meteorFade(m);
  ctx.save();
  applyStretch(m);
  ctx.translate(m.x, m.y);

  ctx.globalCompositeOperation = 'lighter';
  if (m.type === 'comet') {
    // Icy tail pointing away from the direction of travel
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const ux = m.vx / sp, uy = m.vy / sp;
    const tx = -ux * 110, ty = -uy * 110, w = m.r * 1.1;
    const grad = ctx.createLinearGradient(0, 0, tx, ty);
    grad.addColorStop(0, rgba('#bff4ff', 0.75));
    grad.addColorStop(0.3, rgba('#6fdcff', 0.35));
    grad.addColorStop(1, rgba('#6fdcff', 0));
    ctx.globalAlpha = fade;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-uy * w, ux * w);
    ctx.lineTo(tx, ty);
    ctx.lineTo(uy * w, -ux * w);
    ctx.fill();
    drawGlow('#9adfff', 0, 0, m.r * 3, 0.6 * fade);
  } else if (m.type === 'magma') {
    // Pulsing heat glow
    drawGlow('#ff6a1a', 0, 0, m.r * 1.8, (0.22 + 0.08 * Math.sin(time * 4 + m.x)) * fade);
  } else if (m.type === 'crate') {
    drawGlow('#5dff9e', 0, 0, 30, 0.35 + 0.15 * Math.sin(time * 5));
  }
  if (m.homing) {
    // Magnetic meteors: a purple aura with a rotating dashed ring
    drawGlow('#b48cff', 0, 0, m.r * 2, 0.35 * fade);
    ctx.globalAlpha = 0.7 * fade;
    ctx.strokeStyle = '#b48cff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 1.25, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.rotate(m.rot);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fade;
  ctx.drawImage(spr.canvas, -spr.half, -spr.half, spr.half * 2, spr.half * 2);

  // Glowing cracks once a multi-hit meteor is damaged
  const damage = 1 - m.hp / m.maxHp;
  if (damage > 0 && m.cracks.length) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.6 + 0.4 * damage) * fade;
    ctx.strokeStyle = METEOR_STYLE[m.type].crack || '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const crack of m.cracks) {
      crack.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    }
    ctx.stroke();
  }

  // Mines: blinking red warning light
  if (m.type === 'mine') {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ff4f5e', 0, 0, 16, blink(4) ? 0.9 : 0.25);
  }

  // White flash when hit
  if (m.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, m.flash * 8);
    ctx.drawImage(spr.canvas, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Bullets ----------
function drawBullets(bullets) {
  const col = skin().bullet;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const tx = b.x - b.vx * 0.025, ty = b.y - b.vy * 0.025;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    if (highQuality()) drawGlow(col, b.x, b.y, 9, 0.7);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Particles ----------
function drawParticles() {
  // Normal pass: smoke and debris
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.5;
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'smoke') {
      const s = p.size * (1.8 - a);
      ctx.globalAlpha = a * 0.3;
      ctx.drawImage(glowSprite('#5a5560'), p.x - s, p.y - s, s * 2, s * 2);
    } else if (p.kind === 'debris') {
      const c = (Math.cos(p.a) * p.len) / 2, s = (Math.sin(p.a) * p.len) / 2;
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x - c, p.y - s);
      ctx.lineTo(p.x + c, p.y + s);
      ctx.stroke();
    }
  }
  // Additive pass: sparks and shockwaves glow
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'spark') {
      drawGlow(p.color, p.x, p.y, p.size * (0.4 + 0.6 * a), a);
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5 * a + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(p.r0, p.r1, 1 - a), 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  for (const f of floaters) text(f.text, f.x, f.y, f.size, f.color, 'center', clamp(f.life / f.max, 0, 1), 4);
}

// ---------- Black hole ----------
// layer 'back' = glow, far half of the disk, horizon, photon ring
// layer 'front' = near half of the disk (drawn over everything else)
function drawBlackHole(bh, layer) {
  const r = bh.r;
  if (r < 0.5) return;

  const drawDisk = back => {
    ctx.globalCompositeOperation = 'lighter';
    for (const d of bh.disk) {
      if ((Math.sin(d.a) < 0) !== back) continue;
      const x = bh.x + Math.cos(d.a) * d.d * r;
      const y = bh.y + Math.sin(d.a) * d.d * r * 0.3; // squashed = disk seen at an angle
      const s = d.size * Math.max(0.6, r / 40);
      ctx.globalAlpha = 0.55 + 0.45 * (1.35 / d.d);
      ctx.fillStyle = d.c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  };

  if (layer === 'back') {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#6a3dff', bh.x, bh.y, r * 8, 0.18);
    drawGlow('#ff8a3d', bh.x, bh.y, r * 4.5, 0.35);
    drawDisk(true);
    // Gravity bends light from the far side of the disk up and over the hole
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#ffcf7a';
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, r * 1.45, 0, TAU);
    ctx.stroke();
    // Event horizon: nothing escapes, so it is pure black
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, r, 0, TAU);
    ctx.fill();
    // Photon ring hugging the horizon
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffe9c2';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, r * 1.04, 0, TAU);
    ctx.stroke();
  } else {
    drawDisk(false);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Course guide ----------
function drawCourseGuide() {
  if (!settings.guide || game.cfg.fx.blind) return; // SENSORS OFFLINE twist hides it
  const th = hud();
  const mo = game.mother;
  const md = maxDev();
  const frac = mo.dev / md;
  const cx = game.courseX, cy = game.courseY;

  // The course line (dashes scroll to show forward motion)
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 10]);
  ctx.lineDashOffset = -(time * 60 * space.speed) % 16;
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = th.fg;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, H);
  ctx.stroke();

  // Danger boundary: brightens as the mothership drifts toward it
  ctx.lineDashOffset = 0;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.15 + 0.55 * clamp((frac - 0.3) / 0.7, 0, 1);
  ctx.strokeStyle = th.danger;
  ctx.beginPath();
  ctx.arc(cx, cy, md, 0, TAU);
  ctx.stroke();

  // Line from the course point to the mothership when it's off course
  if (mo.dev > 6) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = frac > 0.65 ? th.danger : th.warn;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mo.x, mo.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crosshair on the course point
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = th.fg;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy + 10);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Arrows on the screen edge showing meteors about to fly in.
const ARROW_COLORS = { magma: '#ff8a4a', iron: '#cfe6ff', mine: '#ff4f5e', crate: '#5dff9e' };
function drawOffscreenWarnings() {
  if (!settings.arrows || game.cfg.fx.blind) return; // SENSORS OFFLINE twist hides them
  const th = hud();
  const alpha = blink(6) ? 1 : 0.5;
  for (const m of game.meteors) {
    if (m.decor || (m.x >= 0 && m.x <= W && m.y >= 0 && m.y <= H)) continue;
    const ex = clamp(m.x, 14, W - 14);
    const ey = clamp(m.y, 14, H - 14);
    const a = Math.atan2(m.vy, m.vx);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.homing ? '#b48cff' : ARROW_COLORS[m.type] || th.danger;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-6, 7);
    ctx.fill();
    ctx.restore();
  }
}

// Aiming reticle for MOUSE AIM controls.
function drawCrosshair() {
  const th = hud();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = th.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 10, 0, TAU);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(mouse.x + dx * 6, mouse.y + dy * 6);
    ctx.lineTo(mouse.x + dx * 15, mouse.y + dy * 15);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- Twist effects ----------

// GRAVITY WELL: the planet plus slowly turning rings that show its pull.
function drawWell(wl) {
  ctx.globalCompositeOperation = 'lighter';
  drawGlow('#b48cff', wl.x, wl.y, wl.r * 5, 0.25);
  ctx.strokeStyle = '#b48cff';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 10]);
  for (const [k, dir] of [[2.2, 1], [3.4, -1], [4.8, 1]]) {
    ctx.globalAlpha = 0.35 / k * 2;
    ctx.lineDashOffset = time * 20 * dir;
    ctx.beginPath();
    ctx.arc(wl.x, wl.y, wl.r * k, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const h = wl.sprite.half;
  ctx.drawImage(wl.sprite.canvas, wl.x - h, wl.y - h, h * 2, h * 2);
}

// SOLAR WIND: faint streaks racing across the screen in the wind's direction.
function drawWind(w) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ffd9a0';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const y = (i * 263) % H;
    const x = (((i * 211 + time * 420 * w.dir) % W) + W) % W;
    ctx.moveTo(x, y);
    ctx.lineTo(x - w.dir * (25 + (i % 5) * 8), y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// DARK SECTOR: cover the screen in darkness, then cut soft "light holes"
// around the ships, bullets and explosions using 'destination-out'.
let darkLayer = null;
function drawDarkness() {
  const g = game;
  if (!darkLayer) darkLayer = makeCanvas(W, H);
  const [dc, dg] = darkLayer;
  dg.globalCompositeOperation = 'source-over';
  dg.clearRect(0, 0, W, H);
  dg.fillStyle = 'rgba(0,0,6,0.94)';
  dg.fillRect(0, 0, W, H);
  dg.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    const grad = dg.createRadialGradient(x, y, r * 0.3, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = grad;
    dg.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (g.player.alive) hole(g.player.x, g.player.y, 190);
  hole(g.mother.x, g.mother.y, 150);
  for (const b of g.bullets) hole(b.x, b.y, 45);
  for (const p of particles) if (p.kind === 'ring') hole(p.x, p.y, p.r1 * 2 * (p.life / p.max));
  ctx.drawImage(dc, 0, 0, W, H);

  // Things that glow on their own still shine through the dark
  ctx.globalCompositeOperation = 'lighter';
  for (const m of g.meteors) {
    if (m.type === 'magma') drawGlow('#ff6a1a', m.x, m.y, m.r * 1.6, 0.5);
    else if (m.type === 'comet') drawGlow('#9adfff', m.x, m.y, m.r * 3, 0.6);
    else if (m.type === 'mine' && blink(4)) drawGlow('#ff4f5e', m.x, m.y, 14, 0.9);
    else if (m.type === 'crate') drawGlow('#5dff9e', m.x, m.y, 24, 0.6);
    else if (m.homing) drawGlow('#b48cff', m.x, m.y, m.r * 1.5, 0.4);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// EMP BURSTS: flickering static while the blaster is offline.
function drawEmpStatic() {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#6fdcff';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = rand(0.03, settings.reduceFlash ? 0.06 : 0.14);
    ctx.fillRect(0, rand(0, H), W, rand(1, 3));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
function drawHUD() {
  const g = game;
  const th = hud();
  const mo = g.mother;
  const p = g.player;

  // Dark fades behind the top and bottom bars so text stays readable over planets
  let grad = ctx.createLinearGradient(0, 0, 0, 80);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 80);
  grad = ctx.createLinearGradient(0, H - 70, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - 70, W, 70);

  // Top-left: score, best, credits
  const best = g.infinite ? progress.infiniteBest : progress.highScore;
  text(`SCORE ${pad(g.score, 6)}`, 20, 24, 14, th.fg, 'left');
  text(`BEST ${pad(Math.max(best, g.score), 6)}`, 20, 46, 9, th.fg, 'left', 0.6);
  text(`CR ${progress.credits}`, 20, 64, 9, th.warn, 'left', 0.9);

  // Top-right: level/sector and hull
  text(g.infinite ? `SECTOR ${pad(g.sector, 2)}` : `LEVEL ${pad(g.level, 2)}`, W - 20, 24, 14, th.fg, 'right');
  const hits = maxHits();
  text('HULL', W - 24 - hits * 24, 50, 9, th.fg, 'right', 0.6);
  const icon = shipSprite(progress.skin);
  for (let i = 0; i < hits; i++) {
    ctx.save();
    ctx.translate(W - 30 - i * 24, 50);
    ctx.rotate(-Math.PI / 2);
    ctx.globalAlpha = i < g.lives ? 1 : 0.18;
    ctx.drawImage(icon, -13, -13, 26, 26);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // The current twist, under the hull
  if (g.cfg.twistKey !== 'none') text(`TWIST: ${g.cfg.twist.label}`, W - 20, 70, 7, th.warn, 'right', 0.85);

  // SOLAR WIND direction (blinks just before it shifts)
  if (g.wind) {
    const arrows = g.wind.dir > 0 ? 'WIND >>>' : '<<< WIND';
    const shifting = g.wind.timer < 2;
    text(shifting ? 'WIND SHIFTING!' : arrows, W / 2, 74, 8, th.warn, 'center', shifting && !blink(4) ? 0.4 : 0.9);
  }

  // Top-center: course deviation meter
  const frac = clamp(mo.dev / maxDev(), 0, 1);
  const bw = 260, bx = W / 2 - bw / 2, by = 30;
  text('COURSE DEVIATION', W / 2, 16, 8, th.fg, 'center', 0.7);
  ctx.strokeStyle = rgba(th.fg, 0.7);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, 12);
  const blind = g.cfg.fx.blind;
  if (blind) {
    // SENSORS OFFLINE: the meter only shows static (the alarm still works!)
    ctx.fillStyle = th.fg;
    for (let i = 0; i < 12; i++) {
      ctx.globalAlpha = rand(0.2, 0.6);
      ctx.fillRect(bx + 2 + rand(0, bw - 14), by + 2, rand(3, 12), 8);
    }
  } else {
    const col = frac < 0.4 ? th.accent : frac < 0.7 ? th.warn : th.danger;
    ctx.globalAlpha = frac < 0.7 || blink(6) ? 1 : 0.4;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * frac, 8);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = th.fg;
  for (const t of [0.4, 0.7]) ctx.fillRect(bx + bw * t, by - 3, 1, 18);
  ctx.globalAlpha = 1;

  let status, scol, salpha = 1;
  if (g.phase === 'blackhole') {
    status = 'CAUGHT IN A GRAVITY WELL!';
    scol = th.danger;
  } else if (g.ending && g.ending.reason === 'course') {
    status = 'COURSE LOST';
    scol = th.danger;
  } else if (blind) {
    status = 'SENSORS OFFLINE';
    scol = th.warn;
  } else if (mo.destab > 0) {
    status = 'DESTABILIZED!';
    scol = th.danger;
    salpha = blink(5) ? 1 : 0.4;
  } else if (mo.dev > 4) {
    status = 'AUTOPILOT: RETURNING TO COURSE';
    scol = th.warn;
  } else {
    status = 'ON COURSE';
    scol = th.accent;
  }
  text(status, W / 2, 58, 8, scol, 'center', salpha);

  // Bottom-left: shield charges, then meteors left / distance
  const shields = [];
  if (up('shield')) shields.push(`SHIELD ${g.shield}`);
  if (up('mshield')) shields.push(`BARRIER ${g.motherShield}`);
  if (shields.length) text(shields.join('  '), 20, H - 40, 8, '#6fdcff', 'left', 0.8);
  if (g.infinite) text(`DISTANCE ${g.distance.toFixed(1)} LY`, 20, H - 20, 10, th.fg, 'left', 0.8);
  else if (g.phase === 'play' || g.phase === 'intro') text(`INCOMING ${pad(g.cfg.total - g.spawned, 2)}`, 20, H - 20, 10, th.fg, 'left', 0.8);

  // Bottom-center: blaster heat bar
  const hw = 200, hx = W / 2 - hw / 2, hy = H - 30;
  let label = 'BLASTER', lcol = th.fg, lalpha = 0.7;
  if (g.emp && g.emp.active > 0) {
    label = 'EMP! BLASTER OFFLINE';
    lcol = '#6fdcff';
    lalpha = blink(5) ? 1 : 0.5;
  } else if (g.emp && g.phase === 'play' && g.emp.timer < 1.5) {
    label = 'EMP INCOMING!';
    lcol = th.warn;
    lalpha = blink(6) ? 1 : 0.4;
  } else if (p.jammed) {
    label = `JAMMED! TAP ${keyLabel(keybinds.fix[0])} x${p.jamLeft}`;
    lcol = th.danger;
    lalpha = blink(4) ? 1 : 0.5;
  } else if (p.overheated) {
    label = 'OVERHEATED - COOLING';
    lcol = th.danger;
    lalpha = blink(3) ? 1 : 0.5;
  }
  text(label, W / 2, hy - 14, 8, lcol, 'center', lalpha);
  ctx.strokeStyle = rgba(p.jammed ? th.danger : th.fg, 0.7);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hx, hy, hw, 10);
  const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
  hg.addColorStop(0, '#4de1ff');
  hg.addColorStop(0.6, '#ffd84d');
  hg.addColorStop(1, '#ff4f5e');
  ctx.fillStyle = hg;
  ctx.globalAlpha = p.overheated && !blink(6) ? 0.4 : 1;
  ctx.fillRect(hx + 2, hy + 2, (hw - 4) * clamp(p.heat, 0, 1), 6);
  ctx.globalAlpha = 1;

  // Big jam warning above the ship itself
  if (p.jammed && p.alive) text(`${keyLabel(keybinds.fix[0])}!`, p.x, p.y - 30, 10, th.danger, 'center', blink(4) ? 1 : 0.4);

  // Bottom-right: key hints
  if (settings.hints) {
    text(`${keyLabel(keybinds.pause[0])} PAUSE  ${keyLabel(keybinds.fix[0])} FIX JAM`, W - 20, H - 20, 8, th.fg, 'right', 0.45);
  }
}

// ---------- Big center-screen messages ----------
function drawBanners() {
  const g = game;
  const th = hud();
  if (g.phase === 'intro') {
    const a = clamp(g.phaseTimer / 0.6, 0, 1);
    if (g.infinite) {
      text('INFINITE VOYAGE', W / 2, 170, 28, th.fg, 'center', a, 14);
      text('THE COURSE NEVER ENDS - HOW FAR CAN YOU GO?', W / 2, 214, 9, th.fg, 'center', a * 0.85);
    } else {
      text(`LEVEL ${g.level}`, W / 2, 160, 28, th.fg, 'center', a, 14);
      text(g.cfg.name, W / 2, 202, 16, th.accent, 'center', a, 10);
      text(`TWIST: ${g.cfg.twist.label}`, W / 2, 236, 11, th.warn, 'center', a, 8);
      text(g.cfg.twist.tip, W / 2, 260, 9, th.fg, 'center', a * 0.85);
    }
  } else if (g.phase === 'clear' && g.bonus) {
    text('LEVEL CLEAR', W / 2, 160, 28, th.fg, 'center', 1, 14);
    text(`COURSE BONUS  +${g.bonus.course}`, W / 2, 208, 12, th.fg);
    if (g.bonus.shield) text(`PERFECT DEFENSE  +${g.bonus.shield}`, W / 2, 232, 12, th.warn);
    else text(`MOTHERSHIP HITS  ${g.motherHits}`, W / 2, 232, 12, th.fg, 'center', 0.7);
    text(`+${g.bonus.credits} CREDITS`, W / 2, 256, 10, th.warn, 'center', 0.9);
  } else if (g.phase === 'blackhole') {
    const t = g.phaseTimer;
    const msg = t < 3.5 ? 'WARNING: GRAVITATIONAL ANOMALY' : t < 7 ? "WE'RE BEING PULLED IN!" : "THERE'S NO ESCAPE...";
    if (!g.blackHole.collapsing && (blink(3) || t >= 7)) text(msg, W / 2, H - 110, 16, th.danger, 'center', 1, 12);
  }
  if (g.infinite && g.sectorBanner > 0) {
    const a = clamp(g.sectorBanner, 0, 1);
    text(`SECTOR ${g.sector}`, W / 2, 180, 24, th.accent, 'center', a, 12);
    text(`BONUS +${g.sector * 100}`, W / 2, 214, 11, th.warn, 'center', a);
    text(`TWIST: ${g.cfg.twist.label}`, W / 2, 244, 11, th.warn, 'center', a, 8);
    text(g.cfg.twist.tip, W / 2, 266, 9, th.fg, 'center', a * 0.85);
  }
  if (g.ending && mode === 'game' && blink(4)) {
    const msg = g.ending.reason === 'course' ? 'MOTHERSHIP OFF COURSE!' : 'DEFENDER DESTROYED!';
    text(msg, W / 2, 200, 20, th.danger, 'center', 1, 12);
  }
}

// ---------- Whole scenes ----------
function drawGame() {
  const g = game;
  ctx.save();
  if (settings.shake && mode === 'game' && g.shake > 0.3) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
  if (g.blackHole) drawBlackHole(g.blackHole, 'back');
  if (g.well) drawWell(g.well);
  if (g.phase !== 'blackhole' && g.phase !== 'done') drawCourseGuide();
  drawMother(g.mother);
  g.meteors.forEach(drawMeteor);
  drawBullets(g.bullets);
  drawPlayer(g.player);
  drawShields();
  drawParticles();
  if (g.blackHole) drawBlackHole(g.blackHole, 'front');
  if (g.wind) drawWind(g.wind);
  ctx.restore();

  // Twist overlays sit on top of the world but under the HUD
  if (g.cfg.fx.dark && g.phase !== 'done') drawDarkness();
  drawFloaters();
  drawOffscreenWarnings();
  if (g.phase !== 'done') drawHUD();
  drawBanners();
  if (g.emp && g.emp.active > 0 && mode === 'game') drawEmpStatic();
  if (settings.controls === 'mouse' && mode === 'game' && mouse.inside) drawCrosshair();

  // Full-screen white flash (big hits, black hole collapse)
  if (g.flash > 0) {
    ctx.globalAlpha = g.flash * (settings.reduceFlash ? 0.35 : 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function drawAttract() {
  drawMother(attract.mother);
  attract.meteors.forEach(drawMeteor);
  drawPlayer(attract.ship);
  drawParticles();
}

function render() {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawSpace();
  if (mode === 'attract') drawAttract();
  else if (game) drawGame();

  if (settings.fps) text(`${fps} FPS`, W / 2, H - 8, 7, '#8dffb3', 'center', 0.8, 0);
}
