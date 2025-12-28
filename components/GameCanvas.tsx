import React, { useEffect, useRef } from 'react';
import { BootScene } from '../game/scenes/BootScene';
import { MainScene } from '../game/scenes/MainScene';
import { GAME_WIDTH, GAME_HEIGHT } from '../types';

interface GameCanvasProps {
  onGameOver: (score: number) => void;
  gameActive: boolean;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onGameOver, gameActive }) => {
  const gameRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameActive && !gameRef.current && containerRef.current && window.Phaser) {
      const config = {
        type: window.Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: containerRef.current,
        backgroundColor: '#0a0a12', // Match BG_DARK
        scale: {
          mode: window.Phaser.Scale.FIT,
          autoCenter: window.Phaser.Scale.CENTER_BOTH
        },
        physics: {
          default: 'arcade',
          arcade: {
            debug: false
          }
        },
        scene: [BootScene, MainScene]
      };

      const game = new window.Phaser.Game(config);
      gameRef.current = game;

      game.events.once('ready', () => {
        game.registry.set('onGameOver', onGameOver);
      });
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [gameActive]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        height: '100%',
        aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}` 
      }}
      className="relative rounded-lg overflow-hidden shadow-[0_0_50px_rgba(0,188,212,0.2)] border-2 border-slate-800 bg-[#0a0a12]"
    />
  );
};

export default GameCanvas;