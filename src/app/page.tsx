'use client';

import PacmanGame from '@/components/pacman/PacmanGame';
import InstallBanner from '@/components/pacman/InstallBanner';

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-[#05050f] text-white overflow-x-hidden relative">
      {/* Background ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-fuchsia-500/10 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[40vw] h-[40vw] rounded-full bg-yellow-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="px-4 py-4 md:py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 shadow-[0_0_15px_rgba(253,224,71,0.6)] flex items-center justify-center">
              <div className="w-0 h-0 border-y-[8px] border-y-transparent border-r-[10px] border-r-[#05050f]" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-black bg-gradient-to-r from-yellow-300 via-cyan-300 to-fuchsia-400 bg-clip-text text-transparent tracking-tight">
                PAC-NEON
              </h1>
              <p className="text-[10px] md:text-xs text-cyan-300/60 font-mono -mt-1">
                Modern Arcade Edition
              </p>
            </div>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300/60 hover:text-cyan-200 text-xs md:text-sm font-mono transition-colors"
          >
            v1.0
          </a>
        </header>

        {/* Game container */}
        <div className="flex-1 flex items-center justify-center px-2 py-4 md:py-6">
          <PacmanGame />
        </div>

        {/* Footer */}
        <footer className="px-4 py-4 text-center text-[10px] md:text-xs text-cyan-300/40 font-mono">
          <p>
            Pac-Neon · Réinvention moderne du classique Pac-Man · Construit avec Next.js + Canvas
          </p>
        </footer>
      </div>

      {/* Bannière d'installation automatique (PWA) */}
      <InstallBanner />
    </main>
  );
}
