'use strict';

/* =========================================================
   SOUND - every sound effect is synthesized live with the
   Web Audio API, so there are no audio files to load.

   Two building blocks make everything:
     tone()  - a beep from an oscillator, optionally sliding in pitch
     noise() - filtered white noise (explosions, hiss, rumble)

   Browsers only allow audio after the player interacts with
   the page, so init() is called on the first key press/click.
   ========================================================= */

const Sound = {
  ac: null,          // AudioContext
  master: null,      // master volume node
  noiseBuf: null,    // 1 second of white noise, reused by noise()
  thrustGain: null,  // volume of the looping engine rumble
  thrustOn: false,

  init() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.connect(this.ac.destination);

      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // A looping low rumble that fades in while the defender thrusts.
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 450;
      this.thrustGain = this.ac.createGain();
      this.thrustGain.gain.value = 0;
      src.connect(filter);
      filter.connect(this.thrustGain);
      this.thrustGain.connect(this.master);
      src.start();
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    this.applyVolume();
  },

  applyVolume() {
    if (this.master) this.master.gain.value = settings.sound ? (settings.volume / 100) * 0.6 : 0;
  },

  // Play a beep. freq in Hz, dur in seconds. `to` slides the pitch.
  tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0 } = {}) {
    if (!this.ac || !settings.sound) return;
    const t = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const gain = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // Play a burst of noise through a low-pass filter. Lower freq = deeper sound.
  noise(dur, { vol = 0.3, freq = 1000, delay = 0 } = {}) {
    if (!this.ac || !settings.sound) return;
    const t = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  },

  setThrust(on) {
    on = on && settings.sound;
    if (!this.thrustGain || on === this.thrustOn) return;
    this.thrustOn = on;
    this.thrustGain.gain.setTargetAtTime(on ? 0.2 : 0, this.ac.currentTime, 0.04);
  },

  // ---------- Named effects used by the game ----------
  shoot()      { this.tone(900, 0.09, { vol: 0.1, to: 250 }); },
  explode(sz)  { this.noise(0.15 + sz * 0.12, { vol: 0.25 + sz * 0.08, freq: 2200 - sz * 550 }); },
  clink()      { this.tone(1500, 0.07, { type: 'triangle', vol: 0.12, to: 900 }); },
  motherHit()  { this.noise(0.5, { vol: 0.4, freq: 350 }); this.tone(160, 0.5, { type: 'sawtooth', vol: 0.16, to: 45 }); },
  playerHit()  { this.noise(0.9, { vol: 0.45, freq: 900 }); this.tone(500, 0.8, { type: 'sawtooth', vol: 0.2, to: 30 }); },
  alarm()      { this.tone(1000, 0.1, { vol: 0.07 }); this.tone(760, 0.1, { vol: 0.07, delay: 0.12 }); },
  beat(high)   { this.tone(high ? 62 : 52, 0.11, { vol: 0.35 }); }, // the classic arcade "heartbeat"
  blip()       { this.tone(520, 0.05, { vol: 0.07 }); },
  select()     { this.tone(660, 0.06, { vol: 0.09 }); this.tone(990, 0.08, { vol: 0.09, delay: 0.06 }); },
  jam()        { this.noise(0.12, { vol: 0.35, freq: 1800 }); this.tone(90, 0.18, { vol: 0.25, to: 60 }); },
  dryFire()    { this.tone(1800, 0.03, { vol: 0.08 }); },
  fixTap()     { this.noise(0.05, { vol: 0.25, freq: 3000 }); this.tone(300, 0.05, { vol: 0.1 }); },
  unjam()      { this.tone(500, 0.07, { vol: 0.12 }); this.tone(900, 0.1, { vol: 0.12, delay: 0.07 }); },
  overheat()   { this.noise(0.6, { vol: 0.25, freq: 5000 }); this.tone(1200, 0.3, { type: 'sawtooth', vol: 0.08, to: 400 }); },
  buy()        { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.1, { vol: 0.12, delay: i * 0.07 })); },
  error()      { this.tone(140, 0.2, { type: 'sawtooth', vol: 0.15 }); },
  quest()      { [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); },
  levelStart() { [392, 523, 659].forEach((f, i) => this.tone(f, 0.12, { vol: 0.1, delay: i * 0.09 })); },
  levelClear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, { vol: 0.12, delay: i * 0.1 })); },
  victory()    { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.14, delay: i * 0.13 })); },
  gameOver()   { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.14, delay: i * 0.22 })); },
  courseLost() { this.tone(700, 1.4, { type: 'sawtooth', vol: 0.14, to: 60 }); },
  windShift()  { this.noise(1.2, { vol: 0.2, freq: 700 }); },
  emp()        { this.tone(80, 0.6, { type: 'sawtooth', vol: 0.2, to: 40 }); this.noise(0.5, { vol: 0.3, freq: 6000 }); },
  blackHole()  { this.tone(55, 9, { type: 'sawtooth', vol: 0.2, to: 22 }); this.noise(9, { vol: 0.25, freq: 180 }); },
  swallowed()  { this.tone(400, 0.9, { type: 'sine', vol: 0.2, to: 40 }); },
  collapse()   { this.tone(30, 2.5, { type: 'sine', vol: 0.4, to: 900 }); this.noise(2.5, { vol: 0.3, freq: 6000 }); },
};
