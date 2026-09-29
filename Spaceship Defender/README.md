# Spaceship Defender

An Atari-style arcade shooter with a twist: you aren't just surviving, you're **escorting a mothership**. Meteors don't destroy it, they knock it **off course**. Let it drift too far and the mission fails. Your little defender ship can only take 3 hits.

Built with plain HTML, CSS and JavaScript. No frameworks, no build step and no image or audio files: everything is drawn on a `<canvas>` and every sound is synthesized with the Web Audio API.

## Play it

- **Locally:** download or clone the repo and double-click `index.html`. No server needed.
- **GitHub Pages:** in the repo's *Settings → Pages*, choose "Deploy from a branch", pick your main branch and the root folder. The game will be live at `https://<your-username>.github.io/<repo-name>/`.

## Features

- **Protect the mothership:** hits push it off course and spin it out. After a moment its autopilot steers it back.
- **25 mission levels, each with its own twist** (see [the level list](#levels)), ending in a **black hole finale**.
- **Infinite Voyage:** an endless mode where the course never ends. Travel through sectors and rack up score as the meteor belt gets harder. Each new sector rolls a random twist.
- **Meteor types:**
  - rock: 1 hit
  - magma: 2 hits
  - iron: several hits, pushes hard
  - comet: small and fast
  - giant: huge and tough, splits into large meteors
  - magnetic: steers toward the mothership
- **Special objects:** space mines (shoot them to blow up everything nearby) and supply crates (hull repair, coolant or credits).
- **Blaster heat and jamming:** spamming fire overheats your blaster, and a hot blaster can jam. Tap **F** to clear it.
- **Hangar shop:** spend the credits you earn on upgrades and paint jobs.
  - Upgrades: hull, fire rate, heat sinks, jam guard, twin blasters, engines, mothership stabilizers and armor.
  - Paint jobs: 5 color schemes for your ship.
- **Daily quests:** three new goals every day, worth bonus credits.
- **Graphics:** scrolling nebulas, planets, twinkling stars, shooting stars, and glowing explosions.
- **Controls:** three control styles (Classic, Direct and Mouse Aim) and fully **rebindable keys**, including mouse buttons.
- **Lots of settings:**
  - Gameplay: difficulty, game speed, auto-fire, auto-pause.
  - Graphics: quality, reduce flashing, CRT effect, FPS counter, fullscreen.
  - Audio: volume, plus toggles for the course alarm and heartbeat sounds.

## Controls (defaults)

| Action | Keys |
| --- | --- |
| Move / thrust | `W A S D` or arrow keys |
| Fire | `Space` or left mouse button |
| Fix a jammed blaster | `F` (tap it) |
| Pause | `P` or `Esc` |

**Control styles** (*Settings → Controls*):

- **Classic:** left/right rotate the ship, up thrusts, down brakes. This is how the original arcade game played.
- **Direct:** the ship moves in the direction you press and faces the way it's moving.
- **Mouse Aim:** move with the keys, aim with the mouse, left-click to fire.

Every key can be changed in *Settings → Controls → Customize Keys*.

## Levels

The game gets steadily harder from level to level, and each level adds its own **twist**.

| # | Level | Twist | What it does |
| --- | --- | --- | --- |
| 1 | First Contact | Basic Training | Only plain rocks. Learn the ropes. |
| 2 | Ember Drift | Magma Field | Lots of magma meteors (2 hits each). |
| 3 | Sunside | Heat Wave | Your blaster heats up 60% faster. |
| 4 | Iron Rain | Iron Rain | Lots of iron meteors: extra hits, harder pushes. |
| 5 | Narrow Pass | Head-On | Every meteor comes from straight ahead. |
| 6 | Comet Tail | Comet Storm | Tiny, very fast comets. |
| 7 | Solar Gale | Solar Wind | A sideways wind pushes everything, and it changes direction. |
| 8 | The Void | Dark Sector | You can only see near your ships, bullets and explosions. |
| 9 | Crossfire | Crossfire | Meteors arrive in pairs from opposite sides. |
| 10 | Static Field | Ion Storm | Your blaster jams 3x more often. |
| 11 | Heavy World | Gravity Well | A dense planet bends meteor paths. Don't crash into it. |
| 12 | Shatter Belt | Splitters | Meteors break into 3 pieces instead of 2. |
| 13 | Pulse Zone | EMP Bursts | EMP blasts knock your blaster offline every few seconds. |
| 14 | Minefield | Minefield | Mines drift through. Shoot them to blow up nearby meteors. |
| 15 | Rapids | Swift Current | Fewer meteors, but 40% faster. |
| 16 | Supply Line | Supply Run | Crates float by with repairs, coolant and credits. |
| 17 | Ghost Run | Sensors Offline | No course guide, no radar arrows, and static on the course meter. |
| 18 | Titans | Giants | Huge meteors that take extra hits. |
| 19 | Ice Slide | Zero Drag | Your ship barely slows down. |
| 20 | Limping Home | Weak Hull | The mothership's safe zone is 30% smaller. |
| 21 | Starfall | Meteor Shower | Quiet stretches, then a shower of small meteors from one side. |
| 22 | Slalom | Course Change | The course weaves left and right, so you defend a moving target. |
| 23 | Lodestone | Magnetic | Purple magnetic meteors home in on the mothership. |
| 24 | The Gauntlet | The Gauntlet | A bit of everything at once. |
| 25 | Event Horizon | Event Horizon | A black hole pulls on the meteors... and then on everything else. |

Twists are defined in the `TWISTS` table in `js/core/config.js`. Each one is a bundle of *mods*: some change the spawn rules (speed, count, sides, sizes), and others switch on effects that `js/game/game.js` handles in `updateTwists()`. To make a new level, add a twist (or reuse one) and add an entry to `LEVELS`.

## Project structure

```
index.html            All the menus (HTML) + the <canvas> + script tags
css/
  styles.css          Menu styling (the game itself is drawn on the canvas)
js/
  core/
    utils.js          Constants (world size), math/color helpers, localStorage wrapper
    config.js         Tunable numbers: settings, difficulty, levels, upgrades, paint jobs, meteors
    progress.js       Save data, credits, upgrade effects, daily quests
  audio/
    sound.js          Synthesized sound effects (Web Audio API)
  gfx/
    sprites.js        Pre-drawn art for the ships, meteors and planets
    space.js          Scrolling background: nebula, stars, planets, shooting stars
  game/
    entities.js       Creates game objects; particles and floating text
    game.js           Game rules: movement, collisions, levels, infinite mode, black hole finale
    render.js         Draws the game world and the HUD
  ui/
    menu.js           Menu navigation, settings pages, key rebinding, shop, quests, pop-ups
  input.js            Keyboard + mouse handling and the key-binding table
  main.js             Starts everything and runs the game loop
```

The scripts are plain `<script>` tags, not ES modules. Browsers block modules on `file://` pages, and plain scripts keep the game playable by double-clicking `index.html`. All scripts share one global scope, so **the order of the `<script>` tags matters**: a file can use anything defined in the files loaded before it.

## How it works

### The game loop

`main.js` calls `frame()` about 60 times a second. Each frame it works out `dt`, the seconds since the last frame, and moves everything by `speed × dt`, so the game runs at the same speed on fast and slow computers. Then it calls `render()` to draw.

The whole app is in one **mode** at a time: `attract` (main menu), `game`, `paused` or `over`. Inside a game, each level moves through **phases**: `intro` → `play` → `clear`, plus `blackhole` for the level 25 finale.

### Keeping the mothership on course

The mothership has a *course point* (the center of the screen). When a meteor hits it:

1. The ship gets a shove in the direction the meteor was traveling, plus some spin.
2. It's **destabilized** for a couple of seconds: the autopilot is offline and it just drifts.
3. Then the autopilot comes back and acts like a spring, pulling it back to the course point.

If it ever drifts farther than the allowed distance (`maxDev` in `config.js`, which depends on difficulty), the game is over. Heavier meteors push harder, and the shop's *Stabilizers* and *Armor* upgrades reduce the drift time and the push.

### Blaster heat and jams

Every shot adds heat. Heat drains slowly while you keep firing and faster once you stop. At 100% the blaster **overheats** and locks until it cools to 30%. Every shot also has a small chance to **jam**, and the chance grows the hotter the blaster is. A jammed blaster won't fire until you tap the fix key a few times. All of these numbers are in `blasterStats()` in `progress.js`.

### Daily quests

Quests are picked with a random number generator **seeded with today's date**. Everyone gets the same three quests each day, and reloading the page can't re-roll them. The game reports progress by calling `questEvent('kill')`, `questEvent('jams')` and so on.

### Graphics

Detailed art like gradients, craters and planet bands would be slow to draw from scratch every frame. So each ship, meteor and planet is painted **once** onto a small hidden canvas (a sprite), then copied onto the screen each frame. Glowing effects use the `'lighter'` blend mode, which adds colors together so overlapping lights get brighter.

### Saving

Settings, key bindings, progress, credits, upgrades and quests are all saved in the browser's `localStorage`. *Settings → Reset Progress* wipes the game progress.

## Tweaking the game

Most balance changes only need `js/core/config.js`:

- `DIFFICULTY`: how far the mothership may drift and how hard meteors push.
- `levelConfig()`: meteor count, speed, spawn rate and which types appear, per level.
- `TWISTS` / `LEVELS`: each level's name and twist.
- `infiniteConfig()`: how quickly Infinite Voyage ramps up.
- `UPGRADES` / `SKINS`: shop prices and paint-job colors.
- `SCORE` / `CREDIT`: points and credits per meteor.

## Credits

- Font: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38, served by Google Fonts (SIL Open Font License).
- Inspired by Atari's *Asteroids* (1979).

## License

Released under the [MIT License](LICENSE). You're free to use, copy, modify and share this game, as long as the license notice stays with it.
