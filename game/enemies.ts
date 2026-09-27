import { COLORS } from '../types';

// Damage the player takes (hull is 100)
export const DAMAGE = {
  bullet: 15,
  needle: 22,
  crash: 30,
  heavyCrash: 45, // bombers and sentinels
  bossContact: 35,
  beam: 35,
};

export type EnemyKind = 'dart' | 'weaver' | 'bomber' | 'sentinel' | 'seeker';

export interface EnemyDef {
  texture: string;
  hp: number;
  score: number;
  speed: number;   // base descent, px/sec
  radius: number;  // hitbox radius at full scale
  color: number;   // explosion color
  breach: boolean; // counts toward BREACH if it escapes off the bottom
  drop: number;    // powerup drop chance
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  dart:     { texture: 'eDart',     hp: 1,  score: 100, speed: 230, radius: 12, color: COLORS.NEON_YELLOW,  breach: false, drop: 0.03 },
  weaver:   { texture: 'eWeaver',   hp: 2,  score: 150, speed: 110, radius: 14, color: COLORS.NEON_MAGENTA, breach: true,  drop: 0.05 },
  bomber:   { texture: 'eBomber',   hp: 7,  score: 400, speed: 55,  radius: 22, color: COLORS.NEON_YELLOW,  breach: true,  drop: 0.25 },
  sentinel: { texture: 'eSentinel', hp: 16, score: 800, speed: 120, radius: 22, color: COLORS.NEON_ORANGE,  breach: true,  drop: 0.6 },
  seeker:   { texture: 'eSeeker',   hp: 1,  score: 200, speed: 170, radius: 10, color: COLORS.NEON_MAGENTA, breach: false, drop: 0.03 },
};

// Per-enemy runtime state, stored on the sprite as `sprite.ai`
export interface EnemyAI {
  kind: EnemyKind;
  hp: number;
  isLow: boolean;
  minion: boolean;
  age: number;       // seconds alive
  vx: number;
  vy: number;
  baseX: number;     // weaver: centre line of the sine path
  freq: number;      // weaver: sine frequency
  amp: number;       // weaver: sine amplitude
  nextShot: number;  // game-time ms
  stopY: number;     // sentinel: where it parks
  holdUntil: number; // sentinel: when it leaves
  mode: 'enter' | 'hold' | 'exit';
  homeUntil: number; // seeker: stops steering after this
  flashUntil: number;
}

export type FormationId = 'solo' | 'dartV' | 'dartLine' | 'weaverSnake' | 'bomberPair' | 'seekers' | 'sentinel';

// `from` = seconds into the run before the formation can appear
export const FORMATIONS: Array<{ id: FormationId; weight: number; from: number }> = [
  { id: 'solo',        weight: 2,   from: 0 },
  { id: 'dartV',       weight: 3,   from: 6 },
  { id: 'weaverSnake', weight: 2.5, from: 15 },
  { id: 'dartLine',    weight: 2,   from: 30 },
  { id: 'bomberPair',  weight: 2,   from: 45 },
  { id: 'seekers',     weight: 1.6, from: 70 },
  { id: 'sentinel',    weight: 1.4, from: 95 },
];
