import { COLORS, HEX, GAME_WIDTH, GAME_HEIGHT } from '../types';
import { sfx } from './Sfx';
import { DAMAGE } from './enemies';
import { rand, randInt, chance, pick, weightedPick } from './rand';

const Phaser = window.Phaser;

export interface BulletOpts {
  tex?: string;
  isLow?: boolean;
  scale?: number;
  mineAt?: number;
}

// What the boss needs from the scene that owns it
export interface BossHost {
  readonly gt: number;
  readonly player: any;
  readonly bossParts: any;
  playerAlive(): boolean;
  playerIsLow(): boolean;
  fireEnemyBullet(x: number, y: number, angle: number, speed: number, opts?: BulletOpts): void;
  spawnMinion(kind: 'dart' | 'seeker', x: number, y: number): void;
  explode(x: number, y: number, color: number, size?: 'small' | 'medium' | 'large'): void;
  damagePlayer(amount: number): void;
  clearEnemyBullets(): void;
  banner(text: string, color?: string, ms?: number): void;
  dropPowerup(x: number, y: number): void;
  addScore(points: number, x: number, y: number): void;
  onBossDefeated(boss: Boss, escaped?: boolean): void;
}

type AttackId = 'sweep' | 'fan' | 'aimed' | 'ring' | 'wall' | 'spiral' | 'beam' | 'mines' | 'summon' | 'rain' | 'charge';

// An attack runs one tick per frame and returns true once it has finished
type Attack = (dt: number) => boolean;

interface Variant {
  name: string;
  texture: string;
  color: number;
  colorHex: string;
  bulletTex: string;
  hp: number;
  coreRadius: number;
  pods: Array<[number, number]>; // mount offsets from the core (ignored when orbiting)
  podHp: number;
  orbit: boolean;
  orbitR?: [number, number];     // orbit radii (x, y)
  favors: Partial<Record<AttackId, number>>; // attack weight multipliers — gives each boss a personality
}

const VARIANTS: Variant[] = [
  {
    name: 'HYDRA', texture: 'bossHydra', color: COLORS.NEON_YELLOW, colorHex: HEX.YELLOW, bulletTex: 'orbYellow',
    hp: 620, coreRadius: 50, pods: [[-80, 2], [80, 2]], podHp: 70, orbit: false,
    favors: { sweep: 2, spiral: 1.6, aimed: 1.6, summon: 1.3 },
  },
  {
    name: 'MONOLITH', texture: 'bossMonolith', color: COLORS.NEON_ORANGE, colorHex: HEX.ORANGE, bulletTex: 'orbOrange',
    hp: 700, coreRadius: 60, pods: [[-78, 58], [78, 58]], podHp: 70, orbit: false,
    favors: { wall: 2.2, rain: 1.8, beam: 1.8, mines: 1.6 },
  },
  {
    name: 'SERAPH', texture: 'bossSeraph', color: COLORS.NEON_MAGENTA, colorHex: HEX.MAGENTA, bulletTex: 'orbMagenta',
    hp: 560, coreRadius: 68, pods: [[0, 0], [0, 0], [0, 0]], podHp: 60, orbit: true,
    favors: { ring: 2.2, spiral: 1.8, summon: 1.6, charge: 1.6 },
  },
];

// Smaller ships that show up at the halfway point
const MID_VARIANTS: Variant[] = [
  {
    name: 'WARDEN', texture: 'bossWarden', color: COLORS.NEON_RED, colorHex: HEX.RED, bulletTex: 'orbRed',
    hp: 170, coreRadius: 38, pods: [[-60, 12], [60, 12]], podHp: 28, orbit: false,
    favors: { aimed: 1.8, fan: 1.5, wall: 1.5 },
  },
  {
    name: 'STINGER', texture: 'bossStinger', color: COLORS.NEON_ORANGE, colorHex: HEX.ORANGE, bulletTex: 'orbOrange',
    hp: 150, coreRadius: 40, pods: [[0, 0], [0, 0]], podHp: 28, orbit: true, orbitR: [76, 60],
    favors: { ring: 1.8, sweep: 1.6, summon: 1.4 },
  },
];

