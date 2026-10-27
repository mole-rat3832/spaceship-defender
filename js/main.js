'use strict';

let viewScale = 1;
let fps = 60;
let lastSave = 0;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  viewScale = (rect.width * dpr) / W;
  canvas.width = Math.round(W * viewScale);
  canvas.height = Math.round(H * viewScale);
}

let last = performance.now();

function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = Math.round(lerp(fps, 1 / Math.max(realDt, 0.001), 0.05));
  const dt = Math.min(0.033, realDt);
  time += dt;

  if (mode !== 'paused') updateSpace(dt);

  if (mode === 'game') updateGame(dt * settings.gameSpeed);
  else if (mode === 'attract') updateAttract(dt);
  else if (mode === 'over') updateAfterlife(dt);

  render();

  $('wrap').classList.toggle('hide-cursor', mode === 'game' && settings.controls === 'mouse');

  if (Menu.current && Menu.current.id === 'menu-quests') $('quest-reset').textContent = timeUntilMidnight();

  if (progressDirty && time - lastSave > 2) {
    saveProgress();
    lastSave = time;
  }

  requestAnimationFrame(frame);
}

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
