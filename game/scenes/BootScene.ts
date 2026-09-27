import { COLORS, SceneKeys, GAME_WIDTH, GAME_HEIGHT } from '../../types';

// All textures are generated here — there are no image files in the project.
// Neon glow is "baked" into each texture by stroking the outline several times with
// widening, fading lines before drawing the crisp edge on top.

type Pt = { x: number; y: number };

const pts = (...xy: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};

const regular = (cx: number, cy: number, r: number, sides: number, rot = 0): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (Math.PI * 2 * i) / sides;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
};

const star = (cx: number, cy: number, rOuter: number, rInner: number, spikes: number, rot = 0): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (Math.PI * i) / spikes;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
};

export class BootScene extends window.Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Boot });
  }

  preload() {
    this.makePlayer();
    this.makeEnemies();
    this.makeProjectiles();
    this.makePowerups();
    this.makeBosses();
    this.makeFx();
    this.makeBackground();
  }

  create() {
    this.scene.start(SceneKeys.Main);
  }

  // ---------- drawing helpers ----------

  private tex(key: string, w: number, h: number, draw: (g: any) => void) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private neonPoly(g: any, points: Pt[], color: number, lw = 2, fillAlpha = 0.92) {
    g.lineStyle(lw * 5, color, 0.05);
    g.strokePoints(points, true, true);
    g.lineStyle(lw * 3, color, 0.12);
    g.strokePoints(points, true, true);
    g.lineStyle(lw * 1.8, color, 0.3);
    g.strokePoints(points, true, true);
    g.fillStyle(0x05050c, fillAlpha);
    g.fillPoints(points, true, true);
    g.lineStyle(lw, color, 1);
    g.strokePoints(points, true, true);
    g.lineStyle(Math.max(1, lw * 0.4), 0xffffff, 0.5);
    g.strokePoints(points, true, true);
  }

  private neonLine(g: any, x1: number, y1: number, x2: number, y2: number, color: number, lw = 1.5) {
    g.lineStyle(lw * 3, color, 0.15);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(lw, color, 0.9);
    g.lineBetween(x1, y1, x2, y2);
  }

  private neonCircle(g: any, x: number, y: number, r: number, color: number, lw = 2, fill?: number, fillAlpha = 0.5) {
    g.lineStyle(lw * 4, color, 0.08);
    g.strokeCircle(x, y, r);
    g.lineStyle(lw * 2, color, 0.25);
    g.strokeCircle(x, y, r);
    if (fill !== undefined) {
      g.fillStyle(fill, fillAlpha);
      g.fillCircle(x, y, r);
    }
    g.lineStyle(lw, color, 1);
    g.strokeCircle(x, y, r);
  }

  private glowDot(g: any, x: number, y: number, r: number, color: number) {
    g.fillStyle(color, 0.12);
    g.fillCircle(x, y, r * 2.2);
    g.fillStyle(color, 0.3);
    g.fillCircle(x, y, r * 1.5);
    g.fillStyle(color, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x, y, r * 0.45);
  }

  // ---------- player ----------

  private makePlayer() {
    this.tex('playerShip', 64, 72, g => {
      const hull = pts(32, 6, 38, 22, 40, 36, 56, 50, 58, 58, 42, 56, 38, 63, 26, 63, 22, 56, 6, 58, 8, 50, 24, 36, 26, 22);
      this.neonPoly(g, hull, COLORS.NEON_CYAN, 2);
      this.neonLine(g, 40, 40, 52, 52, COLORS.NEON_CYAN, 1);
      this.neonLine(g, 24, 40, 12, 52, COLORS.NEON_CYAN, 1);
      this.neonLine(g, 32, 38, 32, 56, COLORS.NEON_CYAN, 1);
      g.fillStyle(COLORS.NEON_YELLOW, 0.3);
      g.fillPoints(pts(32, 15, 37, 27, 32, 35, 27, 27), true, true);
      g.fillStyle(COLORS.NEON_YELLOW, 1);
      g.fillPoints(pts(32, 18, 35, 27, 32, 32, 29, 27), true, true);
      this.glowDot(g, 28, 62, 2.5, COLORS.NEON_YELLOW);
      this.glowDot(g, 36, 62, 2.5, COLORS.NEON_YELLOW);
    });
  }

  // ---------- enemies (all drawn nose-down) ----------

  private makeEnemies() {
    this.tex('eDart', 44, 48, g => {
      this.neonPoly(g, pts(22, 42, 36, 10, 22, 18, 8, 10), COLORS.NEON_YELLOW, 2);
      this.glowDot(g, 22, 24, 2, COLORS.NEON_MAGENTA);
    });

    this.tex('eWeaver', 52, 44, g => {
      this.neonPoly(g, pts(26, 38, 36, 22, 46, 16, 38, 12, 26, 6, 14, 12, 6, 16, 16, 22), COLORS.NEON_MAGENTA, 2);
      this.neonLine(g, 16, 16, 36, 16, COLORS.NEON_MAGENTA, 1);
      this.glowDot(g, 26, 20, 3, COLORS.NEON_YELLOW);
    });

    this.tex('eBomber', 68, 64, g => {
      const hull = pts(34, 58, 48, 50, 60, 32, 56, 14, 42, 8, 26, 8, 12, 14, 8, 32, 20, 50);
      this.neonPoly(g, hull, COLORS.NEON_YELLOW, 2.5);
      this.neonLine(g, 24, 46, 24, 56, COLORS.NEON_YELLOW, 2);
      this.neonLine(g, 44, 46, 44, 56, COLORS.NEON_YELLOW, 2);
      this.neonPoly(g, regular(34, 30, 11, 6, Math.PI / 6), COLORS.NEON_MAGENTA, 1.5, 0.6);
      this.glowDot(g, 34, 30, 4, COLORS.NEON_MAGENTA);
    });

    this.tex('eSentinel', 64, 64, g => {
      this.neonPoly(g, regular(32, 32, 22, 8, Math.PI / 8), COLORS.NEON_ORANGE, 2.5);
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        this.neonLine(g, 32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27, COLORS.NEON_ORANGE, 2);
      }
      this.neonCircle(g, 32, 32, 9, COLORS.NEON_YELLOW, 1.5);
      this.glowDot(g, 32, 32, 3, COLORS.NEON_YELLOW);
    });

    this.tex('eSeeker', 36, 36, g => {
      this.neonPoly(g, pts(18, 32, 29, 8, 18, 14, 7, 8), COLORS.NEON_MAGENTA, 2);
      this.glowDot(g, 18, 18, 2, COLORS.NEON_WHITE);
    });
  }

  // ---------- projectiles ----------

  private makeProjectiles() {
    this.tex('pLaser', 10, 28, g => {
      g.fillStyle(COLORS.NEON_CYAN, 0.2);
      g.fillRoundedRect(0, 0, 10, 28, 5);
      g.fillStyle(COLORS.NEON_CYAN, 1);
      g.fillRoundedRect(3, 2, 4, 24, 2);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(4, 4, 2, 20);
    });

    const orb = (key: string, color: number, size: number) =>
      this.tex(key, size, size, g => this.glowDot(g, size / 2, size / 2, size / 5, color));
    orb('eOrb', COLORS.NEON_MAGENTA, 18);
    orb('orbYellow', COLORS.NEON_YELLOW, 24);
    orb('orbOrange', COLORS.NEON_ORANGE, 24);
    orb('orbMagenta', COLORS.NEON_MAGENTA, 24);
    orb('orbRed', COLORS.NEON_RED, 24);

    this.tex('needle', 12, 30, g => {
      g.fillStyle(COLORS.NEON_RED, 0.2);
      g.fillEllipse(6, 15, 12, 30);
      g.fillStyle(COLORS.NEON_RED, 1);
      g.fillEllipse(6, 15, 6, 22);
      g.fillStyle(0xffffff, 0.9);
      g.fillEllipse(6, 15, 2, 14);
    });

    // Low-altitude mine: ring with a cross, detonates into shrapnel
    this.tex('mine', 26, 26, g => {
      this.neonCircle(g, 13, 13, 7, COLORS.NEON_ORANGE, 2, 0x000000, 0.8);
      this.neonLine(g, 13, 2, 13, 24, COLORS.NEON_ORANGE, 1.5);
      this.neonLine(g, 2, 13, 24, 13, COLORS.NEON_ORANGE, 1.5);
      this.glowDot(g, 13, 13, 2.5, COLORS.NEON_YELLOW);
    });
  }

  // ---------- powerups ----------

  private makePowerups() {
    const frame = (g: any, color: number) => {
      g.lineStyle(8, color, 0.1);
      g.strokeRoundedRect(4, 4, 28, 28, 6);
      g.fillStyle(0x000000, 0.85);
      g.fillRoundedRect(4, 4, 28, 28, 6);
      g.lineStyle(2, color, 1);
      g.strokeRoundedRect(4, 4, 28, 28, 6);
    };

    this.tex('puWeapon', 36, 36, g => {
      frame(g, COLORS.NEON_CYAN);
      g.lineStyle(3, COLORS.NEON_CYAN, 1);
      g.beginPath();
      g.moveTo(14, 26);
      g.lineTo(14, 10);
      g.lineTo(21, 10);
      g.lineTo(23, 13);
      g.lineTo(23, 16);
      g.lineTo(21, 19);
      g.lineTo(14, 19);
      g.strokePath();
    });

    this.tex('puHealth', 36, 36, g => {
      frame(g, COLORS.NEON_YELLOW);
      g.fillStyle(COLORS.NEON_YELLOW, 1);
      g.fillRect(16, 10, 4, 16);
      g.fillRect(10, 16, 16, 4);
    });

    this.tex('puShield', 36, 36, g => {
      frame(g, COLORS.NEON_MAGENTA);
      g.lineStyle(2.5, COLORS.NEON_MAGENTA, 1);
      g.strokePoints(regular(18, 18, 8, 6, Math.PI / 6), true, true);
      g.fillStyle(COLORS.NEON_MAGENTA, 0.4);
      g.fillPoints(regular(18, 18, 8, 6, Math.PI / 6), true, true);
    });

    this.tex('puBomb', 36, 36, g => {
      frame(g, COLORS.NEON_ORANGE);
      g.fillStyle(COLORS.NEON_ORANGE, 1);
      g.fillCircle(17, 20, 6);
      g.lineStyle(2, COLORS.NEON_ORANGE, 1);
      g.lineBetween(20, 14, 24, 9);
      g.fillStyle(COLORS.NEON_YELLOW, 1);
      g.fillCircle(25, 8, 2);
    });
  }

  // ---------- bosses ----------

  private makeBosses() {
    // HYDRA — swept-wing gunship
    this.tex('bossHydra', 220, 160, g => {
      const hull = pts(110, 150, 130, 120, 170, 112, 212, 72, 196, 42, 150, 58, 130, 22, 110, 8, 90, 22, 70, 58, 24, 42, 8, 72, 50, 112, 90, 120);
      this.neonPoly(g, hull, COLORS.NEON_YELLOW, 3.5);
      this.neonPoly(g, pts(110, 124, 128, 88, 110, 36, 92, 88), COLORS.NEON_CYAN, 1.5, 0.5);
      this.neonLine(g, 150, 70, 190, 70, COLORS.NEON_YELLOW, 1.5);
      this.neonLine(g, 70, 70, 30, 70, COLORS.NEON_YELLOW, 1.5);
      this.neonLine(g, 145, 90, 175, 100, COLORS.NEON_YELLOW, 1);
      this.neonLine(g, 75, 90, 45, 100, COLORS.NEON_YELLOW, 1);
      this.neonCircle(g, 110, 80, 16, COLORS.NEON_CYAN, 2, COLORS.NEON_CYAN, 0.35);
      this.glowDot(g, 110, 80, 6, COLORS.NEON_WHITE);
    });

    // MONOLITH — armored fortress
    this.tex('bossMonolith', 210, 160, g => {
      const hull = pts(65, 152, 145, 152, 172, 126, 202, 126, 202, 40, 166, 8, 44, 8, 8, 40, 8, 126, 38, 126);
      this.neonPoly(g, hull, COLORS.NEON_ORANGE, 3.5);
      this.neonLine(g, 30, 48, 180, 48, COLORS.NEON_ORANGE, 1.5);
      this.neonLine(g, 30, 110, 180, 110, COLORS.NEON_ORANGE, 1.5);
      for (let x = 40; x <= 170; x += 26) this.neonLine(g, x, 20, x, 40, COLORS.NEON_ORANGE, 1);
      this.neonPoly(g, pts(80, 58, 130, 58, 142, 80, 130, 102, 80, 102, 68, 80), COLORS.NEON_YELLOW, 2, 0.6);
      this.neonCircle(g, 105, 80, 14, COLORS.NEON_YELLOW, 2, COLORS.NEON_YELLOW, 0.35);
      this.glowDot(g, 105, 80, 6, COLORS.NEON_WHITE);
    });

    // SERAPH — spiked ring
    this.tex('bossSeraph', 200, 200, g => {
      this.neonPoly(g, star(100, 100, 88, 66, 12, -Math.PI / 2), COLORS.NEON_MAGENTA, 3);
      this.neonCircle(g, 100, 100, 50, COLORS.NEON_CYAN, 2);
      this.neonPoly(g, star(100, 100, 42, 26, 6, Math.PI / 2), COLORS.NEON_MAGENTA, 1.5, 0.5);
      this.neonCircle(g, 100, 100, 16, COLORS.NEON_YELLOW, 2, COLORS.NEON_YELLOW, 0.35);
      this.glowDot(g, 100, 100, 6, COLORS.NEON_WHITE);
    });

    // Mid-bosses
    // WARDEN — red arrowhead gunship
    this.tex('bossWarden', 150, 112, g => {
      const hull = pts(75, 106, 98, 80, 140, 64, 128, 30, 96, 40, 75, 6, 54, 40, 22, 30, 10, 64, 52, 80);
      this.neonPoly(g, hull, COLORS.NEON_RED, 3);
      this.neonPoly(g, pts(75, 88, 88, 60, 75, 28, 62, 60), COLORS.NEON_YELLOW, 1.5, 0.5);
      this.neonLine(g, 100, 58, 130, 58, COLORS.NEON_RED, 1.5);
      this.neonLine(g, 50, 58, 20, 58, COLORS.NEON_RED, 1.5);
      this.neonCircle(g, 75, 56, 11, COLORS.NEON_YELLOW, 2, COLORS.NEON_YELLOW, 0.35);
      this.glowDot(g, 75, 56, 5, COLORS.NEON_WHITE);
    });

    // STINGER — four-point star with orbiting pods
    this.tex('bossStinger', 132, 132, g => {
      this.neonPoly(g, star(66, 66, 58, 30, 4, Math.PI / 2), COLORS.NEON_ORANGE, 3);
      this.neonCircle(g, 66, 66, 24, COLORS.NEON_MAGENTA, 2, 0x000000, 0.6);
      this.neonPoly(g, regular(66, 66, 14, 4, Math.PI / 4), COLORS.NEON_ORANGE, 1.5, 0.5);
      this.glowDot(g, 66, 66, 5, COLORS.NEON_YELLOW);
    });

    // Weapon pod — drawn white so each boss variant can tint it
    this.tex('bossPod', 52, 52, g => {
      this.neonPoly(g, regular(26, 26, 17, 8, Math.PI / 8), 0xffffff, 2.5);
      this.neonCircle(g, 26, 26, 7, 0xffffff, 1.5);
      this.glowDot(g, 26, 26, 3, 0xffffff);
    });
  }

  // ---------- fx ----------

  private makeFx() {
    this.tex('glow', 32, 32, g => {
      for (let r = 16; r > 0; r--) {
        g.fillStyle(0xffffff, 0.07);
        g.fillCircle(16, 16, r);
      }
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 3);
    });

    this.tex('spark', 4, 4, g => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 4, 4);
    });

    this.tex('ring', 64, 64, g => {
      g.lineStyle(8, 0xffffff, 0.2);
      g.strokeCircle(32, 32, 26);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(32, 32, 26);
    });

    this.tex('shield', 84, 84, g => {
      const hex = regular(42, 42, 36, 6, Math.PI / 6);
      g.fillStyle(COLORS.NEON_MAGENTA, 0.08);
      g.fillPoints(hex, true, true);
      g.lineStyle(8, COLORS.NEON_MAGENTA, 0.15);
      g.strokePoints(hex, true, true);
      g.lineStyle(2, COLORS.NEON_MAGENTA, 0.9);
      g.strokePoints(hex, true, true);
    });

    // Touch buttons
    this.tex('btnRing', 72, 72, g => {
      g.fillStyle(0x000000, 0.45);
      g.fillCircle(36, 36, 32);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(36, 36, 32);
    });
  }

  // ---------- background ----------

  private makeBackground() {
    // One tile of the scrolling ground grid: minor lines every 48px, a brighter major line per tile
    this.tex('grid', 192, 192, g => {
      g.lineStyle(1, COLORS.NEON_CYAN, 0.14);
      for (let i = 48; i < 192; i += 48) {
        g.lineBetween(i, 0, i, 192);
        g.lineBetween(0, i, 192, i);
      }
      g.lineStyle(1, COLORS.NEON_CYAN, 0.32);
      g.lineBetween(0, 0, 0, 192);
      g.lineBetween(0, 0, 192, 0);
    });

    const starLayer = (key: string, count: number, rMin: number, rMax: number, aMin: number, aMax: number) =>
      this.tex(key, GAME_WIDTH, GAME_HEIGHT, g => {
        for (let i = 0; i < count; i++) {
          const color = Math.random() < 0.15 ? COLORS.NEON_YELLOW : Math.random() < 0.3 ? COLORS.NEON_CYAN : 0xffffff;
          g.fillStyle(color, aMin + Math.random() * (aMax - aMin));
          g.fillCircle(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, rMin + Math.random() * (rMax - rMin));
        }
      });
    starLayer('starsFar', 110, 0.6, 1.1, 0.2, 0.5);
    starLayer('starsNear', 40, 1.1, 1.9, 0.45, 0.85);
  }
}