export type BossTier = 'mid' | 'final';

interface TierConfig {
  variants: Variant[];
  phaseAt: number[];     // HP ratios at which the next phase starts
  attacks: AttackId[][]; // attacks unlocked per phase
  intensity: number;     // base bullet speed / fire-rate multiplier
  restScale: number;     // multiplier on the pause between attacks
  armor: number;         // damage multiplier on the core while any pod survives
  overdriveExtra: number; // chance of layering a second attack in overdrive
  podScale: number;
  podScore: number;
  timeout: number;       // ms after arrival before it retreats (0 = fights to the death)
}

const TIERS: Record<BossTier, TierConfig> = {
  mid: {
    variants: MID_VARIANTS,
    phaseAt: [1 / 2],
    attacks: [
      ['sweep', 'fan', 'aimed', 'ring'],
      ['sweep', 'fan', 'aimed', 'ring', 'wall', 'summon', 'mines'],
    ],
    intensity: 0.85,
    restScale: 1,
    armor: 0.35,
    overdriveExtra: 0,
    podScale: 0.8,
    podScore: 1000,
    timeout: 50000,
  },
  final: {
    variants: VARIANTS,
    phaseAt: [2 / 3, 1 / 3], // the third phase is OVERDRIVE
    attacks: [
      ['sweep', 'fan', 'aimed', 'ring', 'wall'],
      ['sweep', 'fan', 'aimed', 'ring', 'wall', 'spiral', 'beam', 'mines', 'summon', 'rain'],
      ['sweep', 'fan', 'aimed', 'ring', 'wall', 'spiral', 'beam', 'mines', 'summon', 'rain', 'charge'],
    ],
    intensity: 1.15,
    restScale: 0.65,
    armor: 0.25,
    overdriveExtra: 0.55,
    podScale: 1,
    podScore: 2500,
    timeout: 0,
  },
};

const BAR_W = 300;
const HOME_Y = 185; // boss cruising altitude, clear of the HUD

export class Boss {
  readonly variant: Variant;
  readonly designation: string;
  readonly core: any;
  readonly pods: any[] = [];
  readonly maxHp: number;
  hp: number;
  phase = 0;
  arrived = false;
  dead = false;

  private cfg: TierConfig;
  private retreatAt = Infinity;
  private shownSecs = -1;

  private attack: Attack | null = null;
  private extra: Attack | null = null; // overdrive can layer a second attack on top
  private lastAttack: AttackId | null = null;
  private restUntil = 0;
  private transitionUntil = 0;
  private holdPosition = false;
  private moveTarget = { x: GAME_WIDTH / 2, y: HOME_Y };
  private moveSpeed = 60;
  private nextMoveAt = 0;
  private orbitAngle = 0;
  private orbitSpeed: number;
  private beamHinted = false;
  private minesHinted = false;

  private fx: any;
  private label: any;
  private barBg: any;
  private bar: any;
  private status: any;
  private ticks: any[] = [];

