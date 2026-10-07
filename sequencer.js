import * as Tone from 'tone';

// Track active block timing constants
export const BARS_PER_BLOCK = 8;
export const BLOCK_DURATION_SEC = 12.8; // 8 bars * 4 beats * (60 / 150 BPM)
export let currentBlockDurationSec = BLOCK_DURATION_SEC;
export let currentBlockStartTransportSec = 0;

// Standard 12-tone chromatic scale (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

// Measure-Based Block Mapping matching hyrule_field_midi.json (exact 8 bars each)
export const blockMap = {
  // Initial startup cues (strictly played on playback initiation, not in random rotation)
  MORNING: {
    id: 'Sunrise (Bars 1–9)',
    name: 'Morning Dawn Ocarina',
    startBar: 1,
    endBar: 9,
    mode: 'EXPLORATION'
  },

  INTRO: {
    id: 'Intro (Bars 9–17)',
    name: 'Galloping Heroic Fanfare',
    startBar: 9,
    endBar: 17,
    mode: 'EXPLORATION'
  },

  // Ongoing Exploration Pool (shuffled via ShuffleBag, no sequential repeats)
  EXPLORATION: [
    {
      id: 'Day 1 (Bars 17–25)',
      name: 'Main Theme A (Overworld)',
      startBar: 17,
      endBar: 25,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 2 (Bars 25–33)',
      name: 'Heroic March Variation',
      startBar: 25,
      endBar: 33,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 3 (Bars 33–41)',
      name: 'Expansive Horizons Brass',
      startBar: 33,
      endBar: 41,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 4 (Bars 41–49)',
      name: 'Adventure Motif Flourish',
      startBar: 41,
      endBar: 49,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 5 (Bars 49–57)',
      name: 'Plains Bridge & Strings',
      startBar: 49,
      endBar: 57,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 6 (Bars 57–65)',
      name: 'Woodwinds & Pastoral Rest',
      startBar: 57,
      endBar: 65,
      mode: 'EXPLORATION'
    }
  ],

  // Battle Intro starts on Bar 65 (eliminates the 1-bar offset from Day 6)
  BATTLE_INTRO: {
    id: 'Battle Intro (Bars 65–73)',
    name: 'Enemy Spotted Tension',
    startBar: 65,
    endBar: 73,
    mode: 'BATTLE'
  },

  // Ongoing Battle Pool (shuffled via ShuffleBag, no sequential repeats)
  BATTLE: [
    {
      id: 'Battle 1 (Bars 73–81)',
      name: 'Combat Skirmish Riff',
      startBar: 73,
      endBar: 81,
      mode: 'BATTLE'
    },
    {
      id: 'Battle 2 (Bars 81–89)',
      name: 'Fast Swords & Shields',
      startBar: 81,
      endBar: 89,
      mode: 'BATTLE'
    },
    {
      id: 'Battle 3 (Bars 89–97)',
      name: 'Aggressive Percussion Drive',
      startBar: 89,
      endBar: 97,
      mode: 'BATTLE'
    },
    {
      id: 'Battle 4 (Bars 97–105)',
      name: 'High Danger Brass Clash',
      startBar: 97,
      endBar: 105,
      mode: 'BATTLE'
    },
    {
      id: 'Battle 5 (Bars 105–113)',
      name: 'Counterattack Crescendo',
      startBar: 105,
      endBar: 113,
      mode: 'BATTLE'
    }
  ],

  // Victory Flourish starts on Bar 113
  BATTLE_OUTRO: {
    id: 'Victory (Bars 113–121)',
    name: 'Enemy Defeated Fanfare',
    startBar: 113,
    endBar: 121,
    mode: 'EXPLORATION'
  },

  // Ongoing Quiet / Night Pool (shuffled via ShuffleBag, no sequential repeats)
  QUIET: [
    {
      id: 'Night 1 (Bars 137–145)',
      name: 'Nocturne Harp Serenade',
      startBar: 137,
      endBar: 145,
      mode: 'QUIET'
    },
    {
      id: 'Night 2 (Bars 145–153)',
      name: 'Starlit Plains Solitude',
      startBar: 145,
      endBar: 153,
      mode: 'QUIET'
    },
    {
      id: 'Night 3 (Bars 153–161)',
      name: 'Gentle Nocturnal Ocarina',
      startBar: 153,
      endBar: 161,
      mode: 'QUIET'
    },
    {
      id: 'Night 4 (Bars 161–169)',
      name: 'Campfire Night Reflections',
      startBar: 161,
      endBar: 169,
      mode: 'QUIET'
    },
    {
      id: 'Night 5 (Bars 169–177)',
      name: 'Dawn Whispers Harmony',
      startBar: 169,
      endBar: 177,
      mode: 'QUIET'
    }
  ]
};

/**
 * Fisher-Yates ShuffleBag ensuring every item is played once before repeat,
 * and zero sequential duplicates across deck reshuffles.
 */
class ShuffleBag {
  constructor(items) {
    this.items = [...items];
    this.bag = [];
    this.lastItem = null;
  }

