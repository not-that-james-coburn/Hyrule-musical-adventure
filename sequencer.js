import * as Tone from 'tone';

// Track active block info for progress bar calculations (in Transport seconds)
export let currentBlockDurationSec = 12.8;
export let currentBlockStartTransportSec = 0;

// Helper to convert MIDI pitch number to note name (e.g. 60 -> "C4")
function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

// 1. Measure-Based Block Mapping matching hyrule_field_midi.json (8 bars each)
const blockMap = {
  INTRO: { startBar: 0, endBar: 17 },

  EXPLORATION: [
    { startBar: 17, endBar: 25 },
    { startBar: 25, endBar: 33 },
    { startBar: 33, endBar: 41 },
    { startBar: 41, endBar: 49 },
    { startBar: 49, endBar: 57 },
    { startBar: 57, endBar: 65 }
  ],

  BATTLE_INTRO: { startBar: 64, endBar: 72 },

  BATTLE: [
    { startBar: 72, endBar: 80 },
    { startBar: 80, endBar: 88 },
    { startBar: 88, endBar: 96 },
    { startBar: 96, endBar: 104 },
    { startBar: 104, endBar: 112 }
  ],

  BATTLE_OUTRO: { startBar: 112, endBar: 120 },

  QUIET: [
    { startBar: 137, endBar: 145 },
    { startBar: 145, endBar: 153 },
    { startBar: 153, endBar: 161 },
    { startBar: 161, endBar: 169 },
    { startBar: 169, endBar: 177 }
  ]
};

