import { COLORS, HEX, SceneKeys, GAME_WIDTH, GAME_HEIGHT } from '../../types';
import { Boss, type BossHost, type BulletOpts } from '../Boss';
import { ENEMIES, FORMATIONS, type EnemyAI, type EnemyKind, type FormationId } from '../enemies';
import { sfx } from '../Sfx';
import { saveBest } from '../storage';
import { rand, randInt, chance, pick, weightedPick } from '../rand';

const Phaser = window.Phaser;
const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const FONT = '"Share Tech Mono"';

const BOSS_TIME = 180000;
const SECTOR_TIME = 45000; // sector banner + breach reset every 45s
// Seconds between formations, from the start of the run to just before the boss
const SPAWN_GAP_START = 3.4;
const SPAWN_GAP_END = 1.8;
const MAX_BREACH = 12;
const MAX_LIVES = 5;
const MAX_BOMBS = 5;
const COMBO_WINDOW = 2000;
const WEAPON_PITY_MS = 14000; // guarantees a weapon drop if none has appeared for this long
const LOW_SCALE = 0.62;
const PORTFOLIO_URL = 'https://ianjamesduncan.com';

// Weapon levels 1-8: fire interval (ms) and guns as [x offset, angle in degrees]
const WEAPONS: Array<{ rate: number; guns: Array<[number, number]> }> = [
  { rate: 240, guns: [[0, 0]] },
  { rate: 150, guns: [[0, 0]] },
  { rate: 190, guns: [[-10, 0], [10, 0]] },
  { rate: 140, guns: [[-10, 0], [10, 0]] },
  { rate: 170, guns: [[-14, -4], [0, 0], [14, 4]] },
  { rate: 125, guns: [[-14, -4], [0, 0], [14, 4]] },
  { rate: 150, guns: [[-8, 0], [8, 0], [-20, -9], [20, 9]] },
  { rate: 125, guns: [[-6, 0], [6, 0], [-18, -8], [18, 8], [-26, -16], [26, 16]] },
];

type PowerupKind = 'puWeapon' | 'puHealth' | 'puShield' | 'puBomb';
type FxSize = 'small' | 'medium' | 'large';

export class MainScene extends window.Phaser.Scene implements BossHost {
  // BossHost
  player!: any;
  bossParts!: any;
  gt = 0; // game-time ms — only advances while unpaused, so every timer pauses with it

  // Groups
  private playerBullets!: any;
  private enemyBullets!: any;
  private enemies!: any;
  private powerups!: any;

  // Input
  private keys!: any;
  private cursors!: any;
  private dragPointer: any = null;
  private dragOffset = { x: 0, y: 0 };

  // Environment / fx
  private starsFar!: any;
  private starsNear!: any;
  private grid!: any;
  private scrollSpeed = 110;
  private trail!: any;
  private shieldSprite!: any;
  private sparks!: any;
  private fxEmitters = new Map<string, any>();
  private activeBanners = 0;

  // Boss
  private boss: Boss | null = null;
  private bossTriggered = false;
  private victory = false;

  // Run state
  private isLowAltitude = false;
  private health = 100;
  private lives = 3;
  private bombs = 2;
  private weaponLevel = 1;
  private score = 0;
  private combo = 0;
  private lastKillAt = 0;
  private breaches = 0;
  private difficulty = 1;
  private nextFireAt = 0;
  private nextFormationAt = 2000;
  private sector = 1;
  private lastFormation: FormationId | null = null;
  private lastWeaponDropAt = 0;
  private invulnUntil = 0;
  private shieldUntil = 0;
  private respawning = false;
  private dying = false;
  private gameActive = true;
  private paused = false;
  private onGameOver?: (score: number) => void;

  private hud: Record<string, any> = {};

  constructor() {
    super({ key: SceneKeys.Main });
  }

