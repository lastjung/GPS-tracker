import React from 'react';

/**
 * RecorderOverlay - A pure UI component to display SmartRecorder's state.
 * 
 * @param {Object} props
 * @param {number|null} props.countdown - Current countdown number
 * @param {boolean} props.isPreparing - Whether the recorder is in preparing phase
 */
export const RecorderOverlay = ({ countdown }) => {
  if (countdown === null) return null;

  return (
    <div className="absolute inset-0 z-[9999] flex items-center justify-center pointer-events-none select-none">
      <div className="relative">
        {/* Glow effect */}
        <div className="absolute inset-0 blur-3xl bg-yellow-400/20 rounded-full animate-pulse"></div>
        
        {/* Main Countdown Text */}
        <div className="text-[12rem] font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce-short">
          {countdown}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce-short {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .animate-bounce-short {
          animation: bounce-short 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
