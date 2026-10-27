'use client';

import { useEffect, useState, useCallback } from 'react';

const DISMISS_KEY = 'pac-neon-install-dismissed';
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24h avant de réafficher
const SHOW_DELAY = 2500; // ms avant d'afficher la bannière

// Détection d'iOS (Safari ne supporte pas beforeinstallprompt)
function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && 'ontouchend' in document);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari utilise un navigator.standalone
    (window.navigator as any).standalone === true
  );
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [installed, setInstalled] = useState<boolean>(isStandalone);

  // Vérifier si l'utilisateur a récemment refusé
  const wasRecentlyDismissed = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (!ts) return false;
      const dismissed = parseInt(ts, 10);
      return Date.now() - dismissed < DISMISS_DURATION;
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    setShowIOSInstructions(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }, []);

  // Capturer beforeinstallprompt (Chrome, Edge, Android)
  useEffect(() => {
    if (installed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Afficher la bannière après un court délai si pas récemment refusée
      if (!wasRecentlyDismissed()) {
        setTimeout(() => setShow(true), SHOW_DELAY);
      }
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    // Sur iOS (pas de beforeinstallprompt), afficher les instructions
    // après un délai si pas déjà installé et pas récemment refusé
    if (isIOS() && !isStandalone() && !wasRecentlyDismissed()) {
      const timer = setTimeout(() => setShowIOSInstructions(true), SHOW_DELAY);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onAppInstalled);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [installed, wasRecentlyDismissed]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setShow(false);
      } else {
        // Refus → mémoriser
        dismiss();
      }
    } catch {
      dismiss();
    }
    setDeferredPrompt(null);
  }, [deferredPrompt, dismiss]);

  // Ne rien afficher si déjà installé
  if (installed) return null;

  // Bannière Chrome/Edge/Android
  if (show && deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-[slideUp_0.3s_ease-out]">
        <style>{`
          @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
          }
        `}</style>
        <div className="bg-gradient-to-r from-cyan-900/95 to-fuchsia-900/95 backdrop-blur-md border border-cyan-400/50 rounded-2xl shadow-[0_8px_32px_rgba(34,211,238,0.3)] p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(253,224,71,0.5)]">
            <span className="text-2xl">🎮</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Installer Pac-Neon</p>
            <p className="text-cyan-200/80 text-xs">Jouez hors ligne en plein écran</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black text-sm font-bold transition-all shadow-[0_0_10px_rgba(253,224,71,0.4)]"
            >
              Installer
            </button>
            <button
              onClick={dismiss}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs transition-colors flex items-center justify-center"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Instructions spécifiques iOS (Safari ne supporte pas l'installation programmatique)
  if (showIOSInstructions) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-[slideUp_0.3s_ease-out]">
        <style>{`
          @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
          }
        `}</style>
        <div className="bg-gradient-to-r from-cyan-900/95 to-fuchsia-900/95 backdrop-blur-md border border-cyan-400/50 rounded-2xl shadow-[0_8px_32px_rgba(34,211,238,0.3)] p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(253,224,71,0.5)]">
              <span className="text-2xl">🎮</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm mb-1">Installer Pac-Neon</p>
              <p className="text-cyan-200/80 text-xs mb-2">
                Pour installer sur iPhone/iPad :
              </p>
              <ol className="text-white/90 text-xs space-y-1 list-decimal list-inside">
                <li>
                  Appuyez sur{' '}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 text-white text-[10px] font-bold align-middle">⬆</span>
                  {' '}(Partager)
                </li>
                <li>
                  Choisissez{' '}
                  <span className="text-cyan-300 font-semibold">« Sur l'écran d'accueil »</span>
                </li>
                <li>Appuyez sur « Ajouter »</li>
              </ol>
            </div>
            <button
              onClick={dismiss}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs transition-colors flex items-center justify-center shrink-0"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
