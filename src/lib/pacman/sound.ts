// Sons arcade recréés via Web Audio API
// Synthèse originale inspirée du style sonore d'arcade des années 80
// (aucun sample copyrighté — tout est généré en temps réel)

type SoundName =
  | 'chomp'
  | 'powerUp'
  | 'eatGhost'
  | 'death'
  | 'start'
  | 'extraLife'
  | 'levelComplete'
  | 'ready';

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  // Alterne entre les deux variantes du "waka" (wa / ka)
  private chompToggle = false;
  // Pour pouvoir stopper une séquence en cours
  private activeNodes: AudioNode[] = [];
  private activeTimeouts: ReturnType<typeof setTimeout>[] = [];
  // Distortion partagée (donne le grain "buzzy" du hardware arcade)
  private waveshaper: WaveShaperNode | null = null;

  // Sirène de fond (jouée en boucle pendant le gameplay)
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenLfoGain: GainNode | null = null;
  private sirenLevel = 0;
  private sirenRunning = false;

  init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        // Silent fail
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) {
      this.stopAll();
      this.stopSiren();
    }
  }

  isMuted() {
    return this.muted;
  }

  // === Gestion des nodes actifs ===

  private stopAll() {
    for (const t of this.activeTimeouts) clearTimeout(t);
    this.activeTimeouts = [];
    for (const node of this.activeNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
      } catch {}
      try { (node as AudioNode).disconnect(); } catch {}
    }
    this.activeNodes = [];
  }

  // === Courbe de distortion (waveshaper) ===
  // Reproduit le grain légèrement saturé des circuits audio arcade
  private makeDistortionCurve(amount = 0.4): Float32Array {
    const n = 44100;
    const curve = new Float32Array(n);
    const k = amount * 100;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private getWaveshaper(): WaveShaperNode | null {
    if (!this.ctx) return null;
    if (!this.waveshaper) {
      this.waveshaper = this.ctx.createWaveShaper();
      this.waveshaper.curve = this.makeDistortionCurve(0.25);
      this.waveshaper.oversample = '2x';
      this.waveshaper.connect(this.ctx.destination);
    }
    return this.waveshaper;
  }

  // === Primitives sonores ===

  // Crée un oscillator avec gain, optionnellement routé via le waveshaper
  private createVoice(
    freq: number,
    type: OscillatorType = 'square',
    useDistortion = false
  ): { osc: OscillatorNode; gain: GainNode } | null {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    osc.connect(gain);
    if (useDistortion) {
      const ws = this.getWaveshaper();
      if (ws) gain.connect(ws);
      else gain.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }
    this.activeNodes.push(osc, gain);
    return { osc, gain };
  }

  // Tonalité simple avec enveloppe ADSR
  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.12,
    startTimeOffset = 0,
    envelope?: { attack?: number; decay?: number; sustain?: number; release?: number },
    useDistortion = false
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + startTimeOffset;
    const voice = this.createVoice(freq, type, useDistortion);
    if (!voice) return;
    const { osc, gain } = voice;
    osc.frequency.setValueAtTime(freq, t0);

    const attack = envelope?.attack ?? 0.005;
    const decay = envelope?.decay ?? 0.02;
    const sustainLevel = envelope?.sustain ?? 0.7;
    const release = envelope?.release ?? 0.03;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.linearRampToValueAtTime(volume * sustainLevel, t0 + attack + decay);
    gain.gain.setValueAtTime(volume * sustainLevel, t0 + Math.max(attack + decay, duration - release));
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration + 0.02);

    osc.onended = () => {
      const i1 = this.activeNodes.indexOf(osc);
      if (i1 >= 0) this.activeNodes.splice(i1, 1);
      const i2 = this.activeNodes.indexOf(gain);
      if (i2 >= 0) this.activeNodes.splice(i2, 1);
    };
  }

  // Sweep de fréquence avec courbe paramétrable
  private sweep(
    fromFreq: number,
    toFreq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.12,
    startTimeOffset = 0,
    curve: 'exp' | 'linear' = 'exp',
    useDistortion = false
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + startTimeOffset;
    const voice = this.createVoice(fromFreq, type, useDistortion);
    if (!voice) return;
    const { osc, gain } = voice;

    osc.frequency.setValueAtTime(Math.max(1, fromFreq), t0);
    if (curve === 'exp') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + duration);
    } else {
      osc.frequency.linearRampToValueAtTime(Math.max(1, toFreq), t0 + duration);
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
    gain.gain.setValueAtTime(volume, t0 + Math.max(0.01, duration - 0.04));
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration + 0.02);

    osc.onended = () => {
      const i1 = this.activeNodes.indexOf(osc);
      if (i1 >= 0) this.activeNodes.splice(i1, 1);
      const i2 = this.activeNodes.indexOf(gain);
      if (i2 >= 0) this.activeNodes.splice(i2, 1);
    };
  }

  // === SIRÈNE DE FOND ===
  // Son continu pendant le gameplay, qui monte en pitch selon les dots mangés.
  // Reproduction du "wail" caractéristique : modulation lente de la fréquence.

  startSiren(level = 0) {
    if (!this.ctx || this.muted) return;
    this.sirenLevel = level;
    if (this.sirenRunning) {
      this.updateSirenLevel(level);
      return;
    }
    this.sirenRunning = true;

    const ctx = this.ctx;
    // Oscillateur principal : triangle (plus doux que le carré, moins agressif)
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    // Filtre passe-bas pour adoucir encore le timbre (coupe les harmoniques aiguës)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.5;
    // LFO pour moduler la fréquence (effet de sirène qui monte et descend)
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    // ~1.5 Hz : oscillation lente et apaisante (au lieu de 2.5 Hz)
    this.sirenLfo.frequency.value = 1.5;
    this.sirenLfoGain = ctx.createGain();
    // Profondeur de modulation réduite : ±8 Hz (au lieu de ±25 Hz)
    this.sirenLfoGain.gain.value = 8;
    // Gain de sortie
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;

    // Connexions : LFO -> modulation de fréquence
    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);
    // Osc -> filtre -> gain -> sortie (SANS waveshaper pour éviter la saturation)
    this.sirenOsc.connect(filter);
    filter.connect(this.sirenGain);
    this.sirenGain.connect(ctx.destination);
    this.activeNodes.push(filter);

    // Fréquence de base selon le niveau (plus grave pour moins d'agressivité)
    const baseFreq = this.sirenBaseFreq(level);
    this.sirenOsc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

    // Fade-in plus long et volume final plus faible
    this.sirenGain.gain.setValueAtTime(0, ctx.currentTime);
    this.sirenGain.gain.linearRampToValueAtTime(0.018, ctx.currentTime + 0.8);

    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  private sirenBaseFreq(level: number): number {
    // 5 paliers de sirène — fréquences graves pour un son doux et discret
    // (au lieu de 122-243 Hz qui étaient trop agressifs)
    const freqs = [70, 88, 105, 122, 140];
    return freqs[Math.min(level, freqs.length - 1)];
  }

  updateSirenLevel(level: number) {
    if (!this.ctx || !this.sirenOsc || !this.sirenGain) return;
    if (level === this.sirenLevel) return;
    this.sirenLevel = level;
    const targetFreq = this.sirenBaseFreq(level);
    this.sirenOsc.frequency.linearRampToValueAtTime(targetFreq, this.ctx.currentTime + 0.4);
    // Profondeur du LFO : reste faible et discrète
    if (this.sirenLfoGain) {
      this.sirenLfoGain.gain.linearRampToValueAtTime(8 + level * 2, this.ctx.currentTime + 0.4);
    }
  }

  stopSiren() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (this.sirenGain && this.sirenOsc) {
      try {
        this.sirenGain.gain.cancelScheduledValues(ctx.currentTime);
        this.sirenGain.gain.setValueAtTime(this.sirenGain.gain.value, ctx.currentTime);
        this.sirenGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      } catch {}
      const osc = this.sirenOsc;
      const lfo = this.sirenLfo;
      const gain = this.sirenGain;
      const lfoGain = this.sirenLfoGain;
      setTimeout(() => {
        try { osc.stop(); } catch {}
        try { osc.disconnect(); } catch {}
        try { lfo?.stop(); } catch {}
        try { lfo?.disconnect(); } catch {}
        try { lfoGain?.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      }, 200);
    }
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenLfoGain = null;
    this.sirenGain = null;
    this.sirenRunning = false;
  }

  // === SONS D'ÉVÉNEMENT ===

  private schedule(fn: () => void, delay: number) {
    const t = setTimeout(fn, delay);
    this.activeTimeouts.push(t);
  }

  play(sound: SoundName) {
    this.init();
    if (this.muted || !this.ctx) return;

    switch (sound) {
      case 'chomp': {
        // Le "waka" : un sweep descendant buzzy court
        // L'arcade alterne deux variantes (aiguë/grave) pour le "wa-ka"
        // Durée courte (0.09s) pour garantir un son par dot même à haute cadence
        this.chompToggle = !this.chompToggle;
        const ctx = this.ctx!;
        const t0 = ctx.currentTime;
        const dur = 0.09;

        // Variante aiguë (wa) vs grave (ka)
        const startFreq = this.chompToggle ? 480 : 380;
        const midFreq = this.chompToggle ? 240 : 200;
        const endFreq = this.chompToggle ? 120 : 90;

        // Oscillateur principal : sweep descendant par paliers
        // La courbe "en escalier" reproduit le caractère saccadé du hardware
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(startFreq, t0);
        // Palier 1 : descente rapide vers midFreq
        osc.frequency.exponentialRampToValueAtTime(midFreq, t0 + dur * 0.4);
        // Palier 2 : plateau court (le "claquement")
        osc.frequency.setValueAtTime(midFreq, t0 + dur * 0.5);
        // Palier 3 : descente finale vers endFreq
        osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);

        // Enveloppe d'amplitude avec attaque nette et release court
        // Volume réduit (0.15 -> 0.09) pour moins de fatigue auditive
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.09, t0 + 0.003);
        gain.gain.setValueAtTime(0.09, t0 + dur * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        // Route DIRECT vers la sortie (sans waveshaper) pour un son moins agressif
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
        this.activeNodes.push(osc, gain);
        osc.onended = () => {
          const i1 = this.activeNodes.indexOf(osc);
          if (i1 >= 0) this.activeNodes.splice(i1, 1);
          const i2 = this.activeNodes.indexOf(gain);
          if (i2 >= 0) this.activeNodes.splice(i2, 1);
        };

        // Couche harmonique (une quinte au-dessus) — volume réduit
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(startFreq * 1.5, t0);
        osc2.frequency.exponentialRampToValueAtTime(endFreq * 1.5, t0 + dur);
        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0, t0);
        gain2.gain.linearRampToValueAtTime(0.025, t0 + 0.003);
        gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(t0);
        osc2.stop(t0 + dur + 0.02);
        this.activeNodes.push(osc2, gain2);
        osc2.onended = () => {
          const i1 = this.activeNodes.indexOf(osc2);
          if (i1 >= 0) this.activeNodes.splice(i1, 1);
          const i2 = this.activeNodes.indexOf(gain2);
          if (i2 >= 0) this.activeNodes.splice(i2, 1);
        };
        break;
      }

      case 'powerUp': {
        // Séquence montante en arpège quand on mange un power pellet
        // 4 notes ascendantes avec harmonique
        const notes = [330, 392, 494, 587];
        notes.forEach((f, i) => {
          this.tone(f, 0.13, 'square', 0.14, i * 0.09, {
            attack: 0.003, decay: 0.015, sustain: 0.7, release: 0.04,
          }, true);
          this.tone(f * 2, 0.13, 'square', 0.04, i * 0.09);
        });
        break;
      }

      case 'eatGhost': {
        // Son montant très caractéristique quand on mange un fantôme
        // Sweep rapide qui monte sur ~1 octave et demi + couche harmonique
        const ctx = this.ctx!;
        const t0 = ctx.currentTime;
        const dur = 0.4;

        // Sweep montant principal avec courbe exponentielle
        this.sweep(180, 1100, dur, 'square', 0.15, 0, 'exp', true);
        // Couche harmonique (une octave au-dessus)
        this.sweep(360, 2200, dur, 'square', 0.05, 0, 'exp', true);

        // Petite "explosion" percussive au début (bruit blanc filtré)
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 900;
        filt.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
        src.connect(filt);
        filt.connect(g);
        g.connect(ctx.destination);
        src.start(t0);
        break;
      }

      case 'death': {
        // Son de mort en "warble" descendant (tremolo + descente par paliers)
        // Reproduction du fameux effet "wah-wah-wah" descendant
        const ctx = this.ctx!;
        const t0 = ctx.currentTime;
        const totalDur = 1.5;

        // Oscillateur principal : descente par paliers (effet "wah-wah")
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(680, t0);
        // Descente en 8 marches (chute d'environ 12% par marche)
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          const f = 680 * Math.pow(0.86, i);
          osc.frequency.setValueAtTime(f, t0 + (i * totalDur) / steps);
        }

        // LFO pour le tremolo (le côté "wah-wah" : amplitude qui vibre vite)
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 16; // 16 Hz : tremolo rapide
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5; // profondeur de modulation d'amplitude
        const baseGain = ctx.createGain();
        baseGain.gain.value = 0.16;

        // Enveloppe d'amplitude (fade-in puis long fade-out)
        const envGain = ctx.createGain();
        envGain.gain.setValueAtTime(0, t0);
        envGain.gain.linearRampToValueAtTime(1, t0 + 0.02);
        envGain.gain.setValueAtTime(1, t0 + totalDur * 0.65);
        envGain.gain.exponentialRampToValueAtTime(0.0001, t0 + totalDur);

        // Connexions : LFO module l'amplitude (tremolo)
        lfo.connect(lfoGain);
        lfoGain.connect(baseGain.gain);
        osc.connect(baseGain);
        baseGain.connect(envGain);
        // Route via le waveshaper
        const ws = this.getWaveshaper();
        if (ws) envGain.connect(ws);
        else envGain.connect(ctx.destination);

        osc.start(t0);
        osc.stop(t0 + totalDur + 0.05);
        lfo.start(t0);
        lfo.stop(t0 + totalDur + 0.05);
        this.activeNodes.push(osc, lfo, lfoGain, baseGain, envGain);

        // Couche grave (sawtooth) pour le côté menaçant
        this.sweep(400, 40, totalDur, 'sawtooth', 0.06, 0, 'exp', true);
        break;
      }

      case 'ready': {
        // Mélodie courte pendant l'écran "READY"
        // Style fanfare d'arcade
        const melody = [
          { f: 523, d: 0.15 },  // C5
          { f: 659, d: 0.15 },  // E5
          { f: 784, d: 0.15 },  // G5
          { f: 1047, d: 0.30 }, // C6
        ];
        let acc = 0;
        for (const n of melody) {
          this.tone(n.f, n.d, 'square', 0.14, acc, {
            attack: 0.005, decay: 0.02, sustain: 0.7, release: 0.05,
          }, true);
          this.tone(n.f * 2, n.d, 'square', 0.04, acc);
          acc += n.d;
        }
        break;
      }

      case 'start': {
        // Mélodie de début de partie (fanfare d'arcade)
        const melody = [
          { f: 392, d: 0.12 },  // G4
          { f: 523, d: 0.12 },  // C5
          { f: 659, d: 0.12 },  // E5
          { f: 784, d: 0.12 },  // G5
          { f: 1047, d: 0.18 }, // C6
          { f: 784, d: 0.12 },  // G5
          { f: 1047, d: 0.30 }, // C6
        ];
        let acc = 0;
        for (const n of melody) {
          this.tone(n.f, n.d, 'square', 0.14, acc, {
            attack: 0.005, decay: 0.02, sustain: 0.7, release: 0.05,
          }, true);
          this.tone(n.f * 0.5, n.d, 'triangle', 0.06, acc);
          acc += n.d;
        }
        break;
      }

      case 'extraLife': {
        const melody = [
          { f: 1047, d: 0.10 },
          { f: 1319, d: 0.10 },
          { f: 1568, d: 0.20 },
        ];
        let acc = 0;
        for (const n of melody) {
          this.tone(n.f, n.d, 'square', 0.12, acc, {
            attack: 0.005, decay: 0.02, sustain: 0.7, release: 0.05,
          }, true);
          acc += n.d;
        }
        break;
      }

      case 'levelComplete': {
        const melody = [
          { f: 523, d: 0.12 },
          { f: 659, d: 0.12 },
          { f: 784, d: 0.12 },
          { f: 1047, d: 0.12 },
          { f: 1319, d: 0.25 },
        ];
        let acc = 0;
        for (const n of melody) {
          this.tone(n.f, n.d, 'square', 0.13, acc, {
            attack: 0.005, decay: 0.02, sustain: 0.7, release: 0.05,
          }, true);
          this.tone(n.f * 2, n.d, 'square', 0.04, acc);
          acc += n.d;
        }
        break;
      }
    }
  }

  stopChomp() {
    this.stopAll();
  }
}

export const soundManager = new SoundManager();