  next() {
    if (this.bag.length === 0) {
      let candidates = [...this.items];
      // Fisher-Yates shuffle
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      // If the first candidate to be drawn matches the last played item, swap with first item in bag
      if (candidates.length > 1 && candidates[candidates.length - 1] === this.lastItem) {
        [candidates[candidates.length - 1], candidates[0]] = [candidates[0], candidates[candidates.length - 1]];
      }
      this.bag = candidates;
    }
    const item = this.bag.pop();
    this.lastItem = item;
    return item;
  }

  reset() {
    this.bag = [];
    this.lastItem = null;
  }
}

export class HyruleSequencer {
  constructor() {
    // Canonical musical modes: 'EXPLORATION', 'QUIET', 'BATTLE'
    this.currentState = 'EXPLORATION';
    this.pendingStateChange = null;

    // Timing constants matching Koji Kondo's MIDI design (150 BPM main theme, 8 bars per block)
    this.BPM = 150;
    this.BEATS_PER_BAR = 4;
    this.BARS_PER_BLOCK = BARS_PER_BLOCK;
    this.BLOCK_DURATION_SEC = BLOCK_DURATION_SEC; // 12.8s

    // Dynamic Stem Gains
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
    this.boundaryEventId = null;

    // Active playing block and pre-buffered upcoming block
    this.currentBlock = null;
    this.upcomingBlock = null;
    this.currentBlockStartTransportSec = 0;
    this.upcomingBlockStartSec = 0;
    this.currentBlockDurationSec = BLOCK_DURATION_SEC;

    // Map of scheduled event IDs per phrase index for clean cancellation on mode changes
    this.phraseEventIds = {};

    // Shuffle bags for non-repeating fair cue selection
    this.explorationBag = new ShuffleBag(blockMap.EXPLORATION);
    this.battleBag = new ShuffleBag(blockMap.BATTLE);
    this.quietBag = new ShuffleBag(blockMap.QUIET);

    // Initial startup sequence stage tracking
    this.initialSequenceStage = 0; // 0: Morning, 1: Intro, 2: Day 1, 3+: Shuffled

    // Post-battle resolution state ('EXPLORATION' or 'QUIET')
    this.postBattleState = null;

    // Stream notes buffer for continuous right-to-left visualizer
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

      // 1. Output Pipeline: N64 DSP Mixer & Mastering Chain
      // Prevents digital clipping, glues orchestral instruments, rolls off shrill high-end
      this.masterLimiter = new Tone.Limiter(-0.5).toDestination();

      this.masterVolume = new Tone.Volume(-2.5).connect(this.masterLimiter);

      this.masterCompressor = new Tone.Compressor({
        threshold: -18,
        ratio: 2.8,
        attack: 0.03,
        release: 0.25,
        knee: 6
      }).connect(this.masterVolume);

      this.masterReverb = new Tone.Reverb({
        decay: 2.4,
        preDelay: 0.02,
        wet: 0.22
      }).connect(this.masterCompressor);

      // Analog reconstruction low-pass filter (emulating authentic N64 DAC filter)
      this.masterWarmthFilter = new Tone.Filter({
        frequency: 14000,
        type: 'lowpass',
        rolloff: -12,
        Q: 0.7
      }).connect(this.masterReverb);

      // 3-Band Equalizer: authentic N64 orchestral balance with natural high clarity
      this.masterEQ = new Tone.EQ3({
        low: 1.5,
        mid: 0.0,
        high: -1.5,
        lowFrequency: 300,
        highFrequency: 4200
      }).connect(this.masterWarmthFilter);

      // Master Pre-Bus summing stem gains
      this.masterPreBus = new Tone.Gain(1.0).connect(this.masterEQ);

      // Connect localized stems into Master Pre-Bus
      this.gains.exploreCore.connect(this.masterPreBus);
      this.gains.explorePercussion.connect(this.masterPreBus);
      this.gains.idleHarp.connect(this.masterPreBus);
      this.gains.battleMusic.connect(this.masterPreBus);

      // 2. Load Assets (manifest + MIDI data)
      await this.loadProjectAssets();

      // 3. Build SoundFont Rack & Instruments
      this.soundRack = this.createSoundfontRack();

      // Wait for soundfont samples to buffer with timeout protection
      try {
        await Promise.race([
          Promise.all([Tone.loaded(), this.masterReverb ? this.masterReverb.ready : Promise.resolve()]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Sample loading timed out after 20s')), 20000)
          )
        ]);
      } catch (err) {
        console.warn('Some SoundFont buffers took too long, continuing with ready samples:', err);
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
      } catch (e) {}
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
      } catch (e) {}
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
    // Calibrated instrument balance for authentic N64 Zelda SoundFont (00_ALL.sf2)
    const sampleSpecs = {
      piano: { filter: k => k.startsWith('Piano'), defaultVol: -5.5 },
      trombone: { filter: k => k.startsWith('Trombone'), defaultVol: -4.5 },
      trumpet: { filter: k => k.startsWith('Trumpet'), defaultVol: -5.0 },
      brassSection: { filter: k => k.startsWith('Horn') || k.startsWith('Trumpet') || k.startsWith('Trombone'), defaultVol: -4.5 },
      stringEnsemble: { filter: k => k.startsWith('Strings'), defaultVol: -4.0 },
      stringEnsemble2: { filter: k => k.startsWith('Strings'), defaultVol: -4.0 },
      cello: { filter: k => k.startsWith('Strings Low') || k.startsWith('Pizzicato Low'), defaultVol: -4.0 },
      doubleBass: { filter: k => k.startsWith('Strings Low') || k.startsWith('Pizzicato Low') || k.startsWith('Tuba'), defaultVol: -3.0 },
      pickBass: { filter: k => k.startsWith('Pizzicato Low') || k.startsWith('Strings Low') || k.startsWith('Bassoon'), defaultVol: -3.0 },
      flute: { filter: k => k.startsWith('Flute'), defaultVol: -5.0 },
      tenorSax: { filter: k => k.startsWith('Clarinet') || k.startsWith('Oboe') || k.startsWith('Bassoon'), defaultVol: -5.0 },
      ocarina: { filter: k => k.startsWith('Ocarina'), defaultVol: -5.0 },
      harp: { filter: k => k.startsWith('Harp High') || k.startsWith('Harp Low'), defaultVol: -4.0 },
      accordion: { filter: k => k.startsWith('Accordion'), defaultVol: -5.0 },
      marimba: { filter: k => k.startsWith('Marimba'), defaultVol: -4.5 },
      vibraphone: { filter: k => k.startsWith('Glockenspiel') || k === 'Bell', defaultVol: -5.0 },
      timpani: { filter: k => k.startsWith('Timpani'), defaultVol: -3.5 },
      snare: { filter: k => k.startsWith('Snare'), defaultVol: -4.0 },
      hihat: { filter: k => k === 'Cymbal Hit', defaultVol: -6.5 },
      kick: { filter: k => k === 'Kick Drum' || k === 'Ethnic Kick', defaultVol: -3.0 },
      tom: { filter: k => k.startsWith('Bent Drum') || k.startsWith('Ethnic Drum Kit') || k.startsWith('Timpani Low'), defaultVol: -4.0 }
    };

