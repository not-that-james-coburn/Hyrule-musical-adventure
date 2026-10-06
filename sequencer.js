import * as Tone from 'tone';

// Track active block info for external timing queries
export let currentBlockDurationSec = 12.8;
export let currentBlockStartTransportSec = 0;

// Standard 12-tone chromatic scale (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

// 1. Measure-Based Block Mapping matching hyrule_field_midi.json (exact 8 bars each)
export const blockMap = {
  INTRO: {
    id: 'Intro (Bars 0–17)',
    name: 'Hyrule Morning Fanfare',
    startBar: 0,
    endBar: 17,
    mode: 'EXPLORATION'
  },

  EXPLORATION: [
    {
      id: 'Day Chunk 1 (Bars 17–25)',
      name: 'Main Theme A (Overworld)',
      startBar: 17,
      endBar: 25,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day Chunk 2 (Bars 25–33)',
      name: 'Heroic March Variation',
      startBar: 25,
      endBar: 33,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day Chunk 3 (Bars 33–41)',
      name: 'Expansive Horizons Brass',
      startBar: 33,
      endBar: 41,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day Chunk 4 (Bars 41–49)',
      name: 'Adventure Motif Flourish',
      startBar: 41,
      endBar: 49,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day Chunk 5 (Bars 49–57)',
      name: 'Plains Bridge & Strings',
      startBar: 49,
      endBar: 57,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day Chunk 6 (Bars 57–65)',
      name: 'Woodwinds & Pastoral Rest',
      startBar: 57,
      endBar: 65,
      mode: 'EXPLORATION'
    }
  ],

  BATTLE_INTRO: {
    id: 'Battle Intro (Bars 64–72)',
    name: 'Enemy Sighted Tension',
    startBar: 64,
    endBar: 72,
    mode: 'BATTLE'
  },

  BATTLE: [
    {
      id: 'Battle Chunk 1 (Bars 72–80)',
      name: 'Combat Skirmish Riff A',
      startBar: 72,
      endBar: 80,
      mode: 'BATTLE'
    },
    {
      id: 'Battle Chunk 2 (Bars 80–88)',
      name: 'Fast Swords & Shields',
      startBar: 80,
      endBar: 88,
      mode: 'BATTLE'
    },
    {
      id: 'Battle Chunk 3 (Bars 88–96)',
      name: 'Aggressive Percussion Drive',
      startBar: 88,
      endBar: 96,
      mode: 'BATTLE'
    },
    {
      id: 'Battle Chunk 4 (Bars 96–104)',
      name: 'High Tension Brass Clash',
      startBar: 96,
      endBar: 104,
      mode: 'BATTLE'
    },
    {
      id: 'Battle Chunk 5 (Bars 104–112)',
      name: 'Counterattack Crescendo',
      startBar: 104,
      endBar: 112,
      mode: 'BATTLE'
    }
  ],

  BATTLE_OUTRO: {
    id: 'Victory Flourish (Bars 112–120)',
    name: 'Enemy Defeated Fanfare',
    startBar: 112,
    endBar: 120,
    mode: 'EXPLORATION'
  },

  QUIET: [
    {
      id: 'Quiet Chunk 1 (Bars 137–145)',
      name: 'Nocturne Harp Serenade',
      startBar: 137,
      endBar: 145,
      mode: 'QUIET'
    },
    {
      id: 'Quiet Chunk 2 (Bars 145–153)',
      name: 'Starlit Plains Solitude',
      startBar: 145,
      endBar: 153,
      mode: 'QUIET'
    },
    {
      id: 'Quiet Chunk 3 (Bars 153–161)',
      name: 'Gentle Nocturnal Ocarina',
      startBar: 153,
      endBar: 161,
      mode: 'QUIET'
    },
    {
      id: 'Quiet Chunk 4 (Bars 161–169)',
      name: 'Campfire Night Reflections',
      startBar: 161,
      endBar: 169,
      mode: 'QUIET'
    },
    {
      id: 'Quiet Chunk 5 (Bars 169–177)',
      name: 'Dawn Whispers Harmony',
      startBar: 169,
      endBar: 177,
      mode: 'QUIET'
    }
  ]
};

