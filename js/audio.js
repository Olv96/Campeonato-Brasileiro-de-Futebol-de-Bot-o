/**
 * audio.js - Sintetizador Procedural de Áudio com Web Audio API
 * Gera efeitos sonoros realistas de futebol de botão (apito, clique de botão, tabela de madeira, gol)
 * sem necessidade de carregar arquivos externos!
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Apito de Árbitro de Futebol (Frequência modulada para o trilo característico)
  playWhistle(isGoal = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gainNode = this.ctx.createGain();

    // Frequência base do apito (aguda e penetrante)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isGoal ? 2600 : 2800, now);

    // LFO para criar o vibrato/trilo do apito
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(35, now); // 35Hz trilo
    lfoGain.gain.setValueAtTime(250, now);

    lfo.connect(osc.frequency);

    const duration = isGoal ? 1.6 : 0.45;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.35, now + 0.04);
    gainNode.gain.setValueAtTime(0.35, now + duration - 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    lfo.start(now);
    osc.start(now);

    lfo.stop(now + duration);
    osc.stop(now + duration);

    // Se for gol ou reinício duplo apito
    if (!isGoal) {
      setTimeout(() => {
        if (!this.muted && this.ctx) {
          this.playShortBeep();
        }
      }, 180);
    }
  }

  playShortBeep() {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2950, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Chute / Batida no Botão Acrílico (Clique seco e oco com amortecimento)
  playKick(force = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const clampedForce = Math.max(0.15, Math.min(1.0, force));
    const now = this.ctx.currentTime;

    // Oscilador de ataque rápido com pitch decrescente
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420 + clampedForce * 300, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

    const volume = 0.25 + clampedForce * 0.45;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // Ruído branco filtrado para dar o estalo plástico característico
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1800, now);
    noiseFilter.Q.setValueAtTime(3, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(clampedForce * 0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    noise.start(now);

    osc.stop(now + 0.12);
    noise.stop(now + 0.05);
  }

  // Batida de madeira na borda da mesa (Tabela)
  playTableBounce(force = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const clampedForce = Math.max(0.1, Math.min(1.0, force));
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

    gain.gain.setValueAtTime(clampedForce * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Comemoração de Gol (Efeito de multidão e fanfarra)
  playGoal() {
    this.playWhistle(true);
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    // Fazer uma fanfarra curta em arpeggio maior (C - E - G - C)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = this.ctx.currentTime + 0.1;

    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);

      gain.gain.setValueAtTime(0, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.5);
    });
  }

  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }
}

export const sounds = new SoundSystem();
