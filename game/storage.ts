// localStorage can throw (private mode, blocked storage) — every access is guarded.

const BEST_KEY = 'neonVector.best';
const MUTED_KEY = 'neonVector.muted';

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): number {
  const best = Math.max(score, loadBest());
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // ignore
  }
  return best;
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
}
