// Global type definitions
export {};

declare global {
  interface Window {
    Phaser: any;
  }
}

export interface GameState {
  isPlaying: boolean;
  score: number;
  health: number;
  gameOver: boolean;
}

export enum SceneKeys {
  Boot = 'boot',
  Main = 'main',
  UI = 'ui'
}

// Portrait aspect ratio for vertical shooter
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 640;

export const COLORS = {
  BG_DARK: 0x000000,
  NEON_CYAN: 0x00bcd4,    // Matching website cyan
  NEON_YELLOW: 0xffeb3b,  // Matching website yellow
  NEON_WHITE: 0xffffff,
  GRID_COLOR: 0x1a1a00,   // Dark yellow tint for grid
};