export class HyruleSequencer {
  constructor() {
    // 3 Canonical musical modes: 'EXPLORATION', 'QUIET', 'BATTLE'
    this.currentState = 'EXPLORATION';
    this.pendingStateChange = null;

    // Timing constants matching Koji Kondo's MIDI design (150 BPM main theme, 8 bars per block)
    this.BPM = 150;
    this.BEATS_PER_BAR = 4;
    this.BARS_PER_BLOCK = 8;
    this.BEATS_PER_BLOCK = this.BEATS_PER_BAR * this.BARS_PER_BLOCK; // 32 Beats (12.8s)
    this.BLOCK_DURATION_SEC = 12.8;

    // Stem Gains
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

    this.phraseIndex = 0;
    this.repeatEventId = null;
    this.currentBlock = null;

    this.explorationCueSequenceIndex = 0;
    this.currentExplorationBlockIndex = null;
    this.currentBattleBlockIndex = 0;
    this.currentQuietBlockIndex = 0;

    this.currentBlockStartTransportSec = 0;
    this.currentBlockDurationSec = 12.8;

    // Buffer of scheduled notes for the continuous right-to-left visualizer
    this.streamNotes = [];

    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const transport = Tone.getTransport();
      transport.bpm.value = this.BPM;
      transport.timeSignature = [4, 4];

      // 1. Output Pipeline: Direct Master Limiter + Reverb
      this.masterLimiter = new Tone.Limiter(-1).toDestination();
      this.masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(this.masterLimiter);

      // Connect localized gains directly to limiter for immediate audio output
      this.gains.exploreCore.connect(this.masterLimiter);
      this.gains.explorePercussion.connect(this.masterLimiter);
      this.gains.idleHarp.connect(this.masterLimiter);
      this.gains.battleMusic.connect(this.masterLimiter);

      // Also send ambient depth to reverb
      this.gains.exploreCore.connect(this.masterReverb);
      this.gains.idleHarp.connect(this.masterReverb);

      // 2. Load Assets (manifest + MIDI data)
      await this.loadProjectAssets();

      // 3. Build SoundFont Rack & Instruments
      this.soundRack = this.createSoundfontRack();

      // Wait for soundfont samples to buffer with timeout protection
      try {
        await Promise.race([
          Tone.loaded(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Sample loading timed out after 20s')), 20000)
          )
        ]);
      } catch (err) {
        console.warn('Some SoundFont buffers took too long or had issues, continuing with ready samples:', err);
      }

      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  async loadProjectAssets() {
    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const cleanBase = envBase.endsWith('/') ? envBase : envBase + '/';

    let pagePathBase = './';
    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
      const p = window.location.pathname;
      pagePathBase = p.endsWith('/') ? p : p.substring(0, p.lastIndexOf('/') + 1);
      if (!pagePathBase.endsWith('/')) pagePathBase += '/';
    }

    const manifestCandidateUrls = [
      `${pagePathBase}soundfont/`,
      `${pagePathBase}public/soundfont/`,
      `${cleanBase}soundfont/`,
      `${cleanBase}public/soundfont/`,
      './soundfont/',
      './public/soundfont/',
      '/soundfont/',
      '/public/soundfont/'
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
      `${pagePathBase}hyrule_field_midi.json`,
      `${pagePathBase}public/hyrule_field_midi.json`,
      `${cleanBase}hyrule_field_midi.json`,
      `${cleanBase}public/hyrule_field_midi.json`,
      './hyrule_field_midi.json',
      './public/hyrule_field_midi.json',
      '/hyrule_field_midi.json'
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

    // Polyphonic Drum Synths for percussion elements
    const kickSynth = new Tone.PolySynth(Tone.MembraneSynth, {
      pitchDecay: 0.05,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    kickSynth.volume.value = -6;
    kickSynth.connect(this.gains.explorePercussion);
    kickSynth.connect(this.gains.battleMusic);

    const hihatSynth = new Tone.PolySynth(Tone.MetalSynth, {
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5
    });
    hihatSynth.volume.value = -22;
    hihatSynth.connect(this.gains.explorePercussion);
    hihatSynth.connect(this.gains.battleMusic);

    function releaseAll() {
      Object.values(samplers).forEach(s => {
        if (s && typeof s.releaseAll === 'function') {
          try { s.releaseAll(); } catch (e) {}
        }
      });
      if (kickSynth && typeof kickSynth.releaseAll === 'function') {
        try { kickSynth.releaseAll(); } catch (e) {}
      }
      if (hihatSynth && typeof hihatSynth.releaseAll === 'function') {
        try { hihatSynth.releaseAll(); } catch (e) {}
      }
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

    const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();

    if (instName) {
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

  getTrackCategory(track, trIdx) {
    if (!track) return 'melody';
    if (track.channel === 9 || (track.instrument && track.instrument.family === 'drums')) {
      return 'percussion';
    }
    if (track.channel === 14 || (track.instrument && track.instrument.name && track.instrument.name.toLowerCase().includes('timpani'))) {
      return 'percussion';
    }
    if (track.channel === 8 || track.channel === 15) {
      return 'bass';
    }
    const instName = (track.instrument ? track.instrument.name : '').toLowerCase();
    if (instName.includes('bass') || instName.includes('cello')) {
      return 'bass';
    }
    return 'melody';
  }

  getSamplerForTrack(trackIndex) {
    const key = this.getInstrumentKeyForTrack(trackIndex);
    if (key === 'percussion') return 'percussion';
    return this.soundRack ? (this.soundRack.samplers[key] || this.soundRack.samplers.piano) : null;
  }

  triggerSafeNote(sampler, note, durationSec, time) {
    if (!this.soundRack) return;
    const now = Tone.now();
    const safeTime = Math.max(time, now);
    const dur = Math.max(0.06, durationSec);
    const vel = typeof note.velocity === 'number' ? Math.max(0.1, Math.min(1.0, note.velocity)) : 0.8;

    if (sampler === 'percussion') {
      const midiPitch = note.midi;
      if (midiPitch === 35 || midiPitch === 36) {
        // Kick Drum
        try {
          this.soundRack.kickSynth.triggerAttackRelease('C1', dur, safeTime, vel);
        } catch (e) {}
      } else if (midiPitch === 38 || midiPitch === 40) {
        // Snare
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          try { snareSampler.triggerAttackRelease('C4', dur, safeTime, vel); } catch (e) {}
        }
      } else if (midiPitch === 42 || midiPitch === 44 || midiPitch === 46) {
        // Hi-Hat
        try {
          this.soundRack.hihatSynth.triggerAttackRelease(dur, safeTime, vel * 0.7);
        } catch (e) {}
      } else if (midiPitch >= 41 && midiPitch <= 50) {
        // Toms / Timpani
        const tomSampler = this.soundRack.samplers.tom;
        if (tomSampler && tomSampler.loaded) {
          try { tomSampler.triggerAttackRelease('C4', dur, safeTime, vel); } catch (e) {}
        } else if (this.soundRack.samplers.timpani && this.soundRack.samplers.timpani.loaded) {
          try { this.soundRack.samplers.timpani.triggerAttackRelease('D3', dur, safeTime, vel); } catch (e) {}
        }
      } else {
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          try { snareSampler.triggerAttackRelease('C4', dur, safeTime, vel); } catch (e) {}
        }
      }
    } else {
      if (sampler && sampler.loaded) {
        try {
          sampler.triggerAttackRelease(note.name, dur, safeTime, vel);
        } catch (e) {}
      }
    }
  }

  /**
   * Set musical mode. Supports 'EXPLORATION', 'QUIET', 'BATTLE'.
   */
  setState(newState) {
    if (newState === this.currentState && !this.pendingStateChange) return;

    if (newState === 'QUIET' && this.currentState === 'EXPLORATION') {
      // Smooth immediate volume crossfade to quiet harps, defer cue change to 8-bar boundary
      this.executeMovementCrossfade('QUIET');
      this.pendingStateChange = 'QUIET';
      console.log('Quiet transition queued. Pending phrase boundary downbeat...');
    } else if (newState === 'EXPLORATION' && this.currentState === 'QUIET') {
      // Smooth immediate volume crossfade back to drums, defer chunk change to 8-bar boundary
      this.executeMovementCrossfade('EXPLORATION');
      this.pendingStateChange = 'EXPLORATION';
      console.log('Exploration return queued. Pending phrase boundary downbeat...');
    } else if (newState === 'BATTLE' || newState === 'EXPLORATION' || newState === 'QUIET') {
      // Combat encounter: defer execution until master clock hits next 8-bar boundary
      this.pendingStateChange = newState;
      console.log(`State transition queued (${newState}). Pending phrase boundary downbeat...`);
    }
  }

  /**
   * Mid-bar linear volume crossfade for quiet/idle vs active exploration
   */
  executeMovementCrossfade(target = this.currentState) {
    const now = Tone.now();
    const fadeTime = 0.4; // 400ms smooth real-time crossfade

    if (target === 'IDLE' || target === 'QUIET') {
      this.gains.explorePercussion.gain.linearRampToValueAtTime(0, now + fadeTime);
      this.gains.idleHarp.gain.linearRampToValueAtTime(1, now + fadeTime);
    } else if (target === 'EXPLORATION') {
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
        this.gains.explorePercussion.gain.setValueAtTime(this.currentState === 'QUIET' ? 0 : 1, timelineTime);
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
      const chosen = quietChunks[this.currentQuietBlockIndex % quietChunks.length];
      this.currentQuietBlockIndex++;
      return chosen;
    }

    // EXPLORATION: Pick from 8-bar exploration pool
    const pool = blockMap.EXPLORATION;
    if (this.explorationCueSequenceIndex === 0) {
      this.explorationCueSequenceIndex = 1;
      this.currentExplorationBlockIndex = 0;
      return pool[0]; // Day Chunk 1 initially
    } else {
      let available = pool.map((_, i) => i).filter(i => i !== this.currentExplorationBlockIndex);
      if (available.length === 0) available = [0];
      const chosenIdx = available[Math.floor(Math.random() * available.length)];
      this.currentExplorationBlockIndex = chosenIdx;
      return pool[chosenIdx];
    }
  }

  scheduleNotesForBlock(chosenBlock, startTransportSec, audioStartTime) {
    if (!chosenBlock || !this.midiData || !this.midiData.tracks) return;

    const ticksPerBar = 4 * this.PPQ;
    const startTicks = chosenBlock.startBar * ticksPerBar;
    const endTicks = chosenBlock.endBar * ticksPerBar;
    const totalBlockTicks = endTicks - startTicks; // Exactly 8 bars in ticks
    const blockDurationSec = this.BLOCK_DURATION_SEC; // 12.8s

    this.midiData.tracks.forEach((track, trIdx) => {
      const trackCategory = this.getTrackCategory(track, trIdx);
      const sampler = this.getSamplerForTrack(trIdx);

      const notesInBlock = track.notes.filter(note =>
        note.ticks >= startTicks && note.ticks < endTicks
      );

      notesInBlock.forEach((note) => {
        const noteFraction = (note.ticks - startTicks) / totalBlockTicks;
        const relativeSec = noteFraction * blockDurationSec;

        const noteTransportTime = startTransportSec + relativeSec;
        const noteAudioTime = audioStartTime + relativeSec;

        let noteDurationSec = (note.durationTicks / totalBlockTicks) * blockDurationSec;
        if (isNaN(noteDurationSec) || noteDurationSec <= 0) {
          noteDurationSec = note.duration || 0.2;
        }

        // Trigger safe note playback
        this.triggerSafeNote(sampler, note, noteDurationSec, noteAudioTime);

        // Add note to visualizer stream
        this.streamNotes.push({
          name: note.name,
          midi: note.midi,
          velocity: note.velocity,
          transportTime: noteTransportTime,
          duration: Math.max(0.08, noteDurationSec),
          trackType: trackCategory, // 'melody' | 'bass' | 'percussion'
          mode: chosenBlock.mode, // 'EXPLORATION' | 'QUIET' | 'BATTLE'
          cueId: chosenBlock.id
        });
      });
    });
  }

  /**
   * Fires precisely on the downbeat of every 8-measure segment block
   */
  onPhraseBoundary(timelineTime) {
    const audioTime = timelineTime || Tone.now();

    // 1. Process deferred transitions on downbeat
    this.handleDeferredTransitions(audioTime);

    // 2. Prevent sample drift across boundaries
    if (this.soundRack && typeof this.soundRack.releaseAll === 'function') {
      this.soundRack.releaseAll();
    }

    // 3. Select next 8-bar block
    const chosenBlock = this.selectBlockForCurrentState();
    this.currentBlock = chosenBlock;

    const startTransportSec = this.phraseIndex * this.BLOCK_DURATION_SEC;
    this.currentBlockStartTransportSec = startTransportSec;
    this.currentBlockDurationSec = this.BLOCK_DURATION_SEC;
    currentBlockStartTransportSec = startTransportSec;
    currentBlockDurationSec = this.BLOCK_DURATION_SEC;

    // 4. Schedule notes for this 8-bar block
    this.scheduleNotesForBlock(chosenBlock, startTransportSec, audioTime);

    // 5. Clean up old visualizer notes (more than 4s in the past)
    const currentTransportSec = Tone.getTransport().seconds;
    this.streamNotes = this.streamNotes.filter(n => (n.transportTime + n.duration) >= (currentTransportSec - 4.0));

    // 6. Advance phrase index
    this.phraseIndex++;
  }

  async startEngine() {
    await Tone.start();
    const transport = Tone.getTransport();

    if (transport.state !== 'started') {
      transport.cancel(0);
      transport.position = 0;
      this.phraseIndex = 0;
      this.streamNotes = [];
      this.explorationCueSequenceIndex = 0;

      // Master 8-bar loop recurring clock: fires every 8 measures reliably
      this.repeatEventId = transport.scheduleRepeat((time) => {
        this.onPhraseBoundary(time);
      }, `${this.BARS_PER_BLOCK}m`, 0);

      transport.start();
    }
  }

  stopEngine() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    this.repeatEventId = null;
    this.phraseIndex = 0;
    this.streamNotes = [];
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

export function getCurrentBlockStartTransportSec() {
  return sequencer.currentBlockStartTransportSec;
}

export function getCurrentBlockDurationSec() {
  return sequencer.currentBlockDurationSec;
}

export function whenAudioLoaded() {
  return sequencer.init();
}

export function getStreamNotes() {
  return sequencer.streamNotes;
}

export function getActiveCueInfo() {
  const currentBlock = sequencer.currentBlock;
  const currentMode = sequencer.currentState;
  const pendingMode = sequencer.pendingStateChange;
  const transportSec = Tone.getTransport() ? Tone.getTransport().seconds : 0;
  const blockStartSec = sequencer.currentBlockStartTransportSec;
  const blockDurSec = sequencer.currentBlockDurationSec || 12.8;

  return {
    cueId: currentBlock ? currentBlock.id : 'Day Chunk 1 (Bars 17–25)',
    cueName: currentBlock ? currentBlock.name : 'Main Theme A (Overworld)',
    cueMode: currentBlock ? currentBlock.mode : 'EXPLORATION',
    currentMode,
    pendingMode,
    transportSec,
    blockStartSec,
    blockDurSec,
    timeInBlock: Math.max(0, transportSec - blockStartSec),
    progressPercent: Math.min(100, Math.max(0, ((transportSec - blockStartSec) / blockDurSec) * 100))
  };
}

export async function changeGameMode(newMode) {
  await whenAudioLoaded();
  await Tone.start();
  const transport = Tone.getTransport();

  if (transport.state !== 'started') {
    sequencer.currentState = newMode;
    sequencer.pendingStateChange = null;
    await sequencer.startEngine();
    return;
  }

  sequencer.setState(newMode);
}
