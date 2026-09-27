export const rand = (min: number, max: number) => min + Math.random() * (max - min);

export const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

export const chance = (p: number) => Math.random() < p;

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
