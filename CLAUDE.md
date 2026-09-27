# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev        # Start Vite dev server on port 3000
npm run build      # TypeScript check + Vite production build (outputs to dist/)
npm run preview    # Preview production build
```

No test framework is configured.

## Architecture

Neon Vector is a vertical scrolling arcade shooter with a cyberpunk neon aesthetic, built with **Phaser 3** (game engine, loaded via CDN) and **React 19** (UI overlays).

### Two-Layer Architecture

**React Layer** — Manages game lifecycle (`start` → `playing` → `gameover`), renders UI overlays (start screen, game over, about modal), and wraps the Phaser instance via `GameCanvas`. Styled with Tailwind CSS (CDN).

**Phaser Layer**:
- **BootScene** (`game/scenes/BootScene.ts`) — Procedurally generates ALL visual assets using Phaser's graphics API (neon glow is baked in by layered strokes). No external image files exist.
- **MainScene** (`game/scenes/MainScene.ts`) — Game loop: player control, wave director, enemy AI, collisions, powerups, bombs, scoring, HUD, fx. Implements `BossHost` for the boss.
- **Boss** (`game/Boss.ts`) — Self-contained boss: random variant, pods, phases, attack patterns, its own health bar UI.
- `game/enemies.ts` (enemy stats + formation table), `game/Sfx.ts` (procedural WebAudio sounds), `game/rand.ts`, `game/storage.ts` (guarded localStorage for best score / mute).

All gameplay timers use `MainScene.gt` (game-time ms that freezes while paused), not `time.now`.

### Communication Pattern

React → Phaser: `GameCanvas` creates the Phaser Game instance and passes callbacks via Phaser's `game.registry`.
Phaser → React: Game events (game over, score updates) flow back through registry callbacks.

### Key Game Systems

- **Altitude system**: SPACE toggles (P = high, L = low). Only same-altitude objects collide; same-layer objects render bright, the other layer dims. Powerups are collectible at either altitude.
- **Weapon levels 1-8**: table-driven (`WEAPONS` in MainScene) from single shot to 6-way spread
- **Enemies**: Dart, Weaver, Bomber, Sentinel, Seeker, spawned in formations unlocked over time (`FORMATIONS` in enemies.ts). Enemies with `breach: true` that escape count toward BREACH (12 = lose a life).
- **Boss battle**: Triggers after 3 minutes (`BOSS_TIME`); the wave director ramps spawn rate and formation size from a 0→1 `progress` value, with a sector banner (and BREACH reset) every 45s. At the halfway point a **mid-boss** (WARDEN or STINGER, `tier: 'mid'` in Boss.ts) appears: smaller, 2 phases, retreats after 50s; the level clock (`levelTime`) is frozen during any boss fight. One of 3 variants (HYDRA / MONOLITH / SERAPH) with destructible pods (core takes reduced damage while pods live), 3 HP phases, and 11 attacks chosen by weighted random with randomized parameters. Beam attacks hit only high altitude; mines hit only low altitude. Defeat redirects to the portfolio site.
- **Tuning**: player damage values are `DAMAGE` in `game/enemies.ts`; drop rates are `drop` per enemy there plus `WEAPON_PITY_MS` in MainScene; boss difficulty is `VARIANTS`/`TIERS` in `game/Boss.ts`
- **Other**: bombs (B/X), shield, combo multiplier, i-frames, pause (ESC), mute (M), touch controls (drag + ALT/BOMB buttons)
- **All sprites are procedurally generated** in BootScene — to add new visuals, generate textures there

### Global Constants

Game dimensions (`GAME_WIDTH=480`, `GAME_HEIGHT=640`), color palette, scene keys, and `GameState` interface are defined in `types.ts`.

### External Dependencies (CDN)

Phaser 3.80.1, Tailwind CSS, and Share Tech Mono font are loaded via CDN in `index.html`. Phaser is NOT an npm dependency — it's globally available at runtime.
