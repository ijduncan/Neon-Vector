import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { GAME_WIDTH, GAME_HEIGHT } from './types';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [lastScore, setLastScore] = useState(0);
  const [showAbout, setShowAbout] = useState(false);

  const handleStartGame = () => {
    setGameState('playing');
  };

  const handleGameOver = (score: number) => {
    setLastScore(score);
    setGameState('gameover');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center overflow-hidden font-mono text-white">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-gradient-to-b from-indigo-950 to-black z-0 pointer-events-none"></div>
      
      {/* Scanlines Overlay */}
      <div className="scanlines fixed inset-0 z-50 pointer-events-none"></div>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative bg-[#ffeb3b] border-4 border-[#00bcd4] p-8 rounded shadow-[0_0_30px_rgba(255,235,59,0.4)] max-w-md">
            <button 
              onClick={() => setShowAbout(false)}
              className="absolute top-2 right-4 text-[#00bcd4] hover:text-black transition-colors text-2xl font-bold"
            >
              ✕
            </button>
            <h3 className="text-2xl font-black text-[#00bcd4] mb-4 border-b-2 border-[#00bcd4] pb-2 tracking-tighter italic">
              SYSTEM_INFO
            </h3>
            <div className="text-black leading-relaxed text-sm space-y-4 font-bold">
              <p className="uppercase">
                Welcome to my site. I vibe coded this game in Google AI Studio for your pleasure. It's deployed via github on a platform called Vercel. Feel free to skip to my portfolio site by clicking skip game.
              </p>
            </div>
            <div className="mt-8 text-center">
              <button 
                onClick={() => setShowAbout(false)}
                className="px-6 py-2 bg-[#00bcd4] text-[#ffeb3b] font-black rounded hover:bg-black transition-all text-xs tracking-widest"
              >
                CLOSE_LOG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation Bar (Outside Game Window) */}
      <div className="w-full max-w-screen-xl flex justify-between items-center p-4 z-40 relative">
          <button 
            onClick={() => setShowAbout(true)}
            className="px-4 py-2 bg-[#ffeb3b] border-2 border-[#00bcd4] text-[#00bcd4] font-black text-[10px] md:text-xs hover:bg-[#00bcd4] hover:text-[#ffeb3b] transition-all rounded shadow-md pointer-events-auto"
          >
            ABOUT_DEV
          </button>

          <a 
            href="https://ianjamesduncan.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[#ffeb3b] border-2 border-[#00bcd4] text-[#00bcd4] font-black text-[10px] md:text-xs hover:bg-[#00bcd4] hover:text-[#ffeb3b] transition-all rounded shadow-md pointer-events-auto"
          >
            SKIP GAME >>
          </a>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 w-full relative flex flex-col items-center justify-center min-h-0 px-2 pb-2">
        
        {/* Centered Game Container */}
        <div 
          className="relative h-full max-h-full flex items-center justify-center"
          style={{ aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}` }}
        >
            {/* Start Screen Overlay */}
            {gameState === 'start' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#ffeb3b] z-20 p-4 md:p-8 text-center border-4 border-[#00bcd4] rounded-lg shadow-[0_0_50px_rgba(255,235,59,0.3)]">
                <h1 className="text-4xl md:text-6xl font-black mb-2 text-[#00bcd4] italic tracking-tighter drop-shadow-sm">
                  NEON VECTOR
                </h1>
                <h2 className="text-sm md:text-xl text-[#00bcd4] mb-8 font-black uppercase tracking-[0.2em] border-y-2 border-[#00bcd4] py-1">VECTOR FORCE</h2>
                
                <div className="space-y-2 md:space-y-4 text-black mb-8 text-[11px] md:text-sm bg-white/30 p-4 md:p-6 rounded border-2 border-[#00bcd4] w-full max-w-sm font-bold">
                  <div className="flex items-center justify-between">
                      <span className="text-[#00bcd4] font-black underline italic">PILOT:</span>
                      <span className="italic">[WASD] / CURSORS</span>
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[#00bcd4] font-black underline italic">ALTITUDE:</span>
                      <span className="italic">[P / L] TOGGLE</span>
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[#00bcd4] font-black underline italic">STATUS:</span>
                      <span className="italic">WEAPONS_AUTO</span>
                  </div>
                </div>

                <button 
                  onClick={handleStartGame}
                  className="px-8 py-4 bg-[#00bcd4] text-[#ffeb3b] font-black text-xl md:text-2xl rounded shadow-lg transition-all hover:scale-110 active:scale-95 border-b-8 border-[#008ba3] italic"
                >
                  LAUNCH()
                </button>
            </div>
            )}

            {/* Game Over Overlay */}
            {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#ffeb3b] z-20 p-4 md:p-8 text-center border-8 border-red-600 rounded-lg">
                <h2 className="text-4xl md:text-6xl font-black mb-2 text-red-600 italic tracking-tighter">
                  MISSION FAILED
                </h2>
                <p className="text-[#00bcd4] mb-8 font-black tracking-widest text-sm md:text-base italic">SCORE_SYNC_FAILURE</p>
                
                <div className="mb-8 p-6 border-4 border-[#00bcd4] bg-white/50 rounded w-full max-w-[250px]">
                  <p className="text-black text-xs font-black uppercase mb-1 italic">DATA_LOG</p>
                  <p className="text-4xl md:text-6xl text-[#00bcd4] font-black italic">{lastScore}</p>
                </div>

                <button 
                  onClick={handleStartGame}
                  className="px-8 py-4 bg-red-600 text-white font-black text-xl md:text-2xl rounded shadow-lg transition-all hover:bg-black italic"
                >
                  RETRY_LINK()
                </button>
            </div>
            )}

            {/* Phaser Canvas Wrapper */}
            <div className="w-full h-full">
               <GameCanvas 
                gameActive={gameState === 'playing'} 
                onGameOver={handleGameOver} 
               />
            </div>
        </div>
      </div>

      {/* Footer (Outside Game Window) */}
      <div className="w-full flex justify-center items-center py-4 z-40 relative">
        <div className="text-[10px] md:text-xs text-[#00bcd4] font-black tracking-widest text-center uppercase italic">
          IAN JAMES DUNCAN // NEON_VECTOR // V1.0
        </div>
      </div>
    </div>
  );
};

export default App;