  constructor(private scene: any, private host: BossHost, readonly tier: BossTier = 'final') {
    this.cfg = TIERS[tier];
    this.variant = pick(this.cfg.variants);
    this.designation = `${this.variant.name}-${randInt(2, 9)}${String.fromCharCode(65 + randInt(0, 25))}`;
    this.maxHp = this.hp = Math.round(this.variant.hp * rand(0.9, 1.1));
    this.orbitSpeed = rand(0.8, 1.2) * (chance(0.5) ? 1 : -1);

    const { color, colorHex } = this.variant;

    this.core = host.bossParts.create(GAME_WIDTH / 2, -180, this.variant.texture);
    this.core.part = 'core';
    this.core.setDepth(11);
    const r = this.variant.coreRadius;
    this.core.body.setCircle(r, this.core.width / 2 - r, this.core.height / 2 - r);
    this.core.body.enable = false;

    this.variant.pods.forEach((mount, i) => {
      const pod = host.bossParts.create(this.core.x + mount[0], this.core.y + mount[1], 'bossPod');
      pod.part = 'pod';
      pod.mount = mount;
      pod.index = i;
      pod.hp = this.variant.podHp;
      pod.nextShot = 0;
      pod.setTint(color).setScale(this.cfg.podScale).setDepth(12);
      pod.body.setCircle(18, pod.width / 2 - 18, pod.height / 2 - 18);
      pod.body.enable = false;
      this.pods.push(pod);
    });

    this.fx = scene.add.graphics().setDepth(13);

    // UI
    const font = '"Share Tech Mono"';
    this.label = scene.add.text(GAME_WIDTH / 2, 60, `▼ ${this.designation} ▼`, { fontFamily: font, fontSize: '14px', color: colorHex, fontStyle: 'bold italic' }).setOrigin(0.5).setDepth(55);
    this.barBg = scene.add.rectangle(GAME_WIDTH / 2, 75, BAR_W, 8, 0x000000, 0.7).setStrokeStyle(1.5, color).setDepth(55);
    this.bar = scene.add.rectangle(GAME_WIDTH / 2 - BAR_W / 2, 75, BAR_W, 8, color).setOrigin(0, 0.5).setDepth(56);
    for (const f of this.cfg.phaseAt) {
      this.ticks.push(scene.add.rectangle(GAME_WIDTH / 2 - BAR_W / 2 + BAR_W * f, 75, 2, 12, 0xffffff, 0.8).setDepth(57));
    }
    this.status = scene.add.text(GAME_WIDTH / 2, 88, 'CORE SHIELDED — DESTROY PODS', { fontFamily: font, fontSize: '11px', color: HEX.CYAN }).setOrigin(0.5).setDepth(55);

    scene.tweens.add({
      targets: this.core,
      y: HOME_Y,
      duration: 3600,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.arrived = true;
        const gt = this.host.gt;
        this.restUntil = gt + 700;
        if (this.cfg.timeout) this.retreatAt = gt + this.cfg.timeout;
        [this.core, ...this.pods].forEach(p => {
          p.body.enable = true;
          p.body.reset(p.x, p.y);
          p.nextShot = gt + rand(800, 2000);
        });
      },
    });
  }

  // ---------- per-frame ----------

  update(dt: number) {
    if (this.dead) return;
    const gt = this.host.gt;
    this.fx.clear();
    this.positionPods(dt);
    this.restoreFlashes(gt);
    this.drawAura(gt);
    if (!this.arrived) return;

    if (gt > this.retreatAt) {
      this.retreat();
      return;
    }
    if (this.cfg.timeout) {
      const secs = Math.ceil((this.retreatAt - gt) / 1000);
      if (secs !== this.shownSecs) {
        this.shownSecs = secs;
        this.label.setText(`▼ ${this.designation} ▼  ${secs}s`);
      }
    }

    this.updateMovement(dt);
    if (gt < this.transitionUntil) return;

    this.updatePods();

    if (this.attack) {
      if (this.attack(dt)) {
        this.attack = null;
        this.holdPosition = false;
        this.restUntil = gt + rand(450, 1200) * (1 - this.phase * 0.25) * this.cfg.restScale;
      }
    } else if (gt > this.restUntil) {
      this.startNextAttack();
    }

    if (this.extra && this.extra(dt)) this.extra = null;
  }

  private positionPods(dt: number) {
    this.orbitAngle += dt * this.orbitSpeed * (1 + this.phase * 0.35);
    const n = this.pods.length;
    this.pods.forEach((pod, i) => {
      if (!pod.active) return;
      if (this.variant.orbit) {
        const a = this.orbitAngle + (Math.PI * 2 * i) / n;
        const [rx, ry] = this.variant.orbitR ?? [110, 86];
        pod.x = this.core.x + Math.cos(a) * rx;
        pod.y = this.core.y + Math.sin(a) * ry;
      } else {
        pod.x = this.core.x + pod.mount[0];
        pod.y = this.core.y + pod.mount[1] + Math.sin(this.host.gt / 400 + i * 2) * 4;
      }
      pod.rotation += dt * 2;
    });
  }

  private drawAura(gt: number) {
    const { x, y } = this.core;
    const r = this.variant.coreRadius;
    if (this.podsAlive()) {
      this.fx.lineStyle(2, COLORS.NEON_CYAN, 0.25 + 0.15 * Math.sin(gt / 120));
      this.fx.strokeCircle(x, y, r + 8);
    }
    if (this.overdrive) {
      this.fx.lineStyle(3, COLORS.NEON_RED, 0.35 + 0.3 * Math.sin(gt / 70));
      this.fx.strokeCircle(x, y, r + 16 + Math.sin(gt / 90) * 4);
    }
  }

  private updateMovement(dt: number) {
    if (this.holdPosition) return;
    const gt = this.host.gt;
    const dx = this.moveTarget.x - this.core.x;
    const dy = this.moveTarget.y - this.core.y;
    const dist = Math.hypot(dx, dy);
    if (gt > this.nextMoveAt || dist < 6) {
      this.moveTarget = { x: rand(90, GAME_WIDTH - 90), y: rand(HOME_Y - 10, HOME_Y + 50 + this.phase * 30) };
      this.moveSpeed = rand(40, 95) * (1 + this.phase * 0.35);
      this.nextMoveAt = gt + rand(1500, 3500);
    }
    if (dist > 1) {
      const step = Math.min(dist, this.moveSpeed * dt);
      this.core.x += (dx / dist) * step;
      this.core.y += (dy / dist) * step;
    }
  }

  private updatePods() {
    const gt = this.host.gt;
    for (const pod of this.pods) {
      if (!pod.active || gt < pod.nextShot) continue;
      pod.nextShot = gt + rand(1300, 2600) / (this.intensity + this.phase * 0.1);
      const a = this.angleToPlayer(pod.x, pod.y);
      const speed = rand(200, 250) * this.intensity;
      if (chance(0.5)) {
        this.fire(pod.x, pod.y, a, speed * 1.2, { tex: 'needle' });
      } else {
        for (let i = -1; i <= 1; i++) this.fire(pod.x, pod.y, a + i * 0.22, speed);
      }
    }
  }

  // ---------- damage ----------

  hit(part: any, dmg: number) {
    if (!this.arrived || this.dead) return;
    const gt = this.host.gt;

    if (part.part === 'pod') {
      if (!part.active) return;
      part.hp -= dmg;
      this.flash(part, gt);
      if (part.hp <= 0) this.destroyPod(part);
      return;
    }

    if (gt < this.transitionUntil) return;
    this.hp -= this.podsAlive() ? dmg * this.cfg.armor : dmg;
    this.flash(part, gt);
    this.bar.width = BAR_W * Math.max(0, this.hp / this.maxHp);

    const nextPhaseAt = this.cfg.phaseAt[this.phase];
    if (this.hp <= 0) this.die();
    else if (nextPhaseAt !== undefined && this.hp / this.maxHp < nextPhaseAt) this.enterPhase(this.phase + 1);
  }

  bombHit() {
    this.hit(this.core, 30);
    this.pods.forEach(p => p.active && this.hit(p, 25));
  }

  // The final boss's last phase
  private get overdrive() {
    return this.tier === 'final' && this.phase === 2;
  }

  private podsAlive() {
    return this.pods.some(p => p.active);
  }

  // Throttled so sustained fire reads as flicker rather than a solid white boss
  private flash(part: any, gt: number) {
    if (gt - (part.lastFlash ?? -1000) < 150) return;
    part.lastFlash = gt;
    part.setTintFill(0xffffff);
    part.flashUntil = gt + 30;
  }

  private restoreFlashes(gt: number) {
    for (const part of [this.core, ...this.pods]) {
      if (part.flashUntil && gt > part.flashUntil) {
        part.flashUntil = 0;
        if (part.part === 'pod') part.setTint(this.variant.color);
        else part.clearTint();
      }
    }
  }

  private destroyPod(pod: any) {
    this.host.explode(pod.x, pod.y, this.variant.color, 'medium');
    this.host.addScore(this.cfg.podScore, pod.x, pod.y);
    this.host.dropPowerup(pod.x, pod.y);
    pod.disableBody(true, true);
    if (!this.podsAlive()) {
      this.status.setText('CORE EXPOSED').setColor(HEX.RED);
      this.host.banner('CORE EXPOSED', HEX.RED, 1000);
    }
  }

  private enterPhase(phase: number) {
    this.phase = phase;
    this.transitionUntil = this.host.gt + 1400;
    this.attack = null;
    this.extra = null;
    this.holdPosition = false;
    this.scene.tweens.killTweensOf(this.core);
    this.host.clearEnemyBullets();
    this.host.explode(this.core.x, this.core.y, this.variant.color, 'large');
    this.scene.cameras.main.shake(300, 0.01);
    sfx.warn();
    this.orbitSpeed *= chance(0.5) ? -1 : 1;

    if (this.tier === 'mid') {
      this.host.banner(`${this.variant.name} ENRAGED`, this.variant.colorHex, 1200);
    } else if (!this.overdrive) {
      this.host.banner('PHASE 2', this.variant.colorHex, 1200);
    } else {
      this.host.banner('!! OVERDRIVE !!', HEX.RED, 1400);
      // Sometimes the boss rebuilds its lost pods
      const lost = this.pods.filter(p => !p.active);
      if (lost.length && chance(0.55)) {
        this.scene.time.delayedCall(700, () => {
          if (this.dead) return;
          lost.forEach(p => {
            p.enableBody(true, this.core.x, this.core.y, true, true);
            p.hp = this.variant.podHp / 2;
            p.setTint(this.variant.color);
            p.nextShot = this.host.gt + rand(600, 1500);
          });
          this.status.setText('CORE SHIELDED — DESTROY PODS').setColor(HEX.CYAN);
          this.host.banner('PODS REBUILT', HEX.CYAN, 900);
        });
      }
    }
  }

  // Stops the fight and returns the parts still flying
  private shutdown() {
    this.dead = true;
    this.attack = null;
    this.extra = null;
    this.fx.clear();
    this.scene.tweens.killTweensOf(this.core);
    const parts = [this.core, ...this.pods.filter(p => p.active)];
    parts.forEach(p => (p.body.enable = false));
    [this.label, this.barBg, this.bar, this.status, ...this.ticks].forEach(o => o.destroy());
    return parts;
  }

  // Mid-boss only: flies off if the player takes too long
  private retreat() {
    const parts = this.shutdown();
    this.scene.tweens.add({
      targets: parts, y: '-=460', duration: 1500, ease: 'Cubic.easeIn',
      onComplete: () => {
        parts.forEach(p => p.destroy());
        this.fx.destroy();
      },
    });
    this.host.onBossDefeated(this, true);
  }

  private die() {
    const parts = this.shutdown();
    this.host.clearEnemyBullets();

    const { color } = this.variant;
    const blasts = this.tier === 'mid' ? 8 : 16;
    for (let i = 0; i < blasts; i++) {
      this.scene.time.delayedCall(i * 140, () => {
        const p = i < parts.length ? parts[i] : this.core;
        this.host.explode(p.x + rand(-80, 80), p.y + rand(-60, 60), i % 3 ? color : COLORS.NEON_CYAN, 'medium');
      });
    }
    const finale = blasts * 140 + 80;
    this.scene.tweens.add({ targets: parts, alpha: 0.25, duration: finale });
    this.scene.time.delayedCall(finale, () => {
      this.host.explode(this.core.x, this.core.y, color, 'large');
      if (this.tier === 'final') this.scene.cameras.main.flash(400, 255, 255, 255);
      parts.forEach(p => p.destroy());
      this.fx.destroy();
    });
    this.host.onBossDefeated(this);
  }

  // ---------- attack selection ----------

  private startNextAttack() {
    const pool = this.cfg.attacks[this.phase].filter(a => a !== this.lastAttack);
    const id = weightedPick(pool, pool.map(a => this.variant.favors[a] ?? 1));
    this.lastAttack = id;
    this.attack = this.makeAttack(id);

    // In overdrive, sometimes layer a light attack on top
    if (this.overdrive && !this.extra && chance(this.cfg.overdriveExtra) && !['beam', 'charge', 'wall'].includes(id)) {
      this.extra = this.makeAttack(pick<AttackId>(['aimed', 'ring', 'fan']));
    }
  }

  private get intensity() {
    return this.cfg.intensity + this.phase * 0.22;
  }

  private get mouth() {
    return { x: this.core.x, y: this.core.y + 40 };
  }

  private fire(x: number, y: number, angle: number, speed: number, opts: BulletOpts = {}) {
    this.host.fireEnemyBullet(x, y, angle, speed, { tex: this.variant.bulletTex, ...opts });
  }

  private angleToPlayer(x: number, y: number) {
    const p = this.host.player;
    return Phaser.Math.Angle.Between(x, y, p.x, p.y);
  }

  private ringBurst(x: number, y: number, count: number, speed: number, offset = rand(0, Math.PI * 2)) {
    for (let i = 0; i < count; i++) this.fire(x, y, offset + (Math.PI * 2 * i) / count, speed);
  }

  // Each attack rolls its own random parameters, so no two fights play out the same
  private makeAttack(id: AttackId): Attack {
    const I = this.intensity;
    const PI = Math.PI;

    switch (id) {
      case 'sweep': {
        let t = 0, next = 0;
        let ang = rand(0.3, 0.7) * PI;
        let dir = chance(0.5) ? 1 : -1;
        const dur = rand(2200, 3800);
        const rate = rand(70, 110) / I;
        const turn = rand(1.4, 2.6);
        const speed = rand(210, 270) * I;
        const mirror = this.phase >= 1 && chance(0.7);
        return dt => {
          t += dt * 1000;
          ang += turn * dir * dt;
          if (ang > PI * 0.85) { ang = PI * 0.85; dir = -1; }
          if (ang < PI * 0.15) { ang = PI * 0.15; dir = 1; }
          if (t >= next) {
            next += rate;
            const m = this.mouth;
            this.fire(m.x, m.y, ang, speed);
            if (mirror) this.fire(m.x, m.y, PI - ang, speed * 0.9);
          }
          return t >= dur;
        };
      }

      case 'fan': {
        let t = 0, next = 0, shots = 0;
        const bursts = randInt(2, 3 + this.phase);
        const count = randInt(5, 7) + this.phase * 2;
        const spread = rand(0.8, 1.6);
        const gap = rand(550, 800) / I;
        const speed = rand(190, 250) * I;
        const aimed = chance(0.6);
        return dt => {
          t += dt * 1000;
          if (shots < bursts && t >= next) {
            const m = this.mouth;
            const base = aimed ? this.angleToPlayer(m.x, m.y) : PI / 2 + rand(-0.3, 0.3);
            for (let i = 0; i < count; i++) {
              this.fire(m.x, m.y, base - spread / 2 + (spread * i) / (count - 1), speed * rand(0.95, 1.05));
            }
            shots++;
            next = t + gap;
          }
          return shots >= bursts && t >= next;
        };
      }

      case 'aimed': {
        let t = 0, next = 0, shot = 0, volley = 0, aim = 0;
        const volleys = randInt(3, 5 + this.phase);
        const perVolley = randInt(3, 5);
        const volleyGap = rand(450, 700) / I;
        const speed = rand(320, 380) * I;
        return dt => {
          t += dt * 1000;
          if (volley >= volleys) return t >= next;
          if (t >= next) {
            const m = this.mouth;
            if (shot === 0) aim = this.angleToPlayer(m.x, m.y) + rand(-0.12, 0.12);
            this.fire(m.x + (shot % 2 ? -26 : 26), m.y, aim, speed, { tex: 'needle' });
            shot++;
            if (shot >= perVolley) {
              shot = 0;
              volley++;
              next = t + volleyGap;
            } else {
              next = t + 70;
            }
          }
          return false;
        };
      }

      case 'ring': {
        let t = 0, next = 0, rings = 0;
        const total = randInt(3, 4 + this.phase);
        const count = randInt(12, 16 + this.phase * 4);
        const gap = rand(450, 700) / I;
        const speed = rand(140, 190) * I;
        return dt => {
          t += dt * 1000;
          if (rings < total && t >= next) {
            this.ringBurst(this.core.x, this.core.y, count, rings % 2 ? speed * 1.3 : speed);
            rings++;
            next = t + gap;
          }
          return rings >= total && t >= next;
        };
      }

      case 'wall': {
        this.holdPosition = true;
        let t = 0, next = 0, walls = 0;
        let gapX = rand(80, GAME_WIDTH - 80);
        const total = randInt(3, 4 + this.phase);
        const gapW = rand(95, 120) - this.phase * 8;
        const interval = rand(750, 1000) / I;
        const speed = rand(130, 165) * I;
        return dt => {
          t += dt * 1000;
          if (walls < total && t >= next) {
            const y = this.core.y + 50;
            for (let x = 12; x < GAME_WIDTH; x += 30) {
              if (Math.abs(x - gapX) > gapW / 2) this.fire(x, y, PI / 2, speed, { scale: 0.8 });
            }
            gapX = Phaser.Math.Clamp(gapX + rand(-150, 150), 70, GAME_WIDTH - 70);
            walls++;
            next = t + interval;
          }
          return walls >= total && t >= next;
        };
      }

      case 'spiral': {
        let t = 0, next = 0, flipped = false;
        let a = rand(0, PI * 2);
        let spin = rand(1.8, 3.2) * (chance(0.5) ? 1 : -1);
        const arms = randInt(2, 3 + this.phase);
        const rate = rand(85, 120) / I;
        const dur = rand(2800, 4000);
        const flipAt = chance(0.5) ? dur * rand(0.4, 0.6) : Infinity; // sometimes reverses mid-spin
        const speed = rand(160, 210) * I;
        return dt => {
          t += dt * 1000;
          if (!flipped && t >= flipAt) {
            flipped = true;
            spin = -spin;
          }
          a += spin * dt;
          if (t >= next) {
            next += rate;
            for (let i = 0; i < arms; i++) this.fire(this.core.x, this.core.y, a + (PI * 2 * i) / arms, speed);
          }
          return t >= dur;
        };
      }

      case 'beam': {
        this.holdPosition = true;
        if (!this.beamHinted) {
          this.beamHinted = true;
          this.host.banner('ORBITAL LANCE — DIVE LOW!', HEX.RED, 1500);
        }
        const width = 34 + this.phase * 8;
        const count = Math.min(4, randInt(1, 2 + this.phase));
        const xs = [Phaser.Math.Clamp(this.host.player.x + rand(-30, 30), 30, GAME_WIDTH - 30)];
        for (let guard = 0; xs.length < count && guard < 40; guard++) {
          const x = rand(30, GAME_WIDTH - 30);
          if (xs.every(o => Math.abs(o - x) > width * 2)) xs.push(x);
        }
        const warnMs = rand(900, 1150) - this.phase * 100;
        const fireMs = rand(550, 800);
        let t = 0, fired = false;
        return dt => {
          t += dt * 1000;
          if (t < warnMs) {
            const a = 0.25 + 0.35 * Math.abs(Math.sin(t / 70));
            for (const x of xs) {
              this.fx.fillStyle(COLORS.NEON_RED, a * 0.15);
              this.fx.fillRect(x - width / 2, 0, width, GAME_HEIGHT);
              this.fx.lineStyle(1.5, COLORS.NEON_RED, a);
              this.fx.lineBetween(x - width / 2, 0, x - width / 2, GAME_HEIGHT);
              this.fx.lineBetween(x + width / 2, 0, x + width / 2, GAME_HEIGHT);
            }
          } else if (t < warnMs + fireMs) {
            if (!fired) {
              fired = true;
              sfx.beam();
              this.scene.cameras.main.shake(fireMs, 0.004);
            }
            const flicker = 0.85 + Math.random() * 0.15;
            const p = this.host.player;
            for (const x of xs) {
              this.fx.fillStyle(this.variant.color, 0.25 * flicker);
              this.fx.fillRect(x - width, 0, width * 2, GAME_HEIGHT);
              this.fx.fillStyle(this.variant.color, 0.9 * flicker);
              this.fx.fillRect(x - width / 2, 0, width, GAME_HEIGHT);
              this.fx.fillStyle(0xffffff, 0.9);
              this.fx.fillRect(x - width * 0.18, 0, width * 0.36, GAME_HEIGHT);
              if (this.host.playerAlive() && !this.host.playerIsLow() && Math.abs(p.x - x) < width / 2 + 6) {
                this.host.damagePlayer(DAMAGE.beam);
              }
            }
          }
          return t >= warnMs + fireMs + 250;
        };
      }

      case 'mines': {
        if (!this.minesHinted) {
          this.minesHinted = true;
          this.host.banner('LOW-ALT MINES — CLIMB!', HEX.ORANGE, 1500);
        }
        let t = 0, next = 0, dropped = 0;
        const total = randInt(5, 7 + this.phase * 2);
        return dt => {
          t += dt * 1000;
          if (dropped < total && t >= next) {
            const x = this.core.x + rand(-70, 70);
            this.fire(x, this.core.y + 30, PI / 2 + rand(-0.6, 0.6), rand(80, 130), {
              tex: 'mine', isLow: true, scale: 1, mineAt: this.host.gt + rand(1100, 1800),
            });
            dropped++;
            next = t + 180;
          }
          return dropped >= total && t >= next + 400;
        };
      }

      case 'summon': {
        let t = 0, next = 0, spawned = 0;
        const total = randInt(3, 4 + this.phase);
        return dt => {
          t += dt * 1000;
          if (spawned < total && t >= next) {
            const pods = this.pods.filter(p => p.active);
            const src = pods.length ? pick(pods) : { x: this.core.x + rand(-60, 60), y: this.core.y + 40 };
            this.host.spawnMinion(chance(0.4 + this.phase * 0.15) ? 'seeker' : 'dart', src.x, src.y);
            spawned++;
            next = t + 220;
          }
          return spawned >= total && t >= next + 400;
        };
      }

      case 'rain': {
        let t = 0, next = 0;
        const dur = rand(2200, 3200);
        const rate = rand(60, 90) / I;
        return dt => {
          t += dt * 1000;
          if (t >= next) {
            next += rate;
            this.fire(rand(10, GAME_WIDTH - 10), -10, PI / 2 + rand(-0.15, 0.15), rand(150, 230) * I, { scale: 0.8 });
          }
          return t >= dur;
        };
      }

      case 'charge': {
        this.holdPosition = true;
        sfx.charge();
        let t = 0;
        let stage: 'aim' | 'dash' | 'done' = 'aim';
        const aimMs = rand(600, 850);
        const home = { x: this.core.x, y: this.core.y };
        const target = { x: 0, y: 0 };
        return dt => {
          t += dt * 1000;
          if (stage === 'aim') {
            const p = this.host.player;
            target.x = Phaser.Math.Clamp(p.x, 80, GAME_WIDTH - 80);
            target.y = Math.min(p.y - 80, GAME_HEIGHT - 170);
            this.core.x = home.x + rand(-3, 3);
            const a = 0.3 + 0.4 * Math.abs(Math.sin(t / 60));
            this.fx.lineStyle(2, COLORS.NEON_RED, a);
            this.fx.lineBetween(this.core.x, this.core.y, target.x, target.y);
            this.fx.strokeCircle(target.x, target.y, 28);
            if (t >= aimMs) {
              stage = 'dash';
              this.core.x = home.x;
              this.scene.tweens.add({
                targets: this.core, x: target.x, y: target.y, duration: 380, ease: 'Quad.easeIn',
                onComplete: () => {
                  this.scene.cameras.main.shake(180, 0.012);
                  this.ringBurst(this.core.x, this.core.y, 14 + this.phase * 2, 190);
                  this.scene.tweens.add({
                    targets: this.core, x: rand(120, GAME_WIDTH - 120), y: rand(HOME_Y - 10, HOME_Y + 30), duration: 900, ease: 'Sine.easeInOut',
                    onComplete: () => { stage = 'done'; },
                  });
                },
              });
            }
          }
          return stage === 'done';
        };
      }
    }
  }
}