    // Sub-bus filters to tame metallic brass bite and upper-octave woodwind harshness
    this.brassFilter = new Tone.Filter({
      frequency: 10500,
      type: 'lowpass',
      rolloff: -12
    });
    this.brassFilter.connect(this.gains.exploreCore);
    this.brassFilter.connect(this.gains.battleMusic);

    this.woodwindFilter = new Tone.Filter({
      frequency: 12000,
      type: 'lowpass',
      rolloff: -12
    });
    this.woodwindFilter.connect(this.gains.exploreCore);
    this.woodwindFilter.connect(this.gains.battleMusic);

    const samplers = {};
    for (const [instKey, spec] of Object.entries(sampleSpecs)) {
      const urls = this.buildSamplerUrls(spec.filter);
      if (Object.keys(urls).length > 0) {
        const sampler = new Tone.Sampler({ urls, baseUrl: this.soundfontBaseUrl });
        sampler.volume.value = spec.defaultVol;

        // Routing matrix through tone-shaping filters and dynamic stems:
        if (instKey === 'trumpet' || instKey === 'trombone' || instKey === 'brassSection') {
          // Route brass through dedicated anti-glare warmth filter
          sampler.connect(this.brassFilter);
        } else if (instKey === 'ocarina' || instKey === 'flute' || instKey === 'tenorSax') {
          // Route lead woodwinds through smooth roll-off filter
          sampler.connect(this.woodwindFilter);
        } else if (instKey === 'snare' || instKey === 'tom' || instKey === 'hihat' || instKey === 'kick') {
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

    // High-performance monophonic drum synths: zero voice leakage or PolySynth node accumulation
    const kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.12 }
    });
    kickSynth.volume.value = -7.0;
    kickSynth.connect(this.gains.explorePercussion);
    kickSynth.connect(this.gains.battleMusic);

    const hihatSynth = new Tone.MetalSynth({
      frequency: 180,
      envelope: { attack: 0.001, decay: 0.04, release: 0.04 },
      harmonicity: 3.2,
      modulationIndex: 10,
      resonance: 1400,
      octaves: 1.2
    });
    hihatSynth.volume.value = -26;
    hihatSynth.connect(this.gains.explorePercussion);
    hihatSynth.connect(this.gains.battleMusic);