export class HyruleSequencer {
  constructor() {
    // App State tracking
    this.currentState = 'EXPLORATION'; // Options: 'EXPLORATION', 'IDLE', 'BATTLE', 'QUIET', 'BATTLE_INTRO', 'BATTLE_OUTRO'
    this.pendingStateChange = null;

    // Timing constants matching Koji Kondo's MIDI design (150 BPM main theme, 8 bars per block)
    this.BPM = 150;
    this.BEATS_PER_BAR = 4;
    this.BARS_PER_BLOCK = 8;
    this.BEATS_PER_BLOCK = this.BEATS_PER_BAR * this.BARS_PER_BLOCK; // 32 Beats (12.8s)

    // Audio routing infrastructure
    this.players = {};
    this.gains = {
      exploreCore: new Tone.Gain(1),
      explorePercussion: new Tone.Gain(1),
      idleHarp: new Tone.Gain(0),
      battleMusic: new Tone.Gain(0)
    };

    this.midiData = null;
    this.manifest = null;
    this.PPQ = 960;
    this.soundRack = null;
    this.musicalBlockPart = null;
    this.phraseScheduler = null;

    this.explorationCueSequenceIndex = 0;
    this.currentExplorationBlockIndex = null;
    this.currentBattleBlockIndex = 0;

    this.currentBlockStartTransportSec = 0;
    this.currentBlockDurationSec = 12.8;

    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Configure global Transport timeline
      const transport = Tone.getTransport();
      transport.bpm.value = this.BPM;
      transport.timeSignature = [4, 4];

      // 1. Output Pipeline: Reverb + Master Limiter
      this.masterLimiter = new Tone.Limiter(-1).toDestination();
      this.masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(this.masterLimiter);

      // Connect localized gains to master reverb
      this.gains.exploreCore.connect(this.masterReverb);
      this.gains.explorePercussion.connect(this.masterReverb);
      this.gains.idleHarp.connect(this.masterReverb);
      this.gains.battleMusic.connect(this.masterReverb);

      // 2. Load Assets (manifest + MIDI data)
      await this.loadProjectAssets();

      // 3. Build SoundFont Rack & Instruments
      this.soundRack = this.createSoundfontRack();

      // 4. Single continuous Part for triggering scheduled MIDI note events
      this.musicalBlockPart = new Tone.Part((time, noteEvent) => {
        const sampler = this.getSamplerForTrack(noteEvent.trIdx);
        this.triggerSafeNote(sampler, noteEvent, noteEvent.duration, time);
      }, []).start(0);

      // 5. Phase-Locking Clock Loop: fires precisely on the downbeat of every 8-measure segment block
      this.phraseScheduler = new Tone.Loop((time) => {
        this.onPhraseDownbeat(time);
      }, `${this.BARS_PER_BLOCK}m`).start(0);

      // Wait for soundfont samples to finish buffering in browser
      await Tone.loaded();

      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  async loadProjectAssets() {
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const cleanBase = envBase.endsWith('/') ? envBase : envBase + '/';

    const manifestCandidateUrls = [
      `${cleanBase}soundfont/`,
      `${cleanBase}public/soundfont/`,
      './soundfont/',
      './public/soundfont/'
    ];

    for (const candidate of manifestCandidateUrls) {
      try {
        const res = await fetch(`${candidate}manifest.json`);
        if (res.ok) {
          this.soundfontBaseUrl = candidate;
          this.manifest = await res.json();
          break;
        }
      } catch (e) {
        // ignore
      }
    }

    const midiCandidateUrls = [
      `${cleanBase}hyrule_field_midi.json`,
      `${cleanBase}public/hyrule_field_midi.json`,
      './hyrule_field_midi.json',
      './public/hyrule_field_midi.json'
    ];

    for (const url of midiCandidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          this.midiData = await res.json();
          if (this.midiData && this.midiData.header && this.midiData.header.ppq) {
            this.PPQ = this.midiData.header.ppq;
          }
          break;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  buildSamplerUrls(filterFn) {
    const urls = {};
    if (!this.manifest) return urls;
    for (const [key, item] of Object.entries(this.manifest)) {
      if (filterFn(key, item)) {
        const noteName = midiToNoteName(item.pitch);
        const relativePath = item.file.startsWith('soundfont/') ? item.file.replace('soundfont/', '') : item.file;
        urls[noteName] = relativePath;
      }
    }
    return urls;
  }

  createSoundfontRack() {
    const sampleSpecs = {
      piano: { filter: k => k.startsWith('Grand Piano'), defaultVol: -6 },
      trombone: { filter: k => k.startsWith('Trombone'), defaultVol: -2 },
      trumpet: { filter: k => k.startsWith('Trumpet'), defaultVol: -2 },
      brassSection: { filter: k => k.startsWith('Brass Section'), defaultVol: -3 },
      stringEnsemble: { filter: k => k.startsWith('StrLoop'), defaultVol: -5 },
      stringEnsemble2: { filter: k => k.startsWith('StrLoop'), defaultVol: -5 },
      cello: { filter: k => k.startsWith('Cello'), defaultVol: -4 },
      doubleBass: { filter: k => k.startsWith('Double Bass'), defaultVol: -3 },
      pickBass: { filter: k => k.startsWith('Pick Bass'), defaultVol: -2 },
      flute: { filter: k => k.startsWith('Flute'), defaultVol: -3 },
      tenorSax: { filter: k => k.startsWith('Tenor Sax'), defaultVol: -3 },
      ocarina: { filter: k => k.startsWith('Ocarina'), defaultVol: -2 },
      harp: { filter: k => k.startsWith('Orchestral Harp'), defaultVol: -4 },
      accordion: { filter: k => k.startsWith('Accordion'), defaultVol: -5 },
      marimba: { filter: k => k.startsWith('Marimba'), defaultVol: -3 },
      vibraphone: { filter: k => k.startsWith('Vibraphone'), defaultVol: -3 },
      timpani: { filter: k => k.startsWith('Timpani'), defaultVol: -2 },
      snare: { filter: k => k.startsWith('Standard Snare 3') || k.startsWith('Jazz Snare'), defaultVol: -3 },
      tom: { filter: k => k.startsWith('Standard Tom 5'), defaultVol: -3 }
    };

    const samplers = {};
    for (const [instKey, spec] of Object.entries(sampleSpecs)) {
      const urls = this.buildSamplerUrls(spec.filter);
      if (Object.keys(urls).length > 0) {
        const sampler = new Tone.Sampler({ urls, baseUrl: this.soundfontBaseUrl });
        sampler.volume.value = spec.defaultVol;

        // Routing matrix into dynamic stems:
        if (instKey === 'snare' || instKey === 'tom') {
          sampler.connect(this.gains.explorePercussion);
          sampler.connect(this.gains.battleMusic);
        } else if (instKey === 'harp') {
          sampler.connect(this.gains.idleHarp);
          sampler.connect(this.gains.exploreCore);
          sampler.connect(this.gains.battleMusic);
        } else {
          sampler.connect(this.gains.exploreCore);
          sampler.connect(this.gains.battleMusic);
        }
        samplers[instKey] = sampler;
      }
    }

    // Drum synths for percussion elements without soundfont note samples
    const kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    kickSynth.volume.value = -6;
    kickSynth.connect(this.gains.explorePercussion);
    kickSynth.connect(this.gains.battleMusic);

    const hihatSynth = new Tone.MetalSynth({
      frequency: 200, envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
    });
    hihatSynth.volume.value = -22;
    hihatSynth.connect(this.gains.explorePercussion);
    hihatSynth.connect(this.gains.battleMusic);

    function releaseAll() {
      Object.values(samplers).forEach(s => {
        if (s && typeof s.releaseAll === 'function') s.releaseAll();
      });
    }

    return {
      samplers,
      kickSynth,
      hihatSynth,
      releaseAll
    };
  }

  getInstrumentKeyForTrack(trackIndex) {
    if (!this.midiData || !this.midiData.tracks) return 'piano';
    const tr = this.midiData.tracks[trackIndex];
    if (!tr) return 'piano';

    const channel = tr.channel;
    if (channel === 9 || (tr.instrument && tr.instrument.family === 'drums')) return 'percussion';

    const instNumber = tr.instrument ? tr.instrument.number : 0;
    const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();

    if (instNumber !== 0 && instName) {
      if (instName.includes('trombone')) return 'trombone';
      if (instName.includes('trumpet')) return 'trumpet';
      if (instName.includes('brass section') || instName.includes('brass')) return 'brassSection';
      if (instName.includes('string ensemble 2')) return 'stringEnsemble2';
      if (instName.includes('string') || instName.includes('ensemble')) return 'stringEnsemble';
      if (instName.includes('contrabass')) return 'doubleBass';
      if (instName.includes('tenor sax') || instName.includes('sax')) return 'tenorSax';
      if (instName.includes('flute')) return 'flute';
      if (instName.includes('ocarina')) return 'ocarina';
      if (instName.includes('harp')) return 'harp';
      if (instName.includes('reed organ') || instName.includes('organ') || instName.includes('accordion')) return 'accordion';
      if (instName.includes('electric bass') || instName.includes('pick bass') || instName.includes('bass')) return 'pickBass';
      if (instName.includes('marimba')) return 'marimba';
      if (instName.includes('vibraphone')) return 'vibraphone';
      if (instName.includes('timpani')) return 'timpani';
    }

    switch (channel) {
      case 0: return 'trombone';
      case 1: return 'trumpet';
      case 2: return 'brassSection';
      case 3: return 'stringEnsemble';
      case 4: return 'tenorSax';
      case 5: return 'flute';
      case 6: return 'harp';
      case 7: return 'accordion';
      case 8: return 'pickBass';
      case 10: return 'marimba';
      case 11: return 'ocarina';
      case 12: return 'vibraphone';
      case 13: return 'stringEnsemble';
      case 14: return 'timpani';
      case 15: return 'doubleBass';
      default: return 'piano';
    }
  }

  getSamplerForTrack(trackIndex) {
    const key = this.getInstrumentKeyForTrack(trackIndex);
    if (key === 'percussion') return 'percussion';
    return this.soundRack ? (this.soundRack.samplers[key] || this.soundRack.samplers.piano) : null;
  }

  triggerSafeNote(sampler, note, durationSec, time) {
    if (!this.soundRack) return;
    const now = Tone.now();
    let safeTime = Math.max(time, now);

    if (sampler === 'percussion') {
      const midiPitch = note.midi;
      if (midiPitch === 35 || midiPitch === 36) {
        const lastTime = this.soundRack.kickSynth._lastTriggerTime || 0;
        safeTime = Math.max(safeTime, lastTime + 0.002);
        this.soundRack.kickSynth._lastTriggerTime = safeTime;
        this.soundRack.kickSynth.triggerAttackRelease('C1', durationSec, safeTime, note.velocity);
      } else if (midiPitch === 38 || midiPitch === 40) {
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          snareSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
        }
      } else if (midiPitch === 42 || midiPitch === 44) {
        const lastTime = this.soundRack.hihatSynth._lastTriggerTime || 0;
        safeTime = Math.max(safeTime, lastTime + 0.002);
        this.soundRack.hihatSynth._lastTriggerTime = safeTime;
        this.soundRack.hihatSynth.triggerAttackRelease(durationSec, safeTime, note.velocity * 0.7);
      } else if (midiPitch >= 41 && midiPitch <= 50) {
        const tomSampler = this.soundRack.samplers.tom;
        if (tomSampler && tomSampler.loaded) {
          tomSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
        } else if (this.soundRack.samplers.timpani && this.soundRack.samplers.timpani.loaded) {
          this.soundRack.samplers.timpani.triggerAttackRelease('D3', durationSec, safeTime, note.velocity);
        }
      } else {
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          snareSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
        }
      }
    } else {
      if (sampler && sampler.loaded) {
        sampler.triggerAttackRelease(note.name, durationSec, safeTime, note.velocity);
      }
    }
  }

  tickToSeconds(targetTick) {
    if (!this.midiData || !this.midiData.header || !this.midiData.header.tempos) {
      return (targetTick / (this.PPQ * (this.BPM / 60)));
    }

    const sortedTempos = [...this.midiData.header.tempos].sort((a, b) => a.ticks - b.ticks);

    let currentTime = 0.0;
    let currentTick = 0;
    let currentBpm = sortedTempos.length > 0 ? sortedTempos[0].bpm : this.BPM;

    for (const t of sortedTempos) {
      if (t.ticks >= targetTick) break;
      const deltaTicks = t.ticks - currentTick;
      const secondsPerTick = (60.0 / currentBpm) / this.PPQ;
      currentTime += deltaTicks * secondsPerTick;
      currentTick = t.ticks;
      currentBpm = t.bpm;
    }

    const deltaTicks = targetTick - currentTick;
    const secondsPerTick = (60.0 / currentBpm) / this.PPQ;
    currentTime += deltaTicks * secondsPerTick;

    return currentTime;
  }

  /**
   * Expose clean hook API for UI buttons to switch the state machine mode.
   */
  setState(newState) {
    if (newState === this.currentState && !this.pendingStateChange) return;

    if (newState === 'IDLE' || (this.currentState === 'IDLE' && newState === 'EXPLORATION')) {
      // MOVEMENT MIX RULES: Execute immediate volume envelope crossfades mid-bar (within 400ms)
      this.currentState = newState;
      this.pendingStateChange = null;
      this.executeMovementCrossfade();
    } else if (newState === 'BATTLE' || newState === 'EXPLORATION' || newState === 'QUIET') {
      // COMBAT ENCOUNTER RULES: Defer execution until the master clock loop hits the 8-bar boundary
      this.pendingStateChange = newState;
      console.log(`Battle/mode state transition registered (${newState}). Pending phrase boundary break...`);
    }
  }

  /**
   * Mid-bar linear volume tracking for running vs standing still
   */
  executeMovementCrossfade() {
    const now = Tone.now();
    const fadeTime = 0.4; // Smooth real-time shift time in seconds

    if (this.currentState === 'IDLE') {
      // Link stops moving: instantly drop active explore rhythms, bring up quiet harps
      this.gains.explorePercussion.gain.linearRampToValueAtTime(0, now + fadeTime);
      this.gains.idleHarp.gain.linearRampToValueAtTime(1, now + fadeTime);
    } else if (this.currentState === 'EXPLORATION') {
      // Link runs again: immediately dial up exploration layers, mute the quiet harp stem
      this.gains.explorePercussion.gain.linearRampToValueAtTime(1, now + fadeTime);
      this.gains.idleHarp.gain.linearRampToValueAtTime(0, now + fadeTime);
    }
  }

  /**
   * Dynamic sequence branching evaluation running at every 8-bar block downbeat marker
   */
  handleDeferredTransitions(timelineTime) {
    const fadeTime = 0.15; // Heroic crossfade transition rate over downbeat

    if (this.pendingStateChange) {
      if (this.pendingStateChange === 'BATTLE') {
        // Mute exploration layer nodes on downbeat
        this.gains.exploreCore.gain.setValueAtTime(1, timelineTime);
        this.gains.exploreCore.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.explorePercussion.gain.setValueAtTime(this.currentState === 'IDLE' ? 0 : 1, timelineTime);
        this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.idleHarp.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

        // Un-mute combat layers seamlessly on the shared beat marker
        this.gains.battleMusic.gain.setValueAtTime(0, timelineTime);
        this.gains.battleMusic.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);

        this.currentState = 'BATTLE_INTRO';
        this.pendingStateChange = null;
      } else if (this.pendingStateChange === 'EXPLORATION') {
        if (this.currentState === 'BATTLE' || this.currentState === 'BATTLE_INTRO') {
          // Play battle victory flourish (BATTLE_OUTRO) before resolving to exploration
          this.currentState = 'BATTLE_OUTRO';
          this.pendingStateChange = null;
        } else {
          this.gains.battleMusic.gain.setValueAtTime(1, timelineTime);
          this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

          this.gains.exploreCore.gain.setValueAtTime(0, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(0, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

          this.currentState = 'EXPLORATION';
          this.pendingStateChange = null;
        }
      } else if (this.pendingStateChange === 'QUIET') {
        this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.idleHarp.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
        this.gains.exploreCore.gain.linearRampToValueAtTime(0.8, timelineTime + fadeTime);

        this.currentState = 'QUIET';
        this.pendingStateChange = null;
      }
    } else {
      // Natural chain transitions when an intro or flourish completes its 8-bar block
      if (this.currentState === 'BATTLE_INTRO') {
        this.currentState = 'BATTLE';
      } else if (this.currentState === 'BATTLE_OUTRO') {
        this.gains.battleMusic.gain.setValueAtTime(1, timelineTime);
        this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

        this.gains.exploreCore.gain.setValueAtTime(0, timelineTime);
        this.gains.exploreCore.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
        this.gains.explorePercussion.gain.setValueAtTime(0, timelineTime);
        this.gains.explorePercussion.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);

        this.currentState = 'EXPLORATION';
        this.explorationCueSequenceIndex = 0;
      }
    }
  }

  /**
   * Realigns voices and cleans old events on every 8-bar downbeat mark
   */
  preventSampleDrift(timelineTime) {
    if (this.soundRack && typeof this.soundRack.releaseAll === 'function') {
      this.soundRack.releaseAll();
    }

    if (this.musicalBlockPart && this.musicalBlockPart._events) {
      const pastCutoff = Math.max(0, timelineTime - 1.0);
      this.musicalBlockPart._events = this.musicalBlockPart._events.filter(e => e.time >= pastCutoff);
    }
  }

  selectBlockForCurrentState() {
    if (this.currentState === 'BATTLE_INTRO') {
      return blockMap.BATTLE_INTRO;
    }
    if (this.currentState === 'BATTLE_OUTRO') {
      return blockMap.BATTLE_OUTRO;
    }
    if (this.currentState === 'BATTLE') {
      const battleChunks = blockMap.BATTLE;
      const chosen = battleChunks[this.currentBattleBlockIndex % battleChunks.length];
      this.currentBattleBlockIndex++;
      return chosen;
    }
    if (this.currentState === 'QUIET') {
      const quietChunks = blockMap.QUIET;
      return quietChunks[Math.floor(Math.random() * quietChunks.length)];
    }

    // EXPLORATION or IDLE: Pick from 8-bar exploration pool
    const pool = blockMap.EXPLORATION;
    if (this.explorationCueSequenceIndex === 0) {
      this.explorationCueSequenceIndex = 1;
      this.currentExplorationBlockIndex = 0;
      return pool[0]; // Always Day Chunk 1 initially
    } else {
      let available = pool.map((_, i) => i).filter(i => i !== this.currentExplorationBlockIndex);
      if (available.length === 0) available = [0];
      const chosenIdx = available[Math.floor(Math.random() * available.length)];
      this.currentExplorationBlockIndex = chosenIdx;
      return pool[chosenIdx];
    }
  }

  scheduleMidiBlock(chosenBlock, startTime) {
    if (!chosenBlock) return 12.8;

    const ticksPerBar = 4 * this.PPQ;
    const startTicks = chosenBlock.startBar * ticksPerBar;
    const endTicks = chosenBlock.endBar * ticksPerBar;

    const blockStartSec = this.tickToSeconds(startTicks);
    const blockEndSec = this.tickToSeconds(endTicks);
    const durationSec = blockEndSec - blockStartSec;

    if (!this.midiData || !this.midiData.tracks) return durationSec;

    this.midiData.tracks.forEach((track, trIdx) => {
      const isPercussion = track.channel === 9 || (track.instrument && track.instrument.family === 'drums');

      const notesInBlock = track.notes.filter(note =>
        note.ticks >= startTicks && note.ticks < endTicks
      );

      notesInBlock.forEach((note) => {
        const noteStartSec = this.tickToSeconds(note.ticks);
        const relativeNoteTime = noteStartSec - blockStartSec;
        const noteTime = startTime + relativeNoteTime;

        if (this.musicalBlockPart) {
          this.musicalBlockPart.add(noteTime, {
            name: note.name,
            midi: note.midi,
            duration: note.duration,
            velocity: note.velocity,
            isPercussion: isPercussion,
            trIdx: trIdx
          });
        }
      });
    });

    return durationSec;
  }

  onPhraseDownbeat(timelineTime) {
    this.handleDeferredTransitions(timelineTime);
    this.preventSampleDrift(timelineTime);

    const chosenBlock = this.selectBlockForCurrentState();
    const durationSec = this.scheduleMidiBlock(chosenBlock, timelineTime);

    this.currentBlockStartTransportSec = timelineTime;
    this.currentBlockDurationSec = durationSec || 12.8;
    currentBlockStartTransportSec = this.currentBlockStartTransportSec;
    currentBlockDurationSec = this.currentBlockDurationSec;
  }

  async startEngine() {
    await Tone.start();
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      transport.start();
    }
  }

  stopEngine() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    if (this.soundRack && typeof this.soundRack.releaseAll === 'function') {
      this.soundRack.releaseAll();
    }
  }
}

// Singleton instance for global page lifecycle
export const sequencer = new HyruleSequencer();

export function getCurrentPlaybackState() {
  return sequencer.currentState;
}

export function getPendingStateChange() {
  return sequencer.pendingStateChange;
}

export function whenAudioLoaded() {
  return sequencer.init();
}

export async function changeGameMode(newMode) {
  await whenAudioLoaded();
  await sequencer.startEngine();
  sequencer.setState(newMode);
}
