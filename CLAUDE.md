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

**Phaser Layer** — All game logic lives in two scenes:
- **BootScene** (`game/scenes/BootScene.ts`) — Procedurally generates ALL visual assets using Phaser's graphics API. No external image files exist.
- **MainScene** (`game/scenes/MainScene.ts`) — Contains the entire game loop: player control, enemy spawning, collision detection, boss battles, scoring, and HUD rendering.

### Communication Pattern

React → Phaser: `GameCanvas` creates the Phaser Game instance and passes callbacks via Phaser's `game.registry`.
Phaser → React: Game events (game over, score updates) flow back through registry callbacks.

### Key Game Systems

- **Altitude system**: Player toggles high (P key) / low (L key) altitude, affecting scale, speed, and collision matching
- **Weapon levels 1-8**: Progressive upgrade from single shot to quad spread pattern
- **Enemy types**: Darts (fast, simple) and Bombers (slower, fire at player)
- **Boss battle**: Triggers after 60 seconds, sweeping projectile pattern, 600 HP
- **All sprites are procedurally generated** in BootScene — to add new visuals, generate textures there

### Global Constants

Game dimensions (`GAME_WIDTH=480`, `GAME_HEIGHT=640`), color palette, scene keys, and `GameState` interface are defined in `types.ts`.

### External Dependencies (CDN)

Phaser 3.80.1, Tailwind CSS, and Share Tech Mono font are loaded via CDN in `index.html`. Phaser is NOT an npm dependency — it's globally available at runtime.
