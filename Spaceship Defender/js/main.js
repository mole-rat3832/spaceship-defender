'use strict';

/* =========================================================
   MAIN - boots the game and runs the game loop.

   The loop runs about 60 times a second via
   requestAnimationFrame. Each frame it:
     1. works out dt (seconds since the last frame)
     2. updates whatever is active (game, menu demo, background)
     3. draws everything (render.js)
   ========================================================= */

let viewScale = 1; // canvas pixels per logical pixel (see resize)
let fps = 60;
let lastSave = 0;

// Match the canvas's real pixel size to how big it is on screen (and the
// screen's pixel density) so everything stays crisp at any window size.
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  viewScale = (rect.width * dpr) / W;
  canvas.width = Math.round(W * viewScale);
  canvas.height = Math.round(H * viewScale);
}

let last = performance.now();

function frame(now) {
  // dt is capped so a lag spike (or a background tab) can't make things teleport
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = Math.round(lerp(fps, 1 / Math.max(realDt, 0.001), 0.05));
  const dt = Math.min(0.033, realDt);
  time += dt;

  if (mode !== 'paused') updateSpace(dt);

  if (mode === 'game') updateGame(dt * settings.gameSpeed); // GAME SPEED setting slows the action
  else if (mode === 'attract') updateAttract(dt);
  else if (mode === 'over') updateAfterlife(dt);

  render();

  // Hide the system cursor while aiming with the mouse (a crosshair is drawn instead)
  $('wrap').classList.toggle('hide-cursor', mode === 'game' && settings.controls === 'mouse');

  // Keep the quest countdown ticking while that screen is open
  if (Menu.current && Menu.current.id === 'menu-quests') $('quest-reset').textContent = timeUntilMidnight();

  // Write save data at most every 2 seconds
  if (progressDirty && time - lastSave > 2) {
    saveProgress();
    lastSave = time;
  }

  requestAnimationFrame(frame);
}

// ---------- Boot ----------
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
window.addEventListener('beforeunload', () => progressDirty && saveProgress());

applySettings();
renderSettings();
buildBindRows();
resize();
ensureDaily();
initSpace();
initAttract();
Menu.show('menu-main');
requestAnimationFrame(frame);