  create() {
    this.onGameOver = this.registry.get('onGameOver');
    this.createBackground();
    this.createGroups();
    this.createPlayer();
    this.createInput();
    this.createCollisions();
    this.createHud();
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 240 }, lifespan: 220, scale: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
    }).setDepth(17);

    this.banner('STAGE 01 // ENGAGE', HEX.CYAN, 1400);
    const touch = this.sys.game.device.input.touch;
    const hint = this.add.text(W / 2, H * 0.4 + 44,
      touch ? 'DRAG TO FLY  ·  ALT / BOMB BUTTONS' : 'SPACE ALTITUDE · B BOMB · ESC PAUSE · M MUTE',
      { fontFamily: FONT, fontSize: '12px', color: HEX.CYAN }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: hint, alpha: 0, delay: 5000, duration: 800, onComplete: () => hint.destroy() });
  }

  // ---------- setup ----------

  private createBackground() {
    this.add.rectangle(0, 0, W, H, COLORS.BG_DARK).setOrigin(0, 0);
    this.starsFar = this.add.tileSprite(W / 2, H / 2, W, H, 'starsFar').setDepth(0);
    this.starsNear = this.add.tileSprite(W / 2, H / 2, W, H, 'starsNear').setDepth(1);
    this.grid = this.add.tileSprite(W / 2, H / 2, W, H, 'grid').setDepth(2).setAlpha(0.7);
  }

  private createGroups() {
    this.playerBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 300 });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 700 });
    this.enemies = this.physics.add.group();
    this.powerups = this.physics.add.group();
    this.bossParts = this.physics.add.group({ allowGravity: false, immovable: true });
  }

  private createPlayer() {
    this.physics.world.setBounds(20, 24, W - 40, H - 48);
    this.player = this.physics.add.sprite(W / 2, H - 110, 'playerShip');
    this.player.setCollideWorldBounds(true).setDepth(20);
    // Small hitbox around the cockpit — bullet-hell convention, makes dodging fair
    this.player.body.setCircle(8, this.player.width / 2 - 8, this.player.height / 2 - 8);

    this.trail = this.add.particles(0, 0, 'glow', {
      speedY: { min: 90, max: 170 }, speedX: { min: -15, max: 15 }, lifespan: 240,
      scale: { start: 0.4, end: 0 }, alpha: { start: 0.8, end: 0 },
      tint: [COLORS.NEON_YELLOW, COLORS.NEON_ORANGE], blendMode: 'ADD', frequency: 22,
    }).setDepth(19);
    this.trail.startFollow(this.player, 0, 30);

    this.shieldSprite = this.add.image(0, 0, 'shield').setDepth(21).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
  }

  private createInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    const kb = this.input.keyboard;
    kb.on('keydown-P', () => this.setAltitude(false));
    kb.on('keydown-L', () => this.setAltitude(true));
    kb.on('keydown-SPACE', () => this.setAltitude(!this.isLowAltitude));
    kb.on('keydown-B', () => this.useBomb());
    kb.on('keydown-X', () => this.useBomb());
    kb.on('keydown-M', () => this.toggleMute());
    kb.on('keydown-ESC', () => this.togglePause());

    // Touch / mouse: drag anywhere to fly, ship keeps its offset from the finger
    this.input.on('pointerdown', (pointer: any, over: any[]) => {
      if (over.length) return; // pressed an on-screen button
      this.dragPointer = pointer;
      this.dragOffset = { x: this.player.x - pointer.x, y: this.player.y - pointer.y };
    });
    this.input.on('pointerup', (pointer: any) => {
      if (pointer === this.dragPointer) this.dragPointer = null;
    });
  }

  private createCollisions() {
    this.physics.add.overlap(this.playerBullets, this.enemies, this.onBulletHitsEnemy, undefined, this);
    this.physics.add.overlap(this.playerBullets, this.bossParts, this.onBulletHitsBoss, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHitsEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.onPlayerHitsBullet, undefined, this);
    this.physics.add.overlap(this.player, this.bossParts, this.onPlayerHitsBoss, undefined, this);
    this.physics.add.overlap(this.player, this.powerups, this.onCollect, undefined, this);
  }

  private createHud() {
    const text = (x: number, y: number, s: string, size: number, color: string) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold italic' }).setDepth(50);
    const h = this.hud;

    text(10, 8, 'HULL', 11, HEX.CYAN);
    this.add.rectangle(46, 15, 130, 8, 0x000000, 0.7).setOrigin(0, 0.5).setStrokeStyle(1.5, COLORS.NEON_CYAN).setDepth(50);
    h.health = this.add.rectangle(46, 15, 130, 8, COLORS.NEON_YELLOW).setOrigin(0, 0.5).setDepth(51);
    h.score = text(10, 22, '', 22, HEX.CYAN);
    h.mult = text(0, 28, '', 14, HEX.YELLOW);

    h.threat = [
      text(W / 2, 8, 'THREAT', 10, HEX.YELLOW).setOrigin(0.5, 0),
      this.add.rectangle(W / 2, 26, 110, 4, 0x222222).setDepth(50),
      (h.progress = this.add.rectangle(W / 2 - 55, 26, 0, 4, COLORS.NEON_YELLOW).setOrigin(0, 0.5).setDepth(51)),
    ];

    h.lives = Array.from({ length: MAX_LIVES }, (_, i) => this.add.image(W - 16 - i * 20, 16, 'playerShip').setScale(0.28).setDepth(50));
    h.bombs = Array.from({ length: MAX_BOMBS }, (_, i) => this.add.image(W - 15 - i * 18, 38, 'puBomb').setScale(0.45).setDepth(50));
    h.breach = text(W - 10, 50, '', 12, HEX.YELLOW).setOrigin(1, 0);

    h.alt = text(10, H - 10, 'ALT: HIGH', 16, HEX.YELLOW).setOrigin(0, 1);
    h.mute = text(W - 10, H - 10, sfx.muted ? 'MUTED [M]' : '', 11, '#888888').setOrigin(1, 1);
    h.pause = this.add.text(W / 2, H / 2, 'PAUSED\n\n[ESC] RESUME', { fontFamily: FONT, fontSize: '28px', color: HEX.CYAN, fontStyle: 'bold italic', align: 'center' })
      .setOrigin(0.5).setDepth(70).setVisible(false);

    if (this.sys.game.device.input.touch) {
      this.touchButton(W - 48, H - 140, 'ALT', COLORS.NEON_CYAN, HEX.CYAN, () => this.setAltitude(!this.isLowAltitude));
      this.touchButton(W - 48, H - 60, 'BOMB', COLORS.NEON_ORANGE, HEX.ORANGE, () => this.useBomb());
    }

    this.refreshHud();
  }

  private touchButton(x: number, y: number, label: string, color: number, hex: string, onPress: () => void) {
    const btn = this.add.image(x, y, 'btnRing').setTint(color).setAlpha(0.75).setDepth(52).setInteractive();
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '13px', color: hex, fontStyle: 'bold' }).setOrigin(0.5).setDepth(53);
    btn.on('pointerdown', onPress);
  }

  // ---------- main loop ----------

  update(_time: number, delta: number) {
    if (!this.gameActive || this.paused) return;
    const dt = Math.min(delta, 50) / 1000;
    this.gt += dt * 1000;

    this.starsFar.tilePositionY -= 18 * dt;
    this.starsNear.tilePositionY -= 45 * dt;
    this.grid.tilePositionY -= this.scrollSpeed * dt;

    this.updatePlayer(dt);
    this.updateDirector();
    this.updateEnemies(dt);
    this.updateBullets();
    this.updatePowerups(dt);
    this.boss?.update(dt);

    if (this.combo > 0) {
      const since = this.gt - this.lastKillAt;
      if (since > COMBO_WINDOW) {
        this.combo = 0;
        this.refreshHud();
      } else {
        this.hud.mult.setAlpha(1 - (since / COMBO_WINDOW) * 0.7);
      }
    }
  }

  // ---------- player ----------

  private updatePlayer(dt: number) {
    const p = this.player;
    if (!this.playerAlive()) {
      p.setVelocity(0, 0);
      return;
    }

    const speed = this.isLowAltitude ? 250 : 380;
    const k = this.keys, c = this.cursors;
    let vx = 0, vy = 0;
    if (k.A.isDown || c.left.isDown) vx -= 1;
    if (k.D.isDown || c.right.isDown) vx += 1;
    if (k.W.isDown || c.up.isDown) vy -= 1;
    if (k.S.isDown || c.down.isDown) vy += 1;

    if (vx || vy) {
      const len = Math.hypot(vx, vy);
      p.setVelocity((vx / len) * speed, (vy / len) * speed);
    } else if (this.dragPointer?.isDown) {
      const dx = this.dragPointer.x + this.dragOffset.x - p.x;
      const dy = this.dragPointer.y + this.dragOffset.y - p.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(speed * 1.6, d / dt);
      if (d > 1) p.setVelocity((dx / d) * sp, (dy / d) * sp);
      else p.setVelocity(0, 0);
    } else {
      p.setVelocity(0, 0);
    }

    // Bank into turns
    const bank = Phaser.Math.Clamp(p.body.velocity.x / speed, -1, 1) * 0.2;
    p.rotation = Phaser.Math.Linear(p.rotation, bank, 0.2);

    // Flicker while invulnerable
    const baseAlpha = this.isLowAltitude ? 0.75 : 1;
    p.setAlpha(this.gt < this.invulnUntil && Math.floor(this.gt / 70) % 2 ? 0.25 : baseAlpha);

    const shielded = this.gt < this.shieldUntil;
    this.shieldSprite.setVisible(shielded);
    if (shielded) {
      const blink = this.shieldUntil - this.gt < 2000 && Math.floor(this.gt / 100) % 2;
      this.shieldSprite.setPosition(p.x, p.y).setScale(p.scale).setRotation(this.gt / 500)
        .setAlpha(blink ? 0.3 : 0.9).setDepth(p.depth + 1);
    }

    if (this.gt >= this.nextFireAt) {
      this.firePlayer();
      this.nextFireAt = this.gt + WEAPONS[this.weaponLevel - 1].rate;
    }
  }

  private firePlayer() {
    const low = this.isLowAltitude;
    const s = low ? LOW_SCALE : 1;
    const speed = low ? 560 : 900;
    for (const [dx, deg] of WEAPONS[this.weaponLevel - 1].guns) {
      const x = this.player.x + dx * s;
      const y = this.player.y - 26 * s;
      const b = this.playerBullets.get(x, y, 'pLaser');
      if (!b) continue;
      const a = Phaser.Math.DegToRad(deg);
      b.enableBody(true, x, y, true, true);
      b.setVelocity(Math.sin(a) * speed, -Math.cos(a) * speed).setRotation(a).setScale(s)
        .setAlpha(low ? 0.7 : 1).setDepth(low ? 6 : 16);
      b.isLow = low;
    }
    sfx.shoot();
  }

  private setAltitude(low: boolean, silent = false) {
    if (this.isLowAltitude === low || this.paused) return;
    if (!silent && (!this.playerAlive() || !this.gameActive)) return;
    this.isLowAltitude = low;
    const p = this.player;

    this.tweens.killTweensOf(p);
    if (silent) p.setScale(low ? LOW_SCALE : 1);
    else this.tweens.add({ targets: p, scale: low ? LOW_SCALE : 1, duration: 250, ease: 'Power2' });
    p.setDepth(low ? 7 : 20);
    this.trail.setDepth(low ? 6 : 19);
    this.trail.startFollow(p, 0, low ? 19 : 30);

    // Dropping low brings the ground grid closer and faster
    this.tweens.killTweensOf(this.grid);
    this.tweens.add({ targets: this.grid, tileScaleX: low ? 1.5 : 1, tileScaleY: low ? 1.5 : 1, alpha: low ? 1 : 0.7, duration: 400, ease: 'Sine.easeInOut' });
    this.scrollSpeed = low ? 170 : 110;

    this.hud.alt.setText(low ? 'ALT: LOW' : 'ALT: HIGH').setColor(low ? HEX.CYAN : HEX.YELLOW);
    if (!silent) sfx.altitude(low);
  }

  playerAlive() {
    return !this.respawning && !this.dying;
  }

  playerIsLow() {
    return this.isLowAltitude;
  }

  damagePlayer(amount: number) {
    if (!this.playerAlive() || this.victory || this.gt < this.invulnUntil) return;

    if (this.gt < this.shieldUntil) {
      this.shieldSprite.setTintFill(0xffffff);
      this.time.delayedCall(60, () => this.shieldSprite.clearTint());
      this.invulnUntil = this.gt + 150;
      sfx.hit();
      return;
    }

    this.health -= amount;
    this.combo = 0;
    this.invulnUntil = this.gt + 800;
    this.cameras.main.shake(140, 0.012);
    this.cameras.main.flash(90, 255, 23, 68);
    sfx.hurt();
    this.refreshHud();
    if (this.health <= 0) this.loseLife();
  }

  private loseLife() {
    if (!this.playerAlive()) return;
    this.lives--;
    this.combo = 0;
    this.breaches = 0;
    this.weaponLevel = Math.max(1, this.weaponLevel - 2);
    this.shieldUntil = 0;
    this.shieldSprite.setVisible(false);
    this.explode(this.player.x, this.player.y, COLORS.NEON_CYAN, 'large');
    this.player.disableBody(false, true);
    this.trail.stop();
    this.dragPointer = null;
    this.refreshHud();

    if (this.lives <= 0) {
      this.dying = true;
      this.time.delayedCall(1600, () => {
        this.gameActive = false;
        this.onGameOver?.(this.score);
      });
      return;
    }

    this.respawning = true;
    this.clearEnemyBullets();
    this.time.delayedCall(1000, () => {
      this.respawning = false;
      this.health = 100;
      this.bombs = Math.max(this.bombs, 2);
      this.setAltitude(false, true);
      this.player.enableBody(true, W / 2, H - 110, true, true);
      this.player.setScale(1);
      this.invulnUntil = this.gt + 2500;
      this.trail.start();
      this.refreshHud();
    });
  }

  private useBomb() {
    if (this.paused || !this.gameActive || !this.playerAlive() || this.bombs <= 0 || this.victory) return;
    this.bombs--;
    sfx.bomb();
    this.cameras.main.flash(250, 255, 255, 255);
    this.cameras.main.shake(300, 0.012);
    this.shockwave(this.player.x, this.player.y, COLORS.NEON_ORANGE, 14, 600);
    this.clearEnemyBullets();
    for (const e of this.enemies.getChildren().slice()) {
      if (e.active && e.y > -20) this.damageEnemy(e, 12);
    }
    this.boss?.bombHit();
    this.invulnUntil = Math.max(this.invulnUntil, this.gt + 1000);
    this.refreshHud();
  }

  private toggleMute() {
    this.hud.mute.setText(sfx.toggleMute() ? 'MUTED [M]' : '');
  }

  private togglePause() {
    if (!this.gameActive || this.dying) return;
    this.paused = !this.paused;
    this.hud.pause.setVisible(this.paused);
    const emitters = [this.trail, this.sparks, ...this.fxEmitters.values()];
    if (this.paused) {
      this.physics.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      emitters.forEach(e => e.pause());
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      emitters.forEach(e => e.resume());
    }
  }

  // ---------- wave director ----------

  // 0 at the start of the run, 1 when the boss arrives
  private get progress() {
    return Math.min(1, this.gt / BOSS_TIME);
  }

  // Formation size that grows from `min` to `max` over the run
  private grow(min: number, max: number) {
    return Math.max(min, Math.round(Phaser.Math.Linear(min, max, this.progress) + rand(-0.5, 0.5)));
  }

  private updateDirector() {
    if (this.bossTriggered) return;
    const p = this.progress;
    this.difficulty = 1 + p;
    this.hud.progress.width = 110 * p;
    if (this.gt >= BOSS_TIME) {
      this.triggerBoss();
      return;
    }

    const sector = 1 + Math.floor(this.gt / SECTOR_TIME);
    if (sector > this.sector) {
      this.sector = sector;
      this.breaches = 0;
      this.refreshHud();
      const final = (sector + 1) * SECTOR_TIME > BOSS_TIME;
      this.banner(`SECTOR 0${sector} // ${final ? 'FINAL APPROACH' : 'HOSTILES INCREASING'}`, final ? HEX.RED : HEX.CYAN, 1600);
    }

    if (this.gt < this.nextFormationAt) return;
    this.launchFormation();
    // Late in the run, formations start arriving in pairs
    if (p > 0.7 && chance((p - 0.7) * 0.8)) this.time.delayedCall(700, () => !this.bossTriggered && this.launchFormation());
    this.nextFormationAt = this.gt + Phaser.Math.Linear(SPAWN_GAP_START, SPAWN_GAP_END, p) * 1000 * rand(0.85, 1.15);
  }

  private launchFormation() {
    const secs = this.gt / 1000;
    const unlocked = FORMATIONS.filter(f => secs >= f.from);
    // Avoid repeating the last formation, unless it's the only one unlocked yet
    const fresh = unlocked.filter(f => f.id !== this.lastFormation);
    const options = fresh.length ? fresh : unlocked;
    const formation = weightedPick(options, options.map(f => f.weight));
    this.lastFormation = formation.id;
    this.spawnFormation(formation.id);
  }

  private spawnFormation(id: FormationId) {
    const lowChance = 0.2 + this.progress * 0.2;
    const isLow = chance(lowChance);
    const later = (ms: number, fn: () => void) =>
      this.time.delayedCall(ms, () => {
        if (!this.bossTriggered) fn();
      });

    switch (id) {
      case 'solo': {
        for (let i = this.grow(1, 3); i > 0; i--) {
          later(i * 300, () => this.spawnEnemy(pick<EnemyKind>(['dart', 'weaver']), rand(50, W - 50), -40, chance(lowChance)));
        }
        break;
      }
      case 'dartV': {
        const n = this.grow(3, 7);
        const cx = rand(60 + n * 12, W - 60 - n * 12);
        for (let i = 0; i < n; i++) {
          const o = i - (n - 1) / 2;
          this.spawnEnemy('dart', cx + o * 34, -40 - Math.abs(o) * 30, isLow);
        }
        break;
      }
      case 'dartLine': {
        const fromLeft = chance(0.5);
        const n = this.grow(3, 7);
        for (let i = 0; i < n; i++) {
          later(i * 140, () => this.spawnEnemy('dart', fromLeft ? 40 + i * 60 : W - 40 - i * 60, -40, isLow, { vx: fromLeft ? 25 : -25 }));
        }
        break;
      }
      case 'weaverSnake': {
        const baseX = rand(110, W - 110);
        const amp = rand(50, 100);
        const freq = rand(2.2, 3.4);
        for (let i = this.grow(3, 7); i > 0; i--) later(i * 230, () => this.spawnEnemy('weaver', baseX, -40, isLow, { baseX, amp, freq }));
        break;
      }
      case 'bomberPair': {
        const cx = rand(130, W - 130);
        if (this.progress < 0.5) {
          this.spawnEnemy('bomber', cx, -50, isLow);
        } else {
          this.spawnEnemy('bomber', cx - 70, -50, isLow);
          this.spawnEnemy('bomber', cx + 70, -50, isLow);
        }
        for (let i = this.grow(0, 3); i > 0; i--) later(500 + i * 200, () => this.spawnEnemy('dart', cx + rand(-60, 60), -40, isLow));
        break;
      }
      case 'seekers': {
        for (let i = this.grow(2, 5); i > 0; i--) later(i * 260, () => this.spawnEnemy('seeker', rand(40, W - 40), -30, isLow));
        break;
      }
      case 'sentinel': {
        const x = rand(100, W - 100);
        this.spawnEnemy('sentinel', x, -50, isLow);
        const baseX = x < W / 2 ? x + 120 : x - 120;
        for (let i = this.grow(1, 4); i > 0; i--) later(400 + i * 250, () => this.spawnEnemy('weaver', baseX, -40, isLow, { baseX, amp: 60 }));
        break;
      }
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, isLow: boolean, over: Partial<EnemyAI> = {}) {
    const def = ENEMIES[kind];
    const e = this.enemies.create(x, y, def.texture);
    e.setScale(isLow ? LOW_SCALE : 1).setAlpha(this.layerAlpha(isLow)).setDepth(isLow ? 5 : 12);
    e.body.setCircle(def.radius, e.width / 2 - def.radius, e.height / 2 - def.radius);
    const ai: EnemyAI = {
      kind, isLow, minion: false, age: 0,
      hp: Math.ceil(def.hp * (1 + (this.difficulty - 1) * 0.6)),
      vx: 0, vy: def.speed * rand(0.9, 1.1),
      baseX: x, freq: 3, amp: 70,
      nextShot: this.gt + rand(600, 1600),
      stopY: rand(130, 260), holdUntil: 0, mode: 'enter',
      homeUntil: this.gt + 2200, flashUntil: 0,
      ...over,
    };
    e.ai = ai;
    return e;
  }

  spawnMinion(kind: 'dart' | 'seeker', x: number, y: number) {
    this.spawnEnemy(kind, x, y, false, { minion: true, vx: rand(-40, 40) });
  }

  private updateEnemies(dt: number) {
    const gt = this.gt;
    for (const e of this.enemies.getChildren().slice()) {
      const ai: EnemyAI = e.ai;
      ai.age += dt;
      const pace = ai.isLow ? 0.65 : 1; // low layer moves slower (parallax)
      const shotSpeed = ai.isLow ? 0.7 : 1;
      e.alpha = this.layerAlpha(ai.isLow);
      if (e.isTinted && gt > ai.flashUntil) e.clearTint();

      switch (ai.kind) {
        case 'dart':
          e.x += ai.vx * dt;
          e.y += ai.vy * pace * dt;
          break;

        case 'weaver':
          e.y += ai.vy * pace * dt;
          e.x = ai.baseX + Math.sin(ai.age * ai.freq) * ai.amp;
          e.rotation = -Math.cos(ai.age * ai.freq) * 0.35;
          if (this.difficulty > 1.4 && gt > ai.nextShot && e.y > 0) {
            this.fireEnemyBullet(e.x, e.y + 14, Math.PI / 2, 200 * shotSpeed, { isLow: ai.isLow });
            ai.nextShot = gt + rand(1800, 3000);
          }
          break;

        case 'bomber':
          e.y += ai.vy * pace * dt;
          if (gt > ai.nextShot && e.y > 20 && e.y < H * 0.7) {
            const a = this.angleToPlayer(e);
            const n = this.difficulty > 1.5 ? 3 : 1;
            for (let i = 0; i < n; i++) {
              this.fireEnemyBullet(e.x, e.y + 20, a + (i - (n - 1) / 2) * 0.2, 220 * shotSpeed, { isLow: ai.isLow });
            }
            ai.nextShot = gt + rand(1600, 2400) / this.difficulty;
          }
          break;

        case 'sentinel':
          e.rotation += dt * (ai.mode === 'hold' ? 2.5 : 1);
          if (ai.mode === 'enter') {
            e.y += ai.vy * pace * dt;
            if (e.y >= ai.stopY) {
              ai.mode = 'hold';
              ai.holdUntil = gt + rand(3500, 5000);
              ai.nextShot = gt + 300;
            }
          } else if (ai.mode === 'hold') {
            if (gt > ai.nextShot) {
              const n = randInt(8, 12);
              const off = rand(0, Math.PI * 2);
              for (let i = 0; i < n; i++) this.fireEnemyBullet(e.x, e.y, off + (Math.PI * 2 * i) / n, 150 * shotSpeed, { isLow: ai.isLow });
              ai.nextShot = gt + rand(800, 1100);
            }
            if (gt > ai.holdUntil) ai.mode = 'exit';
          } else {
            e.y += 240 * pace * dt;
          }
          break;

        case 'seeker': {
          if (gt < ai.homeUntil && this.playerAlive()) {
            const cur = Math.atan2(ai.vy, ai.vx);
            const diff = Phaser.Math.Angle.Wrap(this.angleToPlayer(e) - cur);
            const heading = cur + Phaser.Math.Clamp(diff, -2.2 * dt, 2.2 * dt);
            const sp = Math.min(330, Math.hypot(ai.vx, ai.vy) + 60 * dt);
            ai.vx = Math.cos(heading) * sp;
            ai.vy = Math.sin(heading) * sp;
          }
          e.x += ai.vx * pace * dt;
          e.y += ai.vy * pace * dt;
          e.rotation = Math.atan2(ai.vy, ai.vx) - Math.PI / 2;
          break;
        }
      }

      if (e.y > H + 50) this.enemyEscaped(e);
      else if (e.x < -80 || e.x > W + 80 || e.y < -250) e.destroy();
    }
  }

  private enemyEscaped(e: any) {
    const ai: EnemyAI = e.ai;
    e.destroy();
    if (!ENEMIES[ai.kind].breach || ai.minion || this.bossTriggered || !this.playerAlive()) return;
    this.breaches++;
    this.refreshHud();
    this.tweens.add({ targets: this.hud.breach, scale: 1.4, duration: 90, yoyo: true });
    if (this.breaches >= MAX_BREACH) {
      this.banner('PERIMETER BREACHED', HEX.RED);
      this.loseLife();
    }
  }

  // Things on the player's current altitude (i.e. things that can collide) are drawn bright
  private layerAlpha(isLow: boolean) {
    return isLow === this.isLowAltitude ? 1 : 0.4;
  }

  private angleToPlayer(from: any) {
    return Phaser.Math.Angle.Between(from.x, from.y, this.player.x, this.player.y);
  }

  private damageEnemy(e: any, dmg: number) {
    const ai: EnemyAI = e.ai;
    ai.hp -= dmg;
    if (ai.hp <= 0) {
      this.killEnemy(e);
      return;
    }
    // Throttled so sustained fire reads as flicker rather than a solid white ship
    if (this.gt > ai.flashUntil + 70) {
      e.setTintFill(0xffffff);
      ai.flashUntil = this.gt + 50;
    }
    sfx.hit();
  }

  private killEnemy(e: any) {
    const ai: EnemyAI = e.ai;
    const def = ENEMIES[ai.kind];
    this.explode(e.x, e.y, def.color, ai.kind === 'bomber' || ai.kind === 'sentinel' ? 'medium' : 'small');
    this.combo++;
    this.lastKillAt = this.gt;
    const mult = this.multiplier;
    this.addScore(def.score * mult, e.x, e.y, mult > 1 || def.score >= 400);
    if (!ai.minion && (chance(def.drop) || this.weaponDropDue)) this.dropPowerup(e.x, e.y);
    e.destroy();
  }

  private get multiplier() {
    return Math.min(8, 1 + Math.floor(this.combo / 6));
  }

  addScore(points: number, x: number, y: number, pop = true) {
    this.score += points;
    if (pop) this.popText(x, y, `+${points}`);
    this.refreshHud();
  }

  // ---------- bullets ----------

  fireEnemyBullet(x: number, y: number, angle: number, speed: number, opts: BulletOpts = {}) {
    const tex = opts.tex ?? 'eOrb';
    const b = this.enemyBullets.get(x, y, tex);
    if (!b) return;
    const isLow = opts.isLow ?? false;
    b.enableBody(true, x, y, true, true);
    b.setTexture(tex);
    b.setScale((opts.scale ?? 1) * (isLow ? 0.75 : 1))
      .setAlpha(this.layerAlpha(isLow))
      .setDepth(isLow ? 6 : 14)
      .setRotation(tex === 'needle' ? angle - Math.PI / 2 : 0)
      .setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const r = tex === 'mine' ? 8 : tex === 'needle' ? 4 : b.width * 0.2;
    b.body.setCircle(r, b.width / 2 - r, b.height / 2 - r);
    b.isLow = isLow;
    b.mineAt = opts.mineAt ?? 0;
  }

  clearEnemyBullets() {
    let n = 0;
    for (const b of this.enemyBullets.getChildren()) {
      if (!b.active) continue;
      if (n++ < 60) this.sparks.explode(2, b.x, b.y);
      b.disableBody(true, true);
    }
  }

  private updateBullets() {
    const offscreen = (b: any) => b.y < -60 || b.y > H + 60 || b.x < -60 || b.x > W + 60;
    for (const b of this.playerBullets.getChildren()) {
      if (b.active && offscreen(b)) b.disableBody(true, true);
    }
    for (const b of this.enemyBullets.getChildren().slice()) {
      if (!b.active) continue;
      b.alpha = this.layerAlpha(b.isLow);
      if (b.mineAt) {
        b.rotation += 0.05;
        if (this.gt > b.mineAt) {
          this.detonateMine(b);
          continue;
        }
      }
      if (offscreen(b)) b.disableBody(true, true);
    }
  }

  private detonateMine(mine: any) {
    const { x, y } = mine;
    mine.disableBody(true, true);
    this.emitterFor(COLORS.NEON_ORANGE, false).explode(8, x, y);
    const off = rand(0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      this.fireEnemyBullet(x, y, off + (Math.PI * 2 * i) / 8, 120, { tex: 'orbOrange', isLow: true, scale: 0.8 });
    }
  }

  // ---------- collisions ----------

  private onBulletHitsEnemy(b: any, e: any) {
    if (!b.active || !e.active || b.isLow !== e.ai.isLow) return;
    b.disableBody(true, true);
    this.sparks.explode(3, b.x, b.y);
    this.damageEnemy(e, 1);
  }

  private onBulletHitsBoss(b: any, part: any) {
    if (!b.active || b.isLow || !this.boss) return;
    b.disableBody(true, true);
    this.sparks.explode(3, b.x, b.y);
    this.boss.hit(part, 1);
    sfx.hit();
  }

  private onPlayerHitsEnemy(_p: any, e: any) {
    if (!e.active || e.ai.isLow !== this.isLowAltitude || !this.playerAlive() || this.gt < this.invulnUntil) return;
    const heavy = e.ai.kind === 'bomber' || e.ai.kind === 'sentinel';
    this.damagePlayer(heavy ? 35 : 20);
    this.killEnemy(e);
  }

  private onPlayerHitsBullet(_p: any, b: any) {
    if (!b.active || b.isLow !== this.isLowAltitude || !this.playerAlive() || this.gt < this.invulnUntil) return;
    b.disableBody(true, true);
    this.damagePlayer(b.texture.key === 'needle' ? 15 : 10);
  }

  private onPlayerHitsBoss() {
    if (this.isLowAltitude || !this.playerAlive()) return;
    this.damagePlayer(25);
  }

  // ---------- powerups ----------

  private get weaponDropDue() {
    return this.gt - this.lastWeaponDropAt > WEAPON_PITY_MS;
  }

  dropPowerup(x: number, y: number) {
    const kinds: PowerupKind[] = ['puWeapon', 'puHealth', 'puShield', 'puBomb'];
    const kind = this.weaponDropDue ? 'puWeapon' : weightedPick(kinds, [50, this.health < 60 ? 35 : 18, 14, 12]);
    if (kind === 'puWeapon') this.lastWeaponDropAt = this.gt;
    const pu = this.powerups.create(x, y, kind);
    pu.kind = kind;
    pu.age = 0;
    pu.setDepth(15);
    pu.body.setCircle(14, pu.width / 2 - 14, pu.height / 2 - 14);
    this.tweens.add({ targets: pu, scale: 1.15, duration: 400, yoyo: true, repeat: -1 });
  }

  private updatePowerups(dt: number) {
    for (const pu of this.powerups.getChildren().slice()) {
      pu.age += dt;
      const dx = this.player.x - pu.x;
      const dy = this.player.y - pu.y;
      const d = Math.hypot(dx, dy);
      if (this.playerAlive() && d < 110 && d > 1) {
        // Magnet toward the player
        pu.x += (dx / d) * 420 * dt;
        pu.y += (dy / d) * 420 * dt;
      } else {
        pu.y += 70 * dt;
        pu.x += Math.sin(pu.age * 3) * 30 * dt;
      }
      if (pu.y > H + 40) this.removePowerup(pu);
    }
  }

  private removePowerup(pu: any) {
    this.tweens.killTweensOf(pu);
    pu.destroy();
  }

  // Powerups are collectible at either altitude
  private onCollect(_p: any, pu: any) {
    if (!pu.active || !this.playerAlive()) return;
    const { x, y } = pu;
    switch (pu.kind as PowerupKind) {
      case 'puWeapon':
        if (this.weaponLevel < WEAPONS.length) {
          this.weaponLevel++;
          this.popText(x, y, this.weaponLevel === WEAPONS.length ? 'WEAPON MAX' : `WEAPON LV ${this.weaponLevel}`, HEX.CYAN);
        } else {
          this.addScore(2000, x, y);
        }
        break;
      case 'puHealth':
        this.health = Math.min(100, this.health + 35);
        this.popText(x, y, 'HULL +35', HEX.YELLOW);
        break;
      case 'puShield':
        this.shieldUntil = Math.max(this.shieldUntil, this.gt) + 8000;
        this.popText(x, y, 'SHIELD', HEX.MAGENTA);
        break;
      case 'puBomb':
        this.bombs = Math.min(MAX_BOMBS, this.bombs + 1);
        this.popText(x, y, 'BOMB +1', HEX.ORANGE);
        break;
    }
    this.score += 250;
    sfx.powerup();
    this.removePowerup(pu);
    this.refreshHud();
  }

  // ---------- boss ----------

  private triggerBoss() {
    this.bossTriggered = true;
    this.hud.threat.forEach((o: any) => o.setVisible(false));
    for (const e of this.enemies.getChildren().slice()) {
      this.explode(e.x, e.y, ENEMIES[e.ai.kind as EnemyKind].color);
      e.destroy();
    }
    this.clearEnemyBullets();
    this.refreshHud();
    sfx.warn();
    this.banner('WARNING // BOSS APPROACHING', HEX.RED, 2600);
    this.time.delayedCall(2800, () => {
      this.boss = new Boss(this, this);
      this.grid.setTint(this.boss.variant.color);
    });
  }

  onBossDefeated() {
    this.victory = true;
    for (const e of this.enemies.getChildren().slice()) {
      this.explode(e.x, e.y, ENEMIES[e.ai.kind as EnemyKind].color);
      e.destroy();
    }
    this.addScore(50000 + this.lives * 10000, W / 2, H / 2, false);
    saveBest(this.score);
    this.time.delayedCall(2400, () => {
      this.grid.clearTint();
      this.banner(`THREAT NEUTRALIZED\nCORE ACCESS GRANTED\n\nSCORE ${this.score}`, HEX.CYAN, 5000);
    });
    this.time.delayedCall(7000, () => {
      window.location.href = PORTFOLIO_URL;
    });
  }

  // ---------- fx ----------

  explode(x: number, y: number, color: number, size: FxSize = 'small') {
    const n = size === 'large' ? 60 : size === 'medium' ? 28 : 14;
    this.emitterFor(color, size !== 'small').explode(n, x, y);
    this.sparks.explode(size === 'small' ? 4 : 10, x, y);
    if (size !== 'small') this.shockwave(x, y, color, size === 'large' ? 5 : 2.2, size === 'large' ? 700 : 400);
    if (size === 'large') this.cameras.main.shake(250, 0.015);
    sfx.explode(size !== 'small');
  }

  // One pooled emitter per color/size instead of a new emitter per explosion
  private emitterFor(color: number, big: boolean) {
    const key = `${color}-${big}`;
    let em = this.fxEmitters.get(key);
    if (!em) {
      em = this.add.particles(0, 0, 'glow', {
        lifespan: { min: 250, max: big ? 900 : 550 },
        speed: { min: 30, max: big ? 320 : 200 },
        scale: { start: big ? 0.8 : 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [color, color, 0xffffff],
        blendMode: 'ADD',
        emitting: false,
      }).setDepth(17);
      this.fxEmitters.set(key, em);
    }
    return em;
  }

  private shockwave(x: number, y: number, color: number, scale: number, ms: number) {
    const ring = this.add.image(x, y, 'ring').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(17).setScale(0.2);
    this.tweens.add({ targets: ring, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  private popText(x: number, y: number, str: string, color: string = HEX.YELLOW) {
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: '13px', color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  banner(text: string, color: string = HEX.YELLOW, ms = 1600) {
    const y = H * 0.4 + this.activeBanners * 44;
    this.activeBanners++;
    const t = this.add.text(W / 2, y, text, {
      fontFamily: FONT, fontSize: '26px', color, fontStyle: 'bold italic', align: 'center', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60).setAlpha(0).setScale(1.4);
    t.setShadow(0, 0, color, 14, true, true);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.time.delayedCall(ms, () => {
      this.tweens.add({
        targets: t, alpha: 0, y: y - 20, duration: 300,
        onComplete: () => {
          t.destroy();
          this.activeBanners--;
        },
      });
    });
  }

  private refreshHud() {
    const h = this.hud;
    h.health.width = 130 * Math.max(0, this.health / 100);
    h.health.setFillStyle(this.health <= 30 ? COLORS.NEON_RED : COLORS.NEON_YELLOW);
    h.score.setText(String(this.score).padStart(7, '0'));
    const mult = this.multiplier;
    h.mult.setText(mult > 1 ? `x${mult}` : '').setX(h.score.x + h.score.width + 6).setAlpha(1);
    h.lives.forEach((img: any, i: number) => img.setVisible(i < this.lives));
    h.bombs.forEach((img: any, i: number) => img.setVisible(i < this.bombs));
    h.breach
      .setText(this.bossTriggered ? '' : `BREACH ${this.breaches}/${MAX_BREACH}`)
      .setColor(this.breaches >= MAX_BREACH - 3 ? HEX.RED : HEX.YELLOW);
  }
}