    function releaseAll() {
      Object.values(samplers).forEach(s => {
        if (s && typeof s.releaseAll === 'function') {
          try { s.releaseAll(); } catch (e) {}
        }
      });
      if (kickSynth && typeof kickSynth.triggerRelease === 'function') {
        try { kickSynth.triggerRelease(); } catch (e) {}
      }
      if (hihatSynth && typeof hihatSynth.triggerRelease === 'function') {
        try { hihatSynth.triggerRelease(); } catch (e) {}
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
        // Authentic N64 Kick Drum (with synth fallback)
        try {
          const kickSampler = this.soundRack.samplers.kick;
          if (kickSampler && kickSampler.loaded) {
            kickSampler.triggerAttackRelease('C2', dur, safeTime, vel);
          } else {
            this.soundRack.kickSynth.triggerAttackRelease('C1', dur, safeTime, vel);
          }
        } catch (e) {}
      } else if (midiPitch === 38 || midiPitch === 40) {
        // Authentic N64 Snare (Snare High / Snare Low)
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          try { snareSampler.triggerAttackRelease(midiPitch === 38 ? 'B3' : 'C4', dur, safeTime, vel); } catch (e) {}
        }
      } else if (midiPitch === 42 || midiPitch === 44 || midiPitch === 46) {
        // Authentic N64 Hi-Hat / Cymbal (with synth fallback)
        try {
          const hihatSampler = this.soundRack.samplers.hihat;
          if (hihatSampler && hihatSampler.loaded) {
            hihatSampler.triggerAttackRelease('C4', dur, safeTime, vel * 0.7);
          } else {
            this.soundRack.hihatSynth.triggerAttackRelease(dur, safeTime, vel * 0.7);
          }
        } catch (e) {}
      } else if (midiPitch >= 41 && midiPitch <= 50) {
        // Authentic N64 Toms / Timpani
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
          // Acoustic register scaling for piercing high notes (e.g. ocarina/woodwinds in octaves 6-7)
          const scaledVel = (note.midi && note.midi > 84) ? vel * 0.82 : vel;
          sampler.triggerAttackRelease(note.name, dur, safeTime, scaledVel);
        } catch (e) {}
      }
    }
  }

  /**
   * Set musical mode. Supports 'EXPLORATION', 'QUIET', 'BATTLE'.
   */
  setState(newState) {
    if (newState === this.currentState && !this.pendingStateChange) return;

    const inCombat = (this.currentState === 'BATTLE' || this.currentState === 'BATTLE_INTRO' || this.currentBlock === blockMap.BATTLE_INTRO);

    if (newState === 'QUIET' && this.currentState === 'EXPLORATION') {
      // Immediate volume crossfade mid-bar
      this.executeMovementCrossfade('QUIET');
      this.currentState = 'QUIET';
      this.pendingStateChange = 'QUIET';
      this.requeueUpcomingPhrase('QUIET');
    } else if (newState === 'EXPLORATION' && this.currentState === 'QUIET') {
      // Immediate volume crossfade mid-bar: percussion resumes immediately
      this.executeMovementCrossfade('EXPLORATION');
      this.currentState = 'EXPLORATION';
      this.pendingStateChange = 'EXPLORATION';
      this.requeueUpcomingPhrase('EXPLORATION');
    } else if (newState === 'BATTLE') {
      this.pendingStateChange = 'BATTLE';
      this.requeueUpcomingPhrase('BATTLE_INTRO');
    } else if (newState === 'EXPLORATION' && inCombat) {
      // Victory flourish before resolving to exploration
      this.pendingStateChange = 'EXPLORATION';
      this.postBattleState = 'EXPLORATION';
      this.requeueUpcomingPhrase('BATTLE_OUTRO');
    } else if (newState === 'QUIET' && inCombat) {
      // Rest mode selected during Battle:
      // Play Victory fanfare to triumphantly conclude combat, then seamlessly settle into Quiet!
      this.pendingStateChange = 'QUIET';
      this.postBattleState = 'QUIET';
      this.requeueUpcomingPhrase('BATTLE_OUTRO');
    } else if (newState === 'EXPLORATION') {
      this.executeMovementCrossfade('EXPLORATION');
      this.currentState = 'EXPLORATION';
      this.pendingStateChange = 'EXPLORATION';
      this.requeueUpcomingPhrase('EXPLORATION');
    } else if (newState === 'QUIET') {
      this.executeMovementCrossfade('QUIET');
      this.currentState = 'QUIET';
      this.pendingStateChange = 'QUIET';
      this.requeueUpcomingPhrase('QUIET');
    }
  }

  /**
   * Mid-bar linear volume crossfade for quiet/idle vs active exploration
   */
  executeMovementCrossfade(target = this.currentState) {
    const now = Tone.now();
    const fadeTime = 0.35; // 350ms smooth real-time crossfade

    const percGain = this.gains.explorePercussion.gain;
    const harpGain = this.gains.idleHarp.gain;

    percGain.cancelScheduledValues(now);
    percGain.setValueAtTime(percGain.value, now);

    harpGain.cancelScheduledValues(now);
    harpGain.setValueAtTime(harpGain.value, now);

    if (target === 'IDLE' || target === 'QUIET') {
      percGain.linearRampToValueAtTime(0, now + fadeTime);
      harpGain.linearRampToValueAtTime(1, now + fadeTime);
    } else if (target === 'EXPLORATION') {
      percGain.linearRampToValueAtTime(1, now + fadeTime);
      harpGain.linearRampToValueAtTime(0, now + fadeTime);
    }
  }

  /**
   * Dynamic sequence branching evaluation running at every 8-bar block downbeat marker
   */
  handleDeferredTransitions(timelineTime) {
    const fadeTime = 0.15; // 150ms crossfade rate over downbeat

    if (this.pendingStateChange) {
      if (this.pendingStateChange === 'BATTLE') {
        // Mute exploration layer nodes on downbeat
        this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
        this.gains.exploreCore.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
        this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
        this.gains.idleHarp.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

        // Un-mute combat layers on downbeat marker
        this.gains.battleMusic.gain.setValueAtTime(this.gains.battleMusic.gain.value, timelineTime);
        this.gains.battleMusic.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);

        this.currentState = 'BATTLE';
        this.pendingStateChange = null;
      } else if (this.pendingStateChange === 'EXPLORATION') {
        if (this.currentState === 'BATTLE' || this.currentState === 'BATTLE_INTRO' || this.currentBlock === blockMap.BATTLE_INTRO) {
          // Play victory flourish before resolving to exploration
          this.postBattleState = 'EXPLORATION';
          this.pendingStateChange = null;
        } else {
          this.gains.battleMusic.gain.setValueAtTime(this.gains.battleMusic.gain.value, timelineTime);
          this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

          this.currentState = 'EXPLORATION';
          this.pendingStateChange = null;
        }
      } else if (this.pendingStateChange === 'QUIET') {
        if (this.currentState === 'BATTLE' || this.currentState === 'BATTLE_INTRO' || this.currentBlock === blockMap.BATTLE_INTRO) {
          // Play victory flourish before resolving to quiet
          this.postBattleState = 'QUIET';
          this.pendingStateChange = null;
        } else {
          this.gains.battleMusic.gain.setValueAtTime(this.gains.battleMusic.gain.value, timelineTime);
          this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(0.8, timelineTime + fadeTime);

          this.currentState = 'QUIET';
          this.pendingStateChange = null;
        }
      }
    } else {
      // Natural chain transitions when Victory flourish completes
      if (this.currentBlock === blockMap.BATTLE_OUTRO) {
        const target = this.postBattleState || 'EXPLORATION';
        this.postBattleState = null;

        this.gains.battleMusic.gain.setValueAtTime(this.gains.battleMusic.gain.value, timelineTime);
        this.gains.battleMusic.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);

        if (target === 'QUIET') {
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(0.8, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.currentState = 'QUIET';
        } else {
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
          this.currentState = 'EXPLORATION';
        }
      }
    }
  }

  /**
   * Selects next block using fair shuffle bags (zero sequential repeats)
   */
  selectBlockForState(targetState = this.currentState) {
    if (targetState === 'BATTLE_INTRO') {
      if (this.currentBlock === blockMap.BATTLE_INTRO) {
        return this.battleBag.next();
      }
      return blockMap.BATTLE_INTRO;
    }
    if (targetState === 'BATTLE_OUTRO') {
      if (this.currentBlock === blockMap.BATTLE_OUTRO) {
        return (this.postBattleState === 'QUIET') ? this.quietBag.next() : this.explorationBag.next();
      }
      return blockMap.BATTLE_OUTRO;
    }
    if (targetState === 'BATTLE') {
      return this.battleBag.next();
    }
    if (targetState === 'QUIET') {
      return this.quietBag.next();
    }

    // EXPLORATION:
    // If still in startup sequence, advance through Day 1
    if (this.initialSequenceStage === 2) {
      this.initialSequenceStage = 3;
      return blockMap.EXPLORATION[0]; // Day 1
    }

    // Ongoing exploration rotation: drawn fairly from shuffle bag
    return this.explorationBag.next();
  }

  /**
   * Converts MIDI tick position to exact real-world audio seconds,
   * accounting for all tempo changes, ritardandos, accelerandos, and pauses in the MIDI header.
   */
  ticksToTime(ticks) {
    if (!this.midiData || !this.midiData.header || !this.midiData.header.tempos) {
      return (ticks / (this.PPQ * 150 / 60));
    }
    const tempos = this.midiData.header.tempos;
    const ppq = this.PPQ;
    let time = 0;
    let lastTick = 0;
    let currentBpm = 120;
    for (let i = 0; i < tempos.length; i++) {
      const t = tempos[i];
      if (t.ticks > ticks) break;
      const dt = t.ticks - lastTick;
      time += (dt / (ppq * currentBpm / 60));
      lastTick = t.ticks;
      currentBpm = t.bpm;
    }
    const dt = ticks - lastTick;
    time += (dt / (ppq * currentBpm / 60));
    return time;
  }

  /**
   * Returns exact start time, end time, and duration in seconds for any 8-bar block.
   */
  getBlockMetrics(block) {
    if (!block) return { startTicks: 0, endTicks: 30720, startTimeSec: 0, endTimeSec: 12.8, durationSec: 12.8 };
    const ticksPerBar = 4 * this.PPQ;
    const startTicks = block.startBar * ticksPerBar;
    const endTicks = block.endBar * ticksPerBar;
    const startTimeSec = this.ticksToTime(startTicks);
    const endTimeSec = this.ticksToTime(endTicks);
    const durationSec = Math.max(0.1, endTimeSec - startTimeSec);
    return { startTicks, endTicks, startTimeSec, endTimeSec, durationSec };
  }

  clearPhraseEvents(phraseIdx) {
    if (this.phraseEventIds[phraseIdx]) {
      const transport = Tone.getTransport();
      this.phraseEventIds[phraseIdx].forEach(id => {
        try {
          transport.clear(id);
        } catch (e) {}
      });
      delete this.phraseEventIds[phraseIdx];
    }
  }

  /**
   * Schedule all MIDI notes in an 8-measure block onto Tone.Transport timeline.
   * Strictly follows all microsecond tempo adjustments, note durations, and pauses
   * computed from the provided hyrule_field_midi.json.
   */
  scheduleNotesForBlock(chosenBlock, phraseIdx, startTransportSec) {
    if (!chosenBlock || !this.midiData || !this.midiData.tracks) return;

    const ticksPerBar = 4 * this.PPQ;
    const { startTicks, endTicks, startTimeSec, durationSec } = this.getBlockMetrics(chosenBlock);
    const eventIds = [];
    const transport = Tone.getTransport();

    this.midiData.tracks.forEach((track, trIdx) => {
      const trackCategory = this.getTrackCategory(track, trIdx);
      const sampler = this.getSamplerForTrack(trIdx);
      const isOcarina = (trIdx === 25 || this.getInstrumentKeyForTrack(trIdx) === 'ocarina');

      const notesInBlock = track.notes.filter(note =>
        note.ticks >= startTicks && note.ticks < endTicks
      );

      notesInBlock.forEach((note) => {
        // Exact real-world time in seconds relative to the block start,
        // strictly following all tempo adjustments, rubato, and pauses from hyrule_field_midi.json
        const relativeSec = Math.max(0, note.time - startTimeSec);
        const noteTransportTime = startTransportSec + relativeSec;

        let noteDurationSec = (typeof note.duration === 'number' && note.duration > 0)
          ? note.duration
          : 0.2;

        // Authentic pitch transposition for Ocarina:
        // In the raw MIDI, Ocarina (Track 25) is transcribed 2 octaves too high (A6..G7 / MIDI 83..105).
        // Transposing down 24 semitones (-2 octaves) restores Link's rich alto/tenor ocarina register (A4..D5 / MIDI 59..81),
        // matching the 00_ALL.sf2 Ocarina sample root pitch (Ab4 / MIDI 68) and eliminating harsh/shrill screeching.
        let playMidi = note.midi;
        let playName = note.name;
        if (isOcarina && note.midi >= 80) {
          playMidi = note.midi - 24;
          playName = midiToNoteName(playMidi);
        }

        const noteToPlay = (playMidi !== note.midi)
          ? { ...note, midi: playMidi, name: playName }
          : note;

        // Precise lookahead scheduling on Tone.Transport
        const eventId = transport.scheduleOnce((time) => {
          this.triggerSafeNote(sampler, noteToPlay, noteDurationSec, time);
        }, noteTransportTime);

        eventIds.push(eventId);

        // Add note to visualizer stream
        this.streamNotes.push({
          name: playName,
          midi: playMidi,
          velocity: note.velocity,
          transportTime: noteTransportTime,
          duration: Math.max(0.08, noteDurationSec),
          trackType: trackCategory, // 'melody' | 'bass' | 'percussion'
          mode: chosenBlock.mode, // 'EXPLORATION' | 'QUIET' | 'BATTLE'
          cueId: chosenBlock.id,
          phraseIdx: phraseIdx
        });
      });
    });

    // If the block is a Quiet/Rest cue with no native drums in the MIDI,
    // schedule the master 8-bar galloping snare loop on the explorePercussion layer.
    // In Rest mode, explorePercussion gain is 0 (silent).
    // The moment the player activates Adventure mode, explorePercussion un-mutes
    // and the drums resume immediately in perfect tempo without waiting for the next cue!
    if (chosenBlock.mode === 'QUIET') {
      const gallopTrack = this.midiData.tracks.find(t => t.channel === 9 && t.notes && t.notes.length > 500);
      if (gallopTrack) {
        const dayStartTicks = 17 * ticksPerBar;
        const dayEndTicks = 25 * ticksPerBar;
        const dayPercNotes = gallopTrack.notes.filter(n => n.ticks >= dayStartTicks && n.ticks < dayEndTicks);
        const totalBlockTicks = 8 * ticksPerBar;

        dayPercNotes.forEach(note => {
          const noteFraction = (note.ticks - dayStartTicks) / totalBlockTicks;
          const relativeSec = noteFraction * durationSec;
          const noteTransportTime = startTransportSec + relativeSec;
          const noteDurationSec = (note.durationTicks / totalBlockTicks) * durationSec;

          const eventId = transport.scheduleOnce((time) => {
            this.triggerSafeNote('percussion', note, noteDurationSec, time);
          }, noteTransportTime);

          eventIds.push(eventId);

          this.streamNotes.push({
            name: note.name,
            midi: note.midi,
            velocity: note.velocity,
            transportTime: noteTransportTime,
            duration: Math.max(0.08, noteDurationSec),
            trackType: 'percussion',
            mode: 'QUIET',
            cueId: chosenBlock.id,
            phraseIdx: phraseIdx
          });
        });
      }
    }

    this.phraseEventIds[phraseIdx] = eventIds;
  }

  /**
   * Re-queues the upcoming phrase when user changes game mode mid-phrase
   */
  requeueUpcomingPhrase(forcedTargetState = null) {
    const upcomingPhraseIdx = this.phraseIndex + 1;
    const upcomingStartTransportSec = this.upcomingBlockStartSec;

    // 1. Cancel previous upcoming phrase events
    this.clearPhraseEvents(upcomingPhraseIdx);

    // 2. Remove upcoming phrase notes from visualizer stream
    this.streamNotes = this.streamNotes.filter(n => n.phraseIdx !== upcomingPhraseIdx);

    // 3. Select next block based on target state
    const targetState = forcedTargetState || this.pendingStateChange || this.currentState;
    const newBlock = this.selectBlockForState(targetState);
    this.upcomingBlock = newBlock;

    // 4. Pre-schedule the new upcoming block
    this.scheduleNotesForBlock(newBlock, upcomingPhraseIdx, upcomingStartTransportSec);
  }

  /**
   * Master 8-bar phrase downbeat clock: dynamically fires at the exact completion
   * time of the active block, accounting for variable tempo blocks (e.g. Morning 16.8s, Quiet 13.7s-14.2s, Day 12.8s)
   */
  onPhraseBoundary(timelineTime) {
    const audioTime = timelineTime || Tone.now();

    // 1. Process deferred transitions on downbeat
    this.handleDeferredTransitions(audioTime);

    // 2. The pre-queued upcoming block now becomes the active block
    this.phraseIndex++;
    this.currentBlock = this.upcomingBlock;
    const currentMetrics = this.getBlockMetrics(this.currentBlock);
    const startTransportSec = this.upcomingBlockStartSec;

    this.currentBlockStartTransportSec = startTransportSec;
    this.currentBlockDurationSec = currentMetrics.durationSec;
    currentBlockStartTransportSec = startTransportSec;
    currentBlockDurationSec = currentMetrics.durationSec;

    // Immediately advance state so lookahead pre-queuing selects the next sequence
    // rather than repeating BATTLE_INTRO or BATTLE_OUTRO twice back-to-back
    if (this.currentBlock === blockMap.BATTLE_INTRO) {
      this.currentState = 'BATTLE';
    } else if (this.currentBlock === blockMap.BATTLE_OUTRO) {
      this.currentState = this.postBattleState || 'EXPLORATION';
    }

    // 3. Pre-queue the NEXT upcoming block ahead of time (1 block lookahead)
    const nextPhraseIdx = this.phraseIndex + 1;
    const nextStartTransportSec = startTransportSec + currentMetrics.durationSec;
    this.upcomingBlockStartSec = nextStartTransportSec;

    const nextBlock = this.selectBlockForState(this.currentState);
    this.upcomingBlock = nextBlock;
    this.scheduleNotesForBlock(nextBlock, nextPhraseIdx, nextStartTransportSec);

    // Dynamic phrase boundary clock on Tone.Transport: fires at exact conclusion of this block
    const transport = Tone.getTransport();
    this.boundaryEventId = transport.scheduleOnce((time) => {
      this.onPhraseBoundary(time);
    }, nextStartTransportSec);

    // 4. Clean up Transport events from older phrases to prevent unbounded timeline memory growth
    Object.keys(this.phraseEventIds).forEach(key => {
      const idx = parseInt(key, 10);
      if (idx < this.phraseIndex - 1) {
        this.clearPhraseEvents(idx);
      }
    });

    // 5. Clean up old visualizer notes (more than 2.5s in the past)
    const currentTransportSec = transport.seconds;
    this.streamNotes = this.streamNotes.filter(n => (n.transportTime + n.duration) >= (currentTransportSec - 2.5));
  }

  async startEngine() {
    await Tone.start();
    const transport = Tone.getTransport();

    if (transport.state !== 'started') {
      transport.cancel(0);
      transport.position = 0;
      this.phraseIndex = 0;
      this.streamNotes = [];
      this.phraseEventIds = {};

      // Reset shuffle bags
      this.explorationBag.reset();
      this.battleBag.reset();
      this.quietBag.reset();

      // Startup Sequence:
      // Phrase 0: Morning Sunrise cue (Bars 1–9) with full rubato (16.867s)
      const block0 = blockMap.MORNING;
      const metrics0 = this.getBlockMetrics(block0);
      this.currentBlock = block0;
      this.currentBlockStartTransportSec = 0;
      this.currentBlockDurationSec = metrics0.durationSec;
      currentBlockStartTransportSec = 0;
      currentBlockDurationSec = metrics0.durationSec;
      this.scheduleNotesForBlock(block0, 0, 0);

      // Phrase 1: Heroic Intro Fanfare (Bars 9–17)
      const block1 = blockMap.INTRO;
      const metrics1 = this.getBlockMetrics(block1);
      this.upcomingBlock = block1;
      this.upcomingBlockStartSec = metrics0.durationSec;
      this.scheduleNotesForBlock(block1, 1, metrics0.durationSec);

      this.initialSequenceStage = 2; // Next will be Day 1

      // Dynamic phrase boundary clock: fires at exact conclusion of Morning
      this.boundaryEventId = transport.scheduleOnce((time) => {
        this.onPhraseBoundary(time);
      }, metrics0.durationSec);

      transport.start();
    }
  }

  stopEngine() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    if (this.boundaryEventId !== null) {
      try { transport.clear(this.boundaryEventId); } catch (e) {}
      this.boundaryEventId = null;
    }
    this.repeatEventId = null;
    this.phraseIndex = 0;
    this.postBattleState = null;
    this.streamNotes = [];
    this.phraseEventIds = {};
    if (this.soundRack && typeof this.soundRack.releaseAll === 'function') {
      this.soundRack.releaseAll();
    }
  }

  // --- Real-time Interactive Mixer Controls ---

  setMasterVolume(valDb) {
    if (this.masterVolume) {
      this.masterVolume.volume.value = Math.max(-36, Math.min(6, valDb));
    }
  }

  setMasterWarmth(cutoffHz) {
    if (this.masterWarmthFilter) {
      this.masterWarmthFilter.frequency.value = Math.max(4000, Math.min(20000, cutoffHz));
    }
  }

  setMasterTreble(trebleDb) {
    if (this.masterEQ) {
      this.masterEQ.high.value = Math.max(-14, Math.min(4, trebleDb));
    }
  }

  setMasterReverbWet(wetRatio) {
    if (this.masterReverb) {
      this.masterReverb.wet.value = Math.max(0, Math.min(0.8, wetRatio));
    }
  }

  setMixerPreset(presetName) {
    switch (presetName) {
      case 'n64': // Authentic N64 Warmth (Default & Recommended)
        this.setMasterWarmth(11500);
        this.setMasterTreble(-4.0);
        this.setMasterReverbWet(0.22);
        this.setMasterVolume(-2.5);
        if (this.masterEQ) {
          this.masterEQ.low.value = 2.2;
          this.masterEQ.mid.value = -1.2;
        }
        break;
      case 'hall': // Concert Hall
        this.setMasterWarmth(10000);
        this.setMasterTreble(-5.5);
        this.setMasterReverbWet(0.36);
        this.setMasterVolume(-3.0);
        if (this.masterEQ) {
          this.masterEQ.low.value = 3.0;
          this.masterEQ.mid.value = -1.5;
        }
        break;
      case 'retro': // Vintage CRT / TV Speaker Warmth
        this.setMasterWarmth(8500);
        this.setMasterTreble(-6.0);
        this.setMasterReverbWet(0.16);
        this.setMasterVolume(-2.0);
        if (this.masterEQ) {
          this.masterEQ.low.value = 1.5;
          this.masterEQ.mid.value = 0.0;
        }
        break;
      case 'bright': // Crisp Studio
        this.setMasterWarmth(15500);
        this.setMasterTreble(-1.5);
        this.setMasterReverbWet(0.18);
        this.setMasterVolume(-3.5);
        if (this.masterEQ) {
          this.masterEQ.low.value = 1.8;
          this.masterEQ.mid.value = -0.8;
        }
        break;
    }
  }

  getMixerSettings() {
    return {
      volume: this.masterVolume ? this.masterVolume.volume.value : -2.5,
      warmth: this.masterWarmthFilter ? this.masterWarmthFilter.frequency.value : 11500,
      treble: this.masterEQ ? this.masterEQ.high.value : -4.0,
      reverbWet: this.masterReverb ? this.masterReverb.wet.value : 0.22
    };
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
  const upcomingBlock = sequencer.upcomingBlock;
  const currentMode = sequencer.currentState;
  const pendingMode = sequencer.pendingStateChange;
  const transportSec = Tone.getTransport() ? Tone.getTransport().seconds : 0;
  const blockStartSec = sequencer.currentBlockStartTransportSec;
  const blockDurSec = sequencer.currentBlockDurationSec || sequencer.BLOCK_DURATION_SEC;

  return {
    cueId: currentBlock ? currentBlock.id : 'Sunrise (Bars 1–9)',
    cueName: currentBlock ? currentBlock.name : 'Morning Dawn Ocarina',
    cueMode: currentBlock ? currentBlock.mode : 'EXPLORATION',
    upcomingCueId: upcomingBlock ? upcomingBlock.id : null,
    upcomingCueName: upcomingBlock ? upcomingBlock.name : null,
    upcomingCueMode: upcomingBlock ? upcomingBlock.mode : null,
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

export function setMixerParameter(param, value) {
  if (!sequencer) return;
  if (param === 'volume') sequencer.setMasterVolume(value);
  else if (param === 'warmth') sequencer.setMasterWarmth(value);
  else if (param === 'treble') sequencer.setMasterTreble(value);
  else if (param === 'reverb') sequencer.setMasterReverbWet(value);
}

export function setMixerPreset(presetName) {
  if (!sequencer) return;
  sequencer.setMixerPreset(presetName);
}

export function getMixerSettings() {
  return sequencer ? sequencer.getMixerSettings() : null;
}

