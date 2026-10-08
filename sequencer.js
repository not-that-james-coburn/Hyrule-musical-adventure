import * as Tone from 'tone';

// Track active block timing constants
export const BARS_PER_BLOCK = 8;
export const BLOCK_DURATION_SEC = 12.8; // 8 bars * 4 beats * (60 / 150 BPM)
export let currentBlockDurationSec = BLOCK_DURATION_SEC;
export let currentBlockStartTransportSec = 0;

// Authentic N64 Zelda Symphonic Soundstage Panning Map (Koji Kondo / Nintendo EAD Audioseq arrangement)
// Preserves punchy centered bass & drums while placing strings, brass, and accompaniment across the stereo field
export const N64_ORCHESTRAL_PANS = {
  0: -0.15, // Solo Trombone (Center-Left)
  1:  0.25, // Solo Trumpet / Fanfare (Center-Right)
  2: -0.35, // Brass Section / French Horns (Mid-Left)
  3: -0.48, // String Ensemble 1 / Violins (Wide-Left)
  4:  0.20, // Tenor Sax / Woodwind flourish (Mid-Right)
  5: -0.10, // Flute Solo (Center-Left)
  6:  0.45, // Orchestral Harp (Wide-Right)
  7: -0.25, // Accordion / Reed Organ (Mid-Left)
  8:  0.00, // Electric Bass / Pick Bass (Dead Center)
  9:  0.00, // Standard Kit / Percussion (Dead Center)
  10: 0.35, // Marimba (Mid-Right)
  11: 0.00, // Ocarina Solo Lead (Dead Center with wide stereo chorus)
  12: 0.42, // Vibraphone / Glockenspiel (Mid-Right)
  13: 0.48, // String Ensemble 2 / Violas & Cellos (Wide-Right counter-pan)
  14:-0.22, // Timpani (Center-Left)
  15: 0.00  // Contrabass / Cello bass foundation (Dead Center)
};

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
    },
    {
      id: 'Day 7 (Bars 121–129)',
      name: 'Triumphant Return Flourish',
      startBar: 121,
      endBar: 129,
      mode: 'EXPLORATION'
    },
    {
      id: 'Day 8 (Bars 129–137)',
      name: 'Ocarina & Winds Interlude',
      startBar: 129,
      endBar: 137,
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

  // Ongoing Quiet / Rest Pool (shuffled via ShuffleBag, no sequential repeats)
  QUIET: [
    {
      id: 'Rest 1 (Bars 137–145)',
      name: 'Nocturne Harp Serenade',
      startBar: 137,
      endBar: 145,
      mode: 'QUIET'
    },
    {
      id: 'Rest 2 (Bars 145–153)',
      name: 'Starlit Plains Solitude',
      startBar: 145,
      endBar: 153,
      mode: 'QUIET'
    },
    {
      id: 'Rest 3 (Bars 153–161)',
      name: 'Gentle Pastoral Ocarina',
      startBar: 153,
      endBar: 161,
      mode: 'QUIET'
    },
    {
      id: 'Rest 4 (Bars 161–169)',
      name: 'Campfire Rest Reflections',
      startBar: 161,
      endBar: 169,
      mode: 'QUIET'
    },
    {
      id: 'Rest 5 (Bars 169–177)',
      name: 'Sanctuary Whispers Harmony',
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

    // Dynamic Stem Gains (Interactive Koji Kondo Arrangement Stems)
    this.gains = {
      exploreMelody: new Tone.Gain(1),
      exploreCore: new Tone.Gain(1),
      explorePercussion: new Tone.Gain(1),
      idleHarp: new Tone.Gain(0),
      battleMusic: new Tone.Gain(0)
    };
    this.linkMovementState = 'RUNNING'; // 'RUNNING' (active melody) or 'IDLE' (pastoral standing still)

    // Dedicated Per-Channel Nodes (MIDI Channels 0–15)
    this.channelGains = {};
    this.channelPanners = {};
    this.channelReverbSends = {};
    this.channelChorusSends = {};
    this.channelVibratos = {};
    this.stereoWidth = 1.0; // 1.0 = Authentic N64 orchestral width, 0.0 = Mono, 1.5 = Extra wide
    this.sfxBus = null;
    this.sfxReverbSend = null;
    this.reverbBus = null;
    this.reverbEffect = null;
    this.reverbReturnGain = null;
    this.chorusBus = null;
    this.chorusEffect = null;
    this.chorusReturnGain = null;
    this.n64Filter = null;
    this.masterEQ = null;

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

    // History and scheduled timeline of blocks for accurate runtime measure lines
    this.blockHistory = [];

    // Simple Mode Randomizer Engine (Adventure, Rest, Battle)
    this.randomizerEnabled = true;
    this.currentModeBlocksRemaining = 0;

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

      // 1. Direct Output Pipeline: Master Limiter, Volume, EQ & N64 RSP Reconstruction Filter
      this.masterLimiter = new Tone.Limiter(-0.5).toDestination();
      this.masterVolume = new Tone.Volume(-2.0).connect(this.masterLimiter);
      this.masterEQ = new Tone.EQ3({ low: 0.5, mid: 0.0, high: 0.0 }).connect(this.masterVolume);

      // Authentic N64 RSP Reconstruction Filter (gentle -12dB/oct rolloff at 13.5 kHz)
      this.n64Filter = new Tone.Filter(13500, 'lowpass', -12).connect(this.masterEQ);
      this.masterPreBus = new Tone.Gain(1.0).connect(this.n64Filter);

      // Connect localized stems directly into Master Pre-Bus
      this.gains.exploreMelody.connect(this.masterPreBus);
      this.gains.exploreCore.connect(this.masterPreBus);
      this.gains.explorePercussion.connect(this.masterPreBus);
      this.gains.idleHarp.connect(this.masterPreBus);
      this.gains.battleMusic.connect(this.masterPreBus);

      // 2. Authentic N64 Schroeder/Moorer Comb-Filter Auxiliary Reverb Send Bus
      this.reverbBus = new Tone.Gain(1.0);
      this.reverbEffect = new Tone.Freeverb({
        roomSize: 0.78,
        dampening: 3500
      });
      this.reverbReturnGain = new Tone.Gain(0.65);
      this.reverbBus.connect(this.reverbEffect);
      this.reverbEffect.connect(this.reverbReturnGain);
      this.reverbReturnGain.connect(this.masterPreBus);

      // 3. Authentic N64 Microcode Stereo Chorus Bus (CC#93)
      this.chorusBus = new Tone.Gain(1.0);
      this.chorusEffect = new Tone.Chorus({
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        spread: 180,
        wet: 1.0
      }).start();
      this.chorusReturnGain = new Tone.Gain(0.60);
      this.chorusBus.connect(this.chorusEffect);
      this.chorusEffect.connect(this.chorusReturnGain);
      this.chorusReturnGain.connect(this.masterPreBus);

      // 4. Build dedicated N64 Orchestral Stereo Stage (Panners), Channel Gains & FX Sends (Channels 0–15)
      for (let ch = 0; ch <= 15; ch++) {
        this.channelGains[ch] = new Tone.Gain(1.0);
        const panValue = (N64_ORCHESTRAL_PANS[ch] ?? 0.0) * (this.stereoWidth ?? 1.0);
        this.channelPanners[ch] = new Tone.Panner(panValue);
        this.channelReverbSends[ch] = new Tone.Gain(0.0);
        this.channelChorusSends[ch] = new Tone.Gain(0.0);

        // Connect Channel Gain to Reverb Send & Chorus Send (post-fader aux sends)
        this.channelGains[ch].connect(this.channelReverbSends[ch]);
        this.channelReverbSends[ch].connect(this.reverbBus);

        this.channelGains[ch].connect(this.channelChorusSends[ch]);
        this.channelChorusSends[ch].connect(this.chorusBus);

        // Direct signal flows through dedicated Orchestral Stereo Panner into Stems
        this.channelGains[ch].connect(this.channelPanners[ch]);

        // Connect Stereo Panner to dynamic stems
        if (ch === 9 || ch === 14) {
          // Standard Kit percussion (Ch 9) & Timpani (Ch 14)
          this.channelPanners[ch].connect(this.gains.explorePercussion);
          this.channelPanners[ch].connect(this.gains.battleMusic);
        } else if (ch === 6) {
          // Orchestral Harp (Ch 6): active in Idle pastoral mode, Explore, and Battle
          this.channelPanners[ch].connect(this.gains.idleHarp);
          this.channelPanners[ch].connect(this.gains.exploreCore);
          this.channelPanners[ch].connect(this.gains.battleMusic);
        } else if (ch === 0 || ch === 1 || ch === 2 || ch === 5 || ch === 11) {
          // Lead Melody Channels: Trombone (0), Trumpet (1), Brass (2), Flute (5), Ocarina (11)
          this.channelPanners[ch].connect(this.gains.exploreMelody);
          this.channelPanners[ch].connect(this.gains.battleMusic);
        } else {
          // Accompaniment Channels: Strings (3, 13), Sax (4), Accordion (7), Bass (8), Marimba (10), Vibraphone (12), Contrabass (15)
          this.channelPanners[ch].connect(this.gains.exploreCore);
          this.channelPanners[ch].connect(this.gains.battleMusic);
        }
      }

      // 4. Natural Vibrato LFO on Lead Solo Instruments (N64 Audioseq pitch modulation)
      // Subtle 5.5 Hz vibrato with 0.14 depth (~18-20 cents) on Flute (Ch 5) & Ocarina (Ch 11)
      this.channelVibratos[5] = new Tone.Vibrato({ frequency: 5.5, depth: 0.14, type: 'sine' });
      this.channelVibratos[11] = new Tone.Vibrato({ frequency: 5.5, depth: 0.14, type: 'sine' });
      this.channelVibratos[5].connect(this.channelGains[5]);
      this.channelVibratos[11].connect(this.channelGains[11]);

      // 5. Atmospheric Environmental SFX Bus with Authentic Schroeder Reverb
      this.sfxBus = new Tone.Gain(1.0).connect(this.masterPreBus);
      this.sfxReverbSend = new Tone.Gain(0.35);
      this.sfxBus.connect(this.sfxReverbSend);
      this.sfxReverbSend.connect(this.reverbBus);

      // 4. Load Assets (manifest + MIDI data)
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
        console.warn('Some SoundFont buffers took too long, continuing with ready samples:', err);
      }

      // Populate initial block cues and blockHistory
      const b0 = blockMap.MORNING;
      const d0 = this.getBlockDuration(b0);
      const b1 = blockMap.INTRO;
      const d1 = this.getBlockDuration(b1);
      this.currentBlock = b0;
      this.currentBlockStartTransportSec = 0;
      this.currentBlockDurationSec = d0;
      this.upcomingBlock = b1;
      this.upcomingBlockStartSec = d0;
      this.blockHistory = [
        { block: b0, startTransportSec: 0, durationSec: d0 },
        { block: b1, startTransportSec: d0, durationSec: d1 }
      ];

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
    // Calibrated instrument balance for authentic N64 Zelda SoundFont (Xadra_s_LoZ_Soundfont_2023.sf2)
    const sampleSpecs = {
      ocarina: { filter: k => k.startsWith('Ocarina'), defaultVol: -4.0 },
      piano: { filter: k => k.startsWith('Piano'), defaultVol: -5.5 },
      trombone: { filter: k => k.startsWith('Trombone'), defaultVol: -4.5 },
      trumpet: { filter: k => k.startsWith('Trumpet'), defaultVol: -5.0 },
      brassSection: { filter: k => k.startsWith('Horn') || k.startsWith('Trumpet') || k.startsWith('Trombone'), defaultVol: -4.5 },
      stringEnsemble: { filter: k => k.startsWith('Strings') || k.startsWith('String Pad'), defaultVol: -4.0 },
      stringEnsemble2: { filter: k => k.startsWith('Strings') || k.startsWith('String Pad'), defaultVol: -4.0 },
      cello: { filter: k => k.startsWith('Strings Low') || k.startsWith('Pizzicato Low'), defaultVol: -4.0 },
      doubleBass: { filter: k => k.startsWith('Strings Low') || k.startsWith('Pizzicato Low') || k.startsWith('Tuba'), defaultVol: -3.0 },
      pickBass: { filter: k => k.startsWith('Guitar Bass') || k.startsWith('Pizzicato Low') || k.startsWith('Strings Low') || k.startsWith('Bassoon'), defaultVol: -3.0 },
      flute: { filter: k => k.startsWith('Flute') || k.startsWith('Piccolo'), defaultVol: -5.0 },
      tenorSax: { filter: k => k.startsWith('Clarinet') || k.startsWith('Oboe') || k.startsWith('Bassoon'), defaultVol: -5.0 },
      harp: { filter: k => k.startsWith('Harp High') || k.startsWith('Harp Low'), defaultVol: -4.0 },
      accordion: { filter: k => k.startsWith('Accordion'), defaultVol: -5.0 },
      marimba: { filter: k => k.startsWith('Marimba'), defaultVol: -4.5 },
      vibraphone: { filter: k => k.startsWith('Glockenspiel') || k === 'Bell', defaultVol: -5.0 },
      timpani: { filter: k => k.startsWith('Timpani'), defaultVol: -3.5 },
      snare: { filter: k => k.startsWith('Snare'), defaultVol: -4.0 },
      hihat: { filter: k => k === 'Hi Hat' || k === 'Cymbal Hit', defaultVol: -6.5 },
      kick: { filter: k => k === 'Kick Drum' || k === 'Ethnic Kick', defaultVol: -3.0 },
      tom: { filter: k => k.startsWith('Bent Drum') || k.startsWith('Ethnic Drum Kit') || k.startsWith('Timpani Low'), defaultVol: -4.0 },

      // Atmospheric Environmental Sound Effects
      wolfosHowl: { filter: k => k === 'Wolfos Howl', defaultVol: -2.0, isSfx: true },
      towerBell: { filter: k => k === 'Tower Bell', defaultVol: -1.5, isSfx: true },
      dangerSting: { filter: k => k === 'Danger Sting', defaultVol: -1.0, isSfx: true },
      prairieWind: { filter: k => k === 'Prairie Wind', defaultVol: -6.0, isSfx: true }
    };

    const instToChannel = {
      trombone: 0,
      trumpet: 1,
      brassSection: 2,
      stringEnsemble: 3,
      tenorSax: 4,
      flute: 5,
      harp: 6,
      accordion: 7,
      pickBass: 8,
      kick: 9,
      snare: 9,
      hihat: 9,
      tom: 9,
      marimba: 10,
      ocarina: 11,
      vibraphone: 12,
      stringEnsemble2: 13,
      timpani: 14,
      doubleBass: 15,
      cello: 15,
      piano: 0
    };

    const samplers = {};
    this.instGains = {};

    for (const [instKey, spec] of Object.entries(sampleSpecs)) {
      const urls = this.buildSamplerUrls(spec.filter);
      if (Object.keys(urls).length > 0) {
        const sampler = new Tone.Sampler({ urls, baseUrl: this.soundfontBaseUrl });
        if (typeof spec.defaultVol === 'number') {
          sampler.volume.value = spec.defaultVol;
        }

        // Route sampler into its dedicated MIDI channel gain node, vibrato node, or SFX bus
        const targetChannel = instToChannel[instKey] ?? 0;
        const targetChannelGain = this.channelGains[targetChannel];
        const targetVibrato = this.channelVibratos ? this.channelVibratos[targetChannel] : null;

        if (spec.isSfx) {
          sampler.connect(this.sfxBus || this.masterPreBus);
          this.instGains[instKey] = this.sfxBus || this.masterPreBus;
        } else if (targetVibrato && (instKey === 'ocarina' || instKey === 'flute')) {
          sampler.connect(targetVibrato);
          this.instGains[instKey] = targetChannelGain || new Tone.Gain(1.0);
        } else if (targetChannelGain) {
          sampler.connect(targetChannelGain);
          this.instGains[instKey] = targetChannelGain;
        } else {
          sampler.connect(this.masterPreBus);
          this.instGains[instKey] = this.masterPreBus;
        }

        samplers[instKey] = sampler;
      }
    }
    this.instGains.percussion = this.channelGains[9];

    function releaseAll() {
      Object.values(samplers).forEach(s => {
        if (s && typeof s.releaseAll === 'function') {
          try { s.releaseAll(); } catch (e) {}
        }
      });
    }

    return {
      samplers,
      channelGains: this.channelGains,
      channelPanners: this.channelPanners,
      channelReverbSends: this.channelReverbSends,
      channelChorusSends: this.channelChorusSends,
      instGains: this.instGains,
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
    if (!track) return 'harmony';
    const ch = track.channel;

    // 1. Percussion: MIDI Ch 9 (Kit) & Ch 14 (Timpani)
    if (ch === 9 || ch === 14) {
      return 'percussion';
    }
    if (track.instrument && (track.instrument.family === 'drums' || (track.instrument.name && track.instrument.name.toLowerCase().includes('timpani')))) {
      return 'percussion';
    }

    // 2. Bass: MIDI Ch 8 (Pick Bass) & Ch 15 (Contrabass)
    if (ch === 8 || ch === 15) {
      return 'bass';
    }
    const instName = (track.instrument ? track.instrument.name : '').toLowerCase();
    if (instName.includes('contrabass') || (instName.includes('bass') && !instName.includes('brass')) || instName.includes('cello')) {
      return 'bass';
    }

    // 3. Lead Solo Melody:
    // Tr 0: Trombone Solo Lead
    // Tr 3: Trumpet Solo Lead
    // Tr 13: Flute Solo Lead
    // Tr 25: Ocarina Solo Lead
    if (trIdx === 0 || trIdx === 3 || trIdx === 13 || trIdx === 25) {
      return 'melody';
    }

    // Ocarina (ch 11) is always melody
    if (ch === 11) {
      return 'melody';
    }

    // 4. Harmony & Accompaniment:
    // Secondary brass voices (Tr 1, 2, 4, 5, 7), Strings (Tr 8-11, 27-29),
    // Sax flourishes (Tr 12), Flute harmony (Tr 15), Harp (Tr 16),
    // Accordion (Tr 17), Marimba (Tr 24), Vibraphone bells (Tr 26)
    return 'harmony';
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
    const dur = Math.max(0.04, durationSec);
    const vel = (typeof note.velocity === 'number' && !isNaN(note.velocity))
      ? Math.max(0.01, Math.min(1.0, note.velocity))
      : 0.8;

    if (sampler === 'percussion') {
      const midiPitch = note.midi;
      if (midiPitch === 35 || midiPitch === 36) {
        const kickSampler = this.soundRack.samplers.kick;
        if (kickSampler && kickSampler.loaded) {
          try { kickSampler.triggerAttackRelease('C2', dur, safeTime, vel); } catch (e) {}
        }
      } else if (midiPitch === 38 || midiPitch === 40) {
        const snareSampler = this.soundRack.samplers.snare;
        if (snareSampler && snareSampler.loaded) {
          try { snareSampler.triggerAttackRelease(midiPitch === 38 ? 'B3' : 'C4', dur, safeTime, vel); } catch (e) {}
        }
      } else if (midiPitch === 42 || midiPitch === 44 || midiPitch === 46) {
        const hihatSampler = this.soundRack.samplers.hihat;
        if (hihatSampler && hihatSampler.loaded) {
          try { hihatSampler.triggerAttackRelease('C4', dur, safeTime, vel); } catch (e) {}
        }
      } else if (midiPitch >= 41 && midiPitch <= 50) {
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
   * Calculates the exact audio second timestamp of the very next 4/4 measure downbeat.
   * Ensures at least 150ms lookahead to protect against audio underrun glitches.
   */
  getNextMeasureDownbeatSec() {
    const transport = Tone.getTransport();
    const currentTransportSec = transport ? transport.seconds : 0;
    const blockStart = this.currentBlockStartTransportSec;
    const block = this.currentBlock;

    if (!block || !this.midiData || !this.midiData.header) {
      // Fallback: 150 BPM = 1.6s per bar
      const barDur = (60 / this.BPM) * this.BEATS_PER_BAR; // 1.6s
      const elapsed = Math.max(0, currentTransportSec - blockStart);
      const nextBarIdx = Math.floor(elapsed / barDur) + 1;
      let targetTime = blockStart + nextBarIdx * barDur;
      if (targetTime - currentTransportSec < 0.15) {
        targetTime += barDur;
      }
      return targetTime;
    }

    const ticksPerBar = 4 * this.PPQ;
    const blockStartMidiSec = this.ticksToTime(block.startBar * ticksPerBar);
    const totalBars = block.endBar - block.startBar; // 8 bars

    for (let b = 1; b <= totalBars; b++) {
      const barTicks = (block.startBar + b) * ticksPerBar;
      const barMidiSec = this.ticksToTime(barTicks);
      const barRelSec = barMidiSec - blockStartMidiSec;
      const barAbsTransportSec = blockStart + barRelSec;

      // Ensure at least 150ms lookahead to schedule audio cleanly without underrun
      if (barAbsTransportSec - currentTransportSec >= 0.15) {
        return barAbsTransportSec;
      }
    }

    // If already at or past the last measure, return block completion time
    return blockStart + (this.currentBlockDurationSec || this.BLOCK_DURATION_SEC);
  }

  /**
   * Fast 1-Measure Combat Interrupt:
   * Interrupts the active sequence precisely at the next measure downbeat boundary (1 bar),
   * releasing held exploration notes, fading stems, and launching the target battle or victory cue.
   */
  executeMeasureInterrupt(targetBlock, targetState) {
    const transport = Tone.getTransport();
    const interruptTime = this.getNextMeasureDownbeatSec();

    // 1. Cancel remaining events of current phrase starting from interrupt downbeat
    this.clearPhraseEvents(this.phraseIndex, interruptTime);

    // 2. Cancel pre-queued upcoming phrase events
    const upcomingPhraseIdx = this.phraseIndex + 1;
    this.clearPhraseEvents(upcomingPhraseIdx, 0);

    // 3. Clear future visualizer notes from the interrupt point onward
    this.streamNotes = this.streamNotes.filter(n => n.transportTime < interruptTime);

    // 4. Cancel pending 8-bar phrase boundary clock timer
    if (this.boundaryEventId !== null) {
      try { transport.clear(this.boundaryEventId); } catch (e) {}
      this.boundaryEventId = null;
    }

    // 5. Schedule release of sounding notes and mode crossfade right on the measure downbeat
    this.pendingStateChange = targetState;
    transport.scheduleOnce((time) => {
      if (this.soundRack && typeof this.soundRack.releaseAll === 'function') {
        try { this.soundRack.releaseAll(); } catch (e) {}
      }
      this.handleDeferredTransitions(time);
    }, interruptTime);

    // 6. Advance phrase index and activate the interrupted cue
    this.phraseIndex++;
    const activePhraseIdx = this.phraseIndex;
    const blockDurSec = this.getBlockDuration(targetBlock);

    this.currentBlock = targetBlock;
    this.currentBlockStartTransportSec = interruptTime;
    this.currentBlockDurationSec = blockDurSec;
    currentBlockStartTransportSec = interruptTime;
    currentBlockDurationSec = blockDurSec;

    // Immediately update state so subsequent lookahead uses the correct mode
    if (targetBlock === blockMap.BATTLE_INTRO) {
      this.currentState = 'BATTLE';
    } else if (targetBlock === blockMap.BATTLE_OUTRO) {
      this.currentState = this.postBattleState || 'EXPLORATION';
    }

    // Schedule all notes for the new block starting precisely on the measure downbeat
    this.scheduleNotesForBlock(targetBlock, activePhraseIdx, interruptTime);

    // 7. Schedule next phrase boundary timer for the conclusion of this block
    const nextStartTransportSec = interruptTime + blockDurSec;
    this.upcomingBlockStartSec = nextStartTransportSec;

    this.boundaryEventId = transport.scheduleOnce((time) => {
      this.onPhraseBoundary(time);
    }, nextStartTransportSec);

    // 8. Pre-queue next block for lookahead
    const nextPhraseIdx = activePhraseIdx + 1;
    const nextBlock = this.selectBlockForState(this.currentState);
    this.upcomingBlock = nextBlock;
    this.scheduleNotesForBlock(nextBlock, nextPhraseIdx, nextStartTransportSec);

    // 9. Synchronize blockHistory for dynamic runtime measure lines
    if (this.blockHistory) {
      this.blockHistory = this.blockHistory.filter(b => b.startTransportSec < interruptTime - 0.05);
      if (this.blockHistory.length > 0) {
        const last = this.blockHistory[this.blockHistory.length - 1];
        if (last.startTransportSec + last.durationSec > interruptTime) {
          last.durationSec = Math.max(0.1, interruptTime - last.startTransportSec);
        }
      }
      this.addBlockToHistory(targetBlock, interruptTime, blockDurSec);
      this.addBlockToHistory(nextBlock, nextStartTransportSec, this.getBlockDuration(nextBlock));
    }
  }

  /**
   * Set musical mode. Supports 'EXPLORATION', 'QUIET', 'BATTLE'.
   */
  setState(newState) {
    if (newState === this.currentState && !this.pendingStateChange) return;

    const inCombat = (this.currentState === 'BATTLE' || this.currentState === 'BATTLE_INTRO' || this.currentBlock === blockMap.BATTLE_INTRO);

    if (newState === 'BATTLE') {
      if (!inCombat) {
        // Fast 1-Measure Combat Interrupt: Enemy spotted! Danger sting strikes immediately
        this.playDangerSting(Tone.now());
        this.executeMeasureInterrupt(blockMap.BATTLE_INTRO, 'BATTLE');
      }
    } else if (newState === 'EXPLORATION' && inCombat) {
      // Fast 1-Measure Combat Resolution: Enemy defeated! Burst into Victory on next measure downbeat
      this.postBattleState = 'EXPLORATION';
      this.executeMeasureInterrupt(blockMap.BATTLE_OUTRO, 'EXPLORATION');
    } else if (newState === 'QUIET' && inCombat) {
      // Rest mode selected during Battle: Play Victory on next measure downbeat, then settle into Quiet
      this.postBattleState = 'QUIET';
      this.executeMeasureInterrupt(blockMap.BATTLE_OUTRO, 'QUIET');
    } else if (newState === 'QUIET' && this.currentState === 'EXPLORATION') {
      // Immediate volume crossfade mid-bar into serene Rest mode
      this.executeMovementCrossfade('QUIET');
      this.currentState = 'QUIET';
      this.pendingStateChange = 'QUIET';
      this.requeueUpcomingPhrase('QUIET');
    } else if (newState === 'EXPLORATION' && this.currentState === 'QUIET') {
      // Immediate volume crossfade mid-bar into active Adventure mode
      this.executeMovementCrossfade('EXPLORATION');
      this.currentState = 'EXPLORATION';
      this.pendingStateChange = 'EXPLORATION';
      this.requeueUpcomingPhrase('EXPLORATION');
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
   * Mid-bar real-time volume crossfade for Link movement (Running vs Standing Still) and quiet/idle mode
   */
  executeMovementCrossfade(target = this.linkMovementState) {
    const now = Tone.now();
    const fadeTime = 0.40; // 400ms smooth real-time crossfade

    const melodyGain = this.gains.exploreMelody ? this.gains.exploreMelody.gain : null;
    const percGain = this.gains.explorePercussion.gain;
    const harpGain = this.gains.idleHarp.gain;

    if (melodyGain) {
      melodyGain.cancelScheduledValues(now);
      melodyGain.setValueAtTime(melodyGain.value, now);
    }
    percGain.cancelScheduledValues(now);
    percGain.setValueAtTime(percGain.value, now);
    harpGain.cancelScheduledValues(now);
    harpGain.setValueAtTime(harpGain.value, now);

    if (target === 'IDLE') {
      // Link stands still: lead brass/woodwinds soften to silence, harp swells, percussion softens
      if (melodyGain) melodyGain.linearRampToValueAtTime(0.0, now + fadeTime);
      percGain.linearRampToValueAtTime(0.20, now + fadeTime);
      harpGain.linearRampToValueAtTime(1.0, now + fadeTime);
    } else if (target === 'QUIET') {
      // Night / Rest mode
      if (melodyGain) melodyGain.linearRampToValueAtTime(0.50, now + fadeTime);
      percGain.linearRampToValueAtTime(0.0, now + fadeTime);
      harpGain.linearRampToValueAtTime(1.0, now + fadeTime);
    } else {
      // RUNNING / EXPLORATION: Link moves, lead melody soars, percussion drives
      if (melodyGain) melodyGain.linearRampToValueAtTime(1.0, now + fadeTime);
      percGain.linearRampToValueAtTime(1.0, now + fadeTime);
      harpGain.linearRampToValueAtTime(0.0, now + fadeTime);
    }
  }

  setLinkMovement(state) {
    if (state !== 'RUNNING' && state !== 'IDLE') return;
    this.linkMovementState = state;
    if (this.currentState === 'EXPLORATION') {
      this.executeMovementCrossfade(state);
      if (state === 'IDLE') {
        this.playPrairieWind(Tone.now() + 0.15);
      }
    }
  }

  toggleLinkMovement() {
    const next = (this.linkMovementState === 'RUNNING') ? 'IDLE' : 'RUNNING';
    this.setLinkMovement(next);
    return next;
  }

  /**
   * Dynamic sequence branching evaluation running at every 8-bar block downbeat marker
   */
  handleDeferredTransitions(timelineTime) {
    const fadeTime = 0.15; // 150ms crossfade rate over downbeat

    if (this.pendingStateChange) {
      if (this.pendingStateChange === 'BATTLE') {
        // Mute exploration layer nodes on downbeat
        if (this.gains.exploreMelody) {
          this.gains.exploreMelody.gain.setValueAtTime(this.gains.exploreMelody.gain.value, timelineTime);
          this.gains.exploreMelody.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
        }
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

          const isIdle = (this.linkMovementState === 'IDLE');
          if (this.gains.exploreMelody) {
            this.gains.exploreMelody.gain.setValueAtTime(this.gains.exploreMelody.gain.value, timelineTime);
            this.gains.exploreMelody.gain.linearRampToValueAtTime(isIdle ? 0 : 1, timelineTime + fadeTime);
          }
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(isIdle ? 0.85 : 1, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(isIdle ? 0.20 : 1, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(isIdle ? 1 : 0, timelineTime + fadeTime);

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

          if (this.gains.exploreMelody) {
            this.gains.exploreMelody.gain.setValueAtTime(this.gains.exploreMelody.gain.value, timelineTime);
            this.gains.exploreMelody.gain.linearRampToValueAtTime(0.50, timelineTime + fadeTime);
          }
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
          if (this.gains.exploreMelody) {
            this.gains.exploreMelody.gain.setValueAtTime(this.gains.exploreMelody.gain.value, timelineTime);
            this.gains.exploreMelody.gain.linearRampToValueAtTime(0.50, timelineTime + fadeTime);
          }
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(0.8, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(0, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(1, timelineTime + fadeTime);
          this.playTowerBell(timelineTime + 0.1);
          this.playWolfosHowl(timelineTime + 2.2);
          this.currentState = 'QUIET';
        } else {
          const isIdle = (this.linkMovementState === 'IDLE');
          if (this.gains.exploreMelody) {
            this.gains.exploreMelody.gain.setValueAtTime(this.gains.exploreMelody.gain.value, timelineTime);
            this.gains.exploreMelody.gain.linearRampToValueAtTime(isIdle ? 0 : 1, timelineTime + fadeTime);
          }
          this.gains.exploreCore.gain.setValueAtTime(this.gains.exploreCore.gain.value, timelineTime);
          this.gains.exploreCore.gain.linearRampToValueAtTime(isIdle ? 0.85 : 1, timelineTime + fadeTime);
          this.gains.explorePercussion.gain.setValueAtTime(this.gains.explorePercussion.gain.value, timelineTime);
          this.gains.explorePercussion.gain.linearRampToValueAtTime(isIdle ? 0.20 : 1, timelineTime + fadeTime);
          this.gains.idleHarp.gain.setValueAtTime(this.gains.idleHarp.gain.value, timelineTime);
          this.gains.idleHarp.gain.linearRampToValueAtTime(isIdle ? 1 : 0, timelineTime + fadeTime);
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
        return (this.postBattleState === 'QUIET') ? this.quietBag.next() : blockMap.EXPLORATION[6]; // Day 7 Triumphant Return Flourish
      }
      return blockMap.BATTLE_OUTRO;
    }
    if (targetState === 'BATTLE') {
      return this.battleBag.next();
    }


    // Manual Mode Fallback
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

  clearPhraseEvents(phraseIdx, minTime = 0) {
    if (!this.phraseEventIds[phraseIdx]) return;
    const transport = Tone.getTransport();
    if (minTime <= 0) {
      this.phraseEventIds[phraseIdx].forEach(ev => {
        try {
          const id = (typeof ev === 'object' && ev !== null) ? ev.id : ev;
          transport.clear(id);
        } catch (e) {}
      });
      delete this.phraseEventIds[phraseIdx];
    } else {
      const kept = [];
      this.phraseEventIds[phraseIdx].forEach(ev => {
        const id = (typeof ev === 'object' && ev !== null) ? ev.id : ev;
        const time = (typeof ev === 'object' && ev !== null) ? ev.time : 0;
        if (time >= minTime) {
          try { transport.clear(id); } catch (e) {}
        } else {
          kept.push(ev);
        }
      });
      this.phraseEventIds[phraseIdx] = kept;
    }
  }

  /**
   * Returns exact duration in seconds for an 8-measure musical block.
   * Preserves authentic rubato tempo changes for Morning intro (16.867s)
   * while maintaining strict 12.8s segments (150 BPM) for all subsequent cues.
   */
  getBlockDuration(block) {
    if (!block) return this.BLOCK_DURATION_SEC;
    const ticksPerBar = 4 * this.PPQ;
    const startTicks = block.startBar * ticksPerBar;
    const endTicks = block.endBar * ticksPerBar;
    const startTimeSec = this.ticksToTime(startTicks);
    const endTimeSec = this.ticksToTime(endTicks);
    return Math.max(0.1, endTimeSec - startTimeSec);
  }

  addBlockToHistory(block, startTransportSec, durationSec) {
    if (!block) return;
    if (!this.blockHistory) this.blockHistory = [];
    // Remove any overlapping future blocks starting at or after this startTransportSec
    this.blockHistory = this.blockHistory.filter(b => b.startTransportSec < startTransportSec - 0.05);
    this.blockHistory.push({ block, startTransportSec, durationSec });
    // Keep history bounded to 25 blocks to prevent memory accumulation
    if (this.blockHistory.length > 25) {
      this.blockHistory = this.blockHistory.slice(-25);
    }
  }

  /**
   * Generates mathematically exact measure downbeats and 8-bar boundaries for the visible viewport,
   * calculated directly at runtime from active MIDI tick timing and scheduled block start times.
   */
  getMeasureLines(viewportStartSec, viewportEndSec) {
    const lines = [];
    const ticksPerBar = 4 * this.PPQ;

    const activeBlocks = (this.blockHistory && this.blockHistory.length > 0)
      ? this.blockHistory
      : [
          { block: blockMap.MORNING, startTransportSec: 0, durationSec: this.getBlockDuration(blockMap.MORNING) },
          { block: blockMap.INTRO, startTransportSec: this.getBlockDuration(blockMap.MORNING), durationSec: 12.8 }
        ];

    let maxScheduledEndSec = 0;

    activeBlocks.forEach((item) => {
      const { block, startTransportSec, durationSec } = item;
      const blockEndSec = startTransportSec + durationSec;
      if (blockEndSec > maxScheduledEndSec) {
        maxScheduledEndSec = blockEndSec;
      }

      if (blockEndSec < viewportStartSec - 1.0 || startTransportSec > viewportEndSec + 1.0) {
        return;
      }

      if (!block) return;
      const totalBars = Math.max(1, block.endBar - block.startBar);
      const blockStartMidiSec = this.ticksToTime(block.startBar * ticksPerBar);

      for (let b = 0; b <= totalBars; b++) {
        const barTicks = (block.startBar + b) * ticksPerBar;
        const barMidiSec = this.ticksToTime(barTicks);
        const barRelSec = barMidiSec - blockStartMidiSec;
        const barAbsSec = startTransportSec + barRelSec;

        if (barAbsSec >= viewportStartSec - 0.5 && barAbsSec <= viewportEndSec + 1.5) {
          lines.push({
            transportTime: barAbsSec,
            is8BarBoundary: (b === 0 || b === totalBars),
            barNumber: b
          });
        }
      }
    });

    // If viewport extends beyond buffered scheduled blocks, extrapolate standard 1.6s bars (150 BPM)
    if (maxScheduledEndSec < viewportEndSec + 1.5) {
      let t = maxScheduledEndSec > 0 ? maxScheduledEndSec : 0;
      let barCounter = 0;
      while (t <= viewportEndSec + 2.0) {
        t += 1.6;
        barCounter++;
        if (t >= viewportStartSec - 0.5) {
          lines.push({
            transportTime: t,
            is8BarBoundary: (barCounter % 8 === 0),
            barNumber: barCounter % 8
          });
        }
      }
    }

    lines.sort((a, b) => a.transportTime - b.transportTime);

    // Deduplicate boundaries close to each other (e.g. adjacent block handoff within 35ms)
    const deduped = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i];
      if (deduped.length === 0) {
        deduped.push(cur);
      } else {
        const prev = deduped[deduped.length - 1];
        if (Math.abs(cur.transportTime - prev.transportTime) < 0.035) {
          if (cur.is8BarBoundary) prev.is8BarBoundary = true;
        } else {
          deduped.push(cur);
        }
      }
    }

    return deduped;
  }

  /**
   * Schedule all MIDI notes in an 8-measure block onto Tone.Transport timeline.
   * Strictly adheres to all parameters in hyrule_field_midi.json:
   * exact pitches (note.name, note.midi), exact durations (note.duration),
   * exact velocities (note.velocity), exact relative timing (note.time - blockStartMidiSec),
   * and CC#7 / CC#11 curves.
   */
  scheduleNotesForBlock(chosenBlock, phraseIdx, startTransportSec) {
    if (!chosenBlock || !this.midiData || !this.midiData.tracks) return;

    const ticksPerBar = 4 * this.PPQ;
    const startTicks = chosenBlock.startBar * ticksPerBar;
    const endTicks = chosenBlock.endBar * ticksPerBar;
    const blockStartMidiSec = this.ticksToTime(startTicks);
    const blockEndMidiSec = this.ticksToTime(endTicks);
    const blockDurationSec = Math.max(0.1, blockEndMidiSec - blockStartMidiSec);

    const eventIds = [];
    const transport = Tone.getTransport();

    // -------------------------------------------------------------------------
    // 1. Parse & Inject MIDI JSON CC#7 (Volume), CC#11 (Expression), CC#91 (Reverb) & CC#93 (Chorus) per Channel (0–15)
    // -------------------------------------------------------------------------
    const defaultReverbSends = {
      0: 0.47,  // Trombone (hall)
      1: 0.47,  // Trumpet (hall)
      2: 0.45,  // Brass Section (hall)
      3: 0.39,  // String Ensemble 1 (ambient strings)
      4: 0.35,  // Tenor Sax (reeds)
      5: 0.50,  // Flute (woodwind resonance)
      6: 0.79,  // Harp (spacious Sheik's harp)
      7: 0.35,  // Accordion (pastoral)
      8: 0.00,  // Bass (tight & dry)
      9: 0.00,  // Standard Drum Kit (punchy & dry)
      10: 0.30, // Marimba
      11: 0.71, // Ocarina (ethereal open plains echo)
      12: 0.45, // Vibraphone
      13: 0.39, // String Ensemble 2
      14: 0.20, // Timpani (subtle room)
      15: 0.00  // Contrabass (dry low end)
    };

    const defaultChorusSends = {
      0: 0.28,  // Trombone (subtle ensemble width 24-31%)
      1: 0.00,  // Trumpet (focused center)
      2: 0.00,  // Brass Section
      3: 0.24,  // String Ensemble 1 (authentic 24% N64 stereo ensemble spread)
      4: 0.00,  // Tenor Sax
      5: 0.00,  // Flute (pure center woodwind)
      6: 0.00,  // Harp
      7: 0.00,  // Accordion
      8: 0.00,  // Bass (dry & centered)
      9: 0.00,  // Standard Drum Kit (punchy & dry)
      10: 0.00, // Marimba
      11: 0.63, // Ocarina (ethereal 63% wide stereo chorus)
      12: 0.00, // Vibraphone
      13: 0.24, // String Ensemble 2 (matches Strings 1 for stereo section width)
      14: 0.00, // Timpani
      15: 0.00  // Contrabass (dry low end)
    };

    for (let ch = 0; ch <= 15; ch++) {
      const channelGain = this.channelGains ? this.channelGains[ch] : null;
      const reverbSend = this.channelReverbSends ? this.channelReverbSends[ch] : null;
      const chorusSend = this.channelChorusSends ? this.channelChorusSends[ch] : null;
      if (!channelGain || !reverbSend) continue;

      const chTracks = this.midiData.tracks.filter(t => t.channel === ch);
      if (chTracks.length === 0) continue;

      // Extract CC#7 base volume (normalized 0.0 to 1.0)
      let baseCc7 = 1.0;
      let foundCc7 = false;
      let targetCc91 = (typeof defaultReverbSends[ch] === 'number') ? defaultReverbSends[ch] : 0.40;
      let targetCc93 = (typeof defaultChorusSends[ch] === 'number') ? defaultChorusSends[ch] : 0.00;

      chTracks.forEach(t => {
        if (t.controlChanges) {
          if (!foundCc7 && t.controlChanges['7'] && t.controlChanges['7'].length > 0) {
            const raw7 = t.controlChanges['7'][0].value;
            baseCc7 = (raw7 > 1) ? (raw7 / 127) : raw7;
            foundCc7 = true;
          }
          if (t.controlChanges['91'] && t.controlChanges['91'].length > 0) {
            const raw91 = t.controlChanges['91'][0].value;
            targetCc91 = (raw91 > 1) ? (raw91 / 127) : raw91;
          }
          if (t.controlChanges['93'] && t.controlChanges['93'].length > 0) {
            const raw93 = t.controlChanges['93'][0].value;
            targetCc93 = (raw93 > 1) ? (raw93 / 127) : raw93;
          }
        }
      });

      // Schedule CC#91 Reverb Send for this channel at block start
      const evReverb = transport.scheduleOnce((time) => {
        reverbSend.gain.setValueAtTime(targetCc91, time);
      }, startTransportSec);
      eventIds.push({ id: evReverb, time: startTransportSec });

      // Schedule CC#93 Chorus Send for this channel at block start
      if (chorusSend) {
        const evChorus = transport.scheduleOnce((time) => {
          chorusSend.gain.setValueAtTime(targetCc93, time);
        }, startTransportSec);
        eventIds.push({ id: evChorus, time: startTransportSec });
      }

      // Collect all CC#93 Chorus events on this channel within this 8-bar block if dynamic curve points exist
      const blockCc93 = [];
      chTracks.forEach(t => {
        if (t.controlChanges && t.controlChanges['93']) {
          t.controlChanges['93'].forEach(e => {
            if (e.ticks >= startTicks && e.ticks < endTicks) {
              blockCc93.push(e);
            }
          });
        }
      });
      blockCc93.sort((a, b) => a.ticks - b.ticks);
      if (blockCc93.length > 0 && chorusSend) {
        blockCc93.forEach(ccEvent => {
          const ccRelSec = Math.max(0, ccEvent.time - blockStartMidiSec);
          const ccTransportTime = startTransportSec + ccRelSec;
          const raw93 = ccEvent.value;
          const chorusVal = (raw93 > 1) ? (raw93 / 127) : raw93;
          const evId = transport.scheduleOnce((time) => {
            chorusSend.gain.setValueAtTime(chorusVal, time);
          }, ccTransportTime);
          eventIds.push({ id: evId, time: ccTransportTime });
        });
      }

      // Schedule N64 Orchestral Stereo Stage Panner & CC#10 Pan for this channel at block start
      const channelPanner = this.channelPanners ? this.channelPanners[ch] : null;
      let targetPan = (typeof N64_ORCHESTRAL_PANS[ch] === 'number') ? N64_ORCHESTRAL_PANS[ch] : 0.0;
      targetPan *= (this.stereoWidth ?? 1.0);

      chTracks.forEach(t => {
        if (t.controlChanges && t.controlChanges['10'] && t.controlChanges['10'].length > 0) {
          const raw10 = t.controlChanges['10'][0].value;
          targetPan = Math.max(-1.0, Math.min(1.0, ((raw10 - 64) / 64) * (this.stereoWidth ?? 1.0)));
        }
      });

      if (channelPanner) {
        const evPan = transport.scheduleOnce((time) => {
          channelPanner.pan.setValueAtTime(targetPan, time);
        }, startTransportSec);
        eventIds.push({ id: evPan, time: startTransportSec });
      }

      // Collect all dynamic CC#10 Pan events on this channel within this 8-bar block if present
      const blockCc10 = [];
      chTracks.forEach(t => {
        if (t.controlChanges && t.controlChanges['10']) {
          t.controlChanges['10'].forEach(e => {
            if (e.ticks >= startTicks && e.ticks < endTicks) {
              blockCc10.push(e);
            }
          });
        }
      });
      blockCc10.sort((a, b) => a.ticks - b.ticks);
      if (blockCc10.length > 0 && channelPanner) {
        blockCc10.forEach(ccEvent => {
          const ccRelSec = Math.max(0, ccEvent.time - blockStartMidiSec);
          const ccTransportTime = startTransportSec + ccRelSec;
          const raw10 = ccEvent.value;
          const panVal = Math.max(-1.0, Math.min(1.0, ((raw10 - 64) / 64) * (this.stereoWidth ?? 1.0)));
          const evId = transport.scheduleOnce((time) => {
            channelPanner.pan.setValueAtTime(panVal, time);
          }, ccTransportTime);
          eventIds.push({ id: evId, time: ccTransportTime });
        });
      }

      // Collect all CC#11 Expression events on this channel within this 8-bar block
      const blockCc11 = [];
      chTracks.forEach(t => {
        if (t.controlChanges && t.controlChanges['11']) {
          t.controlChanges['11'].forEach(e => {
            if (e.ticks >= startTicks && e.ticks < endTicks) {
              blockCc11.push(e);
            }
          });
        }
      });

      blockCc11.sort((a, b) => a.ticks - b.ticks);

      if (blockCc11.length > 0) {
        const firstCcRelSec = Math.max(0, blockCc11[0].time - blockStartMidiSec);
        if (firstCcRelSec > 0.02) {
          const firstRaw = blockCc11[0].value;
          const firstVal = (firstRaw > 1) ? (firstRaw / 127) : firstRaw;
          const initGain = baseCc7 * firstVal;
          const evId = transport.scheduleOnce((time) => {
            channelGain.gain.setValueAtTime(initGain, time);
          }, startTransportSec);
          eventIds.push({ id: evId, time: startTransportSec });
        }

        blockCc11.forEach(ccEvent => {
          const ccRelSec = Math.max(0, ccEvent.time - blockStartMidiSec);
          const ccTransportTime = startTransportSec + ccRelSec;
          const raw11 = ccEvent.value;
          const exprVal = (raw11 > 1) ? (raw11 / 127) : raw11;
          const targetGain = baseCc7 * exprVal;

          const evId = transport.scheduleOnce((time) => {
            channelGain.gain.setValueAtTime(targetGain, time);
          }, ccTransportTime);
          eventIds.push({ id: evId, time: ccTransportTime });
        });
      } else {
        // Reset gain to baseline CC#7 volume at block boundary
        const evId = transport.scheduleOnce((time) => {
          channelGain.gain.setValueAtTime(baseCc7, time);
        }, startTransportSec);
        eventIds.push({ id: evId, time: startTransportSec });
      }
    }

    // -------------------------------------------------------------------------
    // 2. Schedule Note Events strictly adhering to MIDI parameters
    // -------------------------------------------------------------------------
    this.midiData.tracks.forEach((track, trIdx) => {
      const trackCategory = this.getTrackCategory(track, trIdx);
      const sampler = this.getSamplerForTrack(trIdx);

      const notesInBlock = track.notes.filter(note =>
        note.ticks >= startTicks && note.ticks < endTicks
      );

      notesInBlock.forEach((note) => {
        // Strict adherence to note.time and note.duration from hyrule_field_midi.json
        const noteRelSec = Math.max(0, note.time - blockStartMidiSec);
        const noteTransportTime = startTransportSec + noteRelSec;
        const noteDurationSec = (typeof note.duration === 'number' && note.duration > 0)
          ? note.duration
          : Math.max(0.04, (note.durationTicks / (endTicks - startTicks)) * blockDurationSec);

        // Strict adherence to note.name, note.midi, note.velocity (zero transpositions/alterations)
        const eventId = transport.scheduleOnce((time) => {
          this.triggerSafeNote(sampler, note, noteDurationSec, time);
        }, noteTransportTime);

        eventIds.push({ id: eventId, time: noteTransportTime });

        // Add note to visualizer stream
        this.streamNotes.push({
          name: note.name,
          midi: note.midi,
          velocity: note.velocity,
          transportTime: noteTransportTime,
          duration: Math.max(0.08, noteDurationSec),
          trackType: trackCategory,
          mode: chosenBlock.mode,
          cueId: chosenBlock.id,
          phraseIdx: phraseIdx
        });
      });
    });

    this.phraseEventIds[phraseIdx] = eventIds;
  }

  /**
   * Re-queues the upcoming phrase when user changes game mode mid-phrase
   */
  requeueUpcomingPhrase(forcedTargetState = null) {
    const upcomingPhraseIdx = this.phraseIndex + 1;
    const upcomingStartTransportSec = (typeof this.upcomingBlockStartSec === 'number' && this.upcomingBlockStartSec > 0)
      ? this.upcomingBlockStartSec
      : (this.currentBlockStartTransportSec + this.currentBlockDurationSec);

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

    // 5. Synchronize blockHistory for runtime measure lines
    this.addBlockToHistory(newBlock, upcomingStartTransportSec, this.getBlockDuration(newBlock));
  }

  /**
   * Master 8-bar phrase downbeat clock: dynamically tracks the active block's completion
   * and phase-locks precisely to measure boundaries.
   */
  onPhraseBoundary(timelineTime) {
    const audioTime = timelineTime || Tone.now();

    // 1. Process deferred transitions on downbeat
    this.handleDeferredTransitions(audioTime);

    // 2. The pre-queued upcoming block now becomes the active block
    this.phraseIndex++;
    this.currentBlock = this.upcomingBlock;
    const startTransportSec = (typeof this.upcomingBlockStartSec === 'number' && this.upcomingBlockStartSec > 0)
      ? this.upcomingBlockStartSec
      : (this.currentBlockStartTransportSec + this.currentBlockDurationSec);

    const blockDurSec = this.getBlockDuration(this.currentBlock);

    this.currentBlockStartTransportSec = startTransportSec;
    this.currentBlockDurationSec = blockDurSec;
    currentBlockStartTransportSec = startTransportSec;
    currentBlockDurationSec = blockDurSec;

    // Immediately advance state so lookahead pre-queuing selects the next sequence
    if (this.currentBlock === blockMap.BATTLE_INTRO) {
      this.currentState = 'BATTLE';
    } else if (this.currentBlock === blockMap.BATTLE_OUTRO) {
      this.currentState = this.postBattleState || 'EXPLORATION';
    }

    // 3. Pre-queue the NEXT upcoming block ahead of time (1 block lookahead)
    const nextPhraseIdx = this.phraseIndex + 1;
    const nextStartTransportSec = startTransportSec + blockDurSec;
    this.upcomingBlockStartSec = nextStartTransportSec;

    let nextBlock = null;

    if (this.randomizerEnabled) {
      if (this.currentBlock === blockMap.MORNING) {
        // Phrase 0 -> Phrase 1 (Heroic Intro Fanfare)
        nextBlock = blockMap.INTRO;
      } else if (this.currentBlock === blockMap.INTRO) {
        // Phrase 1 -> Phrase 2 (Day 1 Main Theme)
        nextBlock = blockMap.EXPLORATION[0];
        this.currentState = 'EXPLORATION';
        this.currentModeBlocksRemaining = 1;
      } else if (this.currentBlock === blockMap.BATTLE_INTRO) {
        // Just entered battle -> queue battle skirmish
        this.currentState = 'BATTLE';
        nextBlock = this.battleBag.next();
      } else if (this.currentState === 'BATTLE' && this.currentBlock !== blockMap.BATTLE_OUTRO) {
        // Combat skirmish completed -> queue victory fanfare
        nextBlock = blockMap.BATTLE_OUTRO;
        this.postBattleState = (Math.random() < 0.5) ? 'EXPLORATION' : 'QUIET';
      } else if (this.currentBlock === blockMap.BATTLE_OUTRO) {
        // Victory fanfare completed -> resolve into postBattleState (Adventure or Rest)
        const target = this.postBattleState || 'EXPLORATION';
        this.postBattleState = null;
        this.currentState = target;
        this.currentModeBlocksRemaining = (Math.random() < 0.5 ? 1 : 2);
        nextBlock = (target === 'QUIET') ? this.quietBag.next() : this.explorationBag.next();
      } else {
        // Active in EXPLORATION (Adventure) or QUIET (Rest)
        this.currentModeBlocksRemaining--;
        if (this.currentModeBlocksRemaining > 0) {
          nextBlock = (this.currentState === 'QUIET') ? this.quietBag.next() : this.explorationBag.next();
        } else {
          // Mode phrase complete: randomly cycle to one of the other modes!
          const candidateModes = (this.currentState === 'EXPLORATION')
            ? ['QUIET', 'BATTLE']
            : ['EXPLORATION', 'BATTLE'];
          const chosenMode = candidateModes[Math.floor(Math.random() * candidateModes.length)];

          if (chosenMode === 'BATTLE') {
            nextBlock = blockMap.BATTLE_INTRO;
            this.pendingStateChange = 'BATTLE';
          } else if (chosenMode === 'QUIET') {
            this.currentState = 'QUIET';
            this.pendingStateChange = 'QUIET';
            this.currentModeBlocksRemaining = (Math.random() < 0.5 ? 1 : 2);
            nextBlock = this.quietBag.next();
          } else {
            this.currentState = 'EXPLORATION';
            this.pendingStateChange = 'EXPLORATION';
            this.currentModeBlocksRemaining = (Math.random() < 0.5 ? 1 : 2);
            nextBlock = this.explorationBag.next();
          }
        }
      }
    } else {
      // Manual mode: continue selected mode endlessly
      nextBlock = this.selectBlockForState(this.currentState);
    }

    this.upcomingBlock = nextBlock;
    this.scheduleNotesForBlock(nextBlock, nextPhraseIdx, nextStartTransportSec);
    this.addBlockToHistory(nextBlock, nextStartTransportSec, this.getBlockDuration(nextBlock));

    // Schedule next phrase boundary event on Tone.Transport
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

      // Reset shuffle bags & randomizer state
      this.explorationBag.reset();
      this.battleBag.reset();
      this.quietBag.reset();
      this.currentModeBlocksRemaining = 1;

      // Startup Sequence:
      // Phrase 0: Morning Sunrise cue (Bars 1–9) with authentic rubato tempo variations (16.867s)
      const block0 = blockMap.MORNING;
      const dur0 = this.getBlockDuration(block0);
      this.currentBlock = block0;
      this.currentBlockStartTransportSec = 0;
      this.currentBlockDurationSec = dur0;
      currentBlockStartTransportSec = 0;
      currentBlockDurationSec = dur0;
      this.scheduleNotesForBlock(block0, 0, 0);

      // Phrase 1: Heroic Intro Fanfare (Bars 9–17, 12.8s)
      const block1 = blockMap.INTRO;
      const dur1 = this.getBlockDuration(block1);
      this.upcomingBlock = block1;
      this.upcomingBlockStartSec = dur0;
      this.scheduleNotesForBlock(block1, 1, dur0);

      // Synchronize block history for accurate runtime measure lines
      this.blockHistory = [
        { block: block0, startTransportSec: 0, durationSec: dur0 },
        { block: block1, startTransportSec: dur0, durationSec: dur1 }
      ];

      this.initialSequenceStage = 2; // Next will be Day 1

      // Master phrase downbeat clock: fires at exact conclusion of Morning
      this.boundaryEventId = transport.scheduleOnce((time) => {
        this.onPhraseBoundary(time);
      }, dur0);

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
    const now = Tone.now();
    for (let ch = 0; ch <= 15; ch++) {
      if (this.channelGains[ch]) {
        try {
          this.channelGains[ch].gain.cancelScheduledValues(now);
          this.channelGains[ch].gain.setValueAtTime(1.0, now);
        } catch (e) {}
      }
      if (this.channelReverbSends[ch]) {
        try {
          this.channelReverbSends[ch].gain.cancelScheduledValues(now);
        } catch (e) {}
      }
      if (this.channelChorusSends[ch]) {
        try {
          this.channelChorusSends[ch].gain.cancelScheduledValues(now);
        } catch (e) {}
      }
      if (this.channelPanners[ch]) {
        try {
          this.channelPanners[ch].pan.cancelScheduledValues(now);
          this.channelPanners[ch].pan.setValueAtTime((N64_ORCHESTRAL_PANS[ch] ?? 0.0) * (this.stereoWidth ?? 1.0), now);
        } catch (e) {}
      }
    }
  }

  // --- Real-time Interactive Mixer Controls ---

  setMasterVolume(valDb) {
    if (this.masterVolume) {
      this.masterVolume.volume.value = Math.max(-36, Math.min(6, valDb));
    }
  }

  setMasterWarmth(cutoffHz) {
    if (this.n64Filter) {
      this.n64Filter.frequency.value = Math.max(4000, Math.min(20000, cutoffHz));
    }
  }

  setMasterTreble(trebleDb) {
    if (this.masterEQ) {
      this.masterEQ.high.value = Math.max(-14, Math.min(6, trebleDb));
    }
  }

  setMasterReverbWet(wetRatio) {
    if (this.reverbReturnGain) {
      this.reverbReturnGain.gain.value = Math.max(0, Math.min(1.5, wetRatio * 1.1));
    }
  }

  setMasterChorusWet(wetRatio) {
    if (this.chorusReturnGain) {
      this.chorusReturnGain.gain.value = Math.max(0, Math.min(1.5, wetRatio * 1.1));
    }
  }

  setStereoWidth(widthRatio) {
    this.stereoWidth = Math.max(0.0, Math.min(1.5, widthRatio));
    const now = Tone.now();
    for (let ch = 0; ch <= 15; ch++) {
      if (this.channelPanners && this.channelPanners[ch]) {
        const basePan = N64_ORCHESTRAL_PANS[ch] ?? 0.0;
        try {
          this.channelPanners[ch].pan.setValueAtTime(basePan * this.stereoWidth, now);
        } catch (e) {}
      }
    }
  }

  setMixerPreset(presetName) {
    switch (presetName) {
      case 'n64': // Authentic N64 RSP Warmth (Default & Recommended)
        this.setMasterWarmth(13500);
        this.setMasterTreble(0.0);
        this.setMasterReverbWet(0.60);
        this.setMasterChorusWet(0.55);
        this.setStereoWidth(1.0);
        this.setMasterVolume(-2.0);
        if (this.masterEQ) {
          this.masterEQ.low.value = 0.5;
          this.masterEQ.mid.value = 0.0;
        }
        break;
      case 'hall': // Concert Hall
        this.setMasterWarmth(15000);
        this.setMasterTreble(1.5);
        this.setMasterReverbWet(0.85);
        this.setMasterChorusWet(0.40);
        this.setStereoWidth(1.25);
        this.setMasterVolume(-2.5);
        if (this.masterEQ) {
          this.masterEQ.low.value = 1.0;
          this.masterEQ.mid.value = -0.5;
        }
        break;
      case 'retro': // Vintage CRT / TV Speaker Warmth
        this.setMasterWarmth(9500);
        this.setMasterTreble(-3.0);
        this.setMasterReverbWet(0.40);
        this.setMasterChorusWet(0.30);
        this.setStereoWidth(0.65);
        this.setMasterVolume(-2.0);
        if (this.masterEQ) {
          this.masterEQ.low.value = 1.5;
          this.masterEQ.mid.value = 0.5;
        }
        break;
      case 'bright': // Modern Clean Direct Out
        this.setMasterWarmth(20000);
        this.setMasterTreble(2.0);
        this.setMasterReverbWet(0.50);
        this.setMasterChorusWet(0.65);
        this.setStereoWidth(1.10);
        this.setMasterVolume(-2.5);
        if (this.masterEQ) {
          this.masterEQ.low.value = 0.0;
          this.masterEQ.mid.value = 0.0;
        }
        break;
    }
  }

  getMixerSettings() {
    return {
      volume: this.masterVolume ? this.masterVolume.volume.value : -2.0,
      warmth: this.n64Filter ? this.n64Filter.frequency.value : 13500,
      treble: this.masterEQ ? this.masterEQ.high.value : 0.0,
      reverbWet: this.reverbReturnGain ? Math.min(1.0, this.reverbReturnGain.gain.value / 1.1) : 0.60,
      chorusWet: this.chorusReturnGain ? Math.min(1.0, this.chorusReturnGain.gain.value / 1.1) : 0.55,
      stereoWidth: (typeof this.stereoWidth === 'number') ? this.stereoWidth : 1.0
    };
  }

  // --- Solo Woodwind Vibrato Control ---
  setVibratoDepth(depth = 0.14) {
    if (this.channelVibratos) {
      if (this.channelVibratos[5]) this.channelVibratos[5].depth.value = depth;
      if (this.channelVibratos[11]) this.channelVibratos[11].depth.value = depth;
    }
  }

  // --- Atmospheric Environmental Sound Effects ---
  playSfx(sfxName, duration = 2.5, time, velocity = 0.85) {
    if (!this.soundRack || !this.soundRack.samplers) return;
    const sampler = this.soundRack.samplers[sfxName];
    if (!sampler) return;
    const playTime = (time !== undefined) ? time : Tone.now();
    const noteMap = {
      wolfosHowl: 'C5',
      towerBell: 'F#4',
      dangerSting: 'F#4',
      prairieWind: 'F#4'
    };
    const note = noteMap[sfxName] || 'C5';
    try {
      sampler.triggerAttackRelease(note, duration, playTime, velocity);
    } catch (e) {
      console.warn('SFX trigger error:', e);
    }
  }

  playDangerSting(time = Tone.now()) {
    this.playSfx('dangerSting', 1.8, time, 0.95);
  }

  playTowerBell(time = Tone.now()) {
    this.playSfx('towerBell', 2.8, time, 0.85);
  }

  playWolfosHowl(time = Tone.now()) {
    this.playSfx('wolfosHowl', 3.5, time, 0.80);
  }

  playPrairieWind(time = Tone.now()) {
    this.playSfx('prairieWind', 4.5, time, 0.65);
  }

  // --- Simple Mode Randomizer (Adventure, Rest, Battle) ---
  setRandomizer(enabled) {
    this.randomizerEnabled = Boolean(enabled);
    return this.randomizerEnabled;
  }

  toggleRandomizer() {
    this.randomizerEnabled = !this.randomizerEnabled;
    return this.randomizerEnabled;
  }

  isRandomizerEnabled() {
    return this.randomizerEnabled;
  }

  getRandomizerInfo() {
    return {
      enabled: this.randomizerEnabled,
      currentMode: this.currentState,
      upcomingMode: this.upcomingBlock ? this.upcomingBlock.mode : null
    };
  }

  // Compatibility aliases
  setAutoCycle(enabled) { return this.setRandomizer(enabled); }
  toggleAutoCycle() { return this.toggleRandomizer(); }
  isAutoCycleEnabled() { return this.isRandomizerEnabled(); }
  getTimeOfDayInfo() { return null; }
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
  const timeInBlock = Math.max(0, transportSec - blockStartSec);

  // Compute exact musical bar number in active block
  let currentBarInBlock = 1;
  let totalBarsInBlock = 8;
  if (currentBlock && sequencer.midiData && sequencer.midiData.header) {
    totalBarsInBlock = Math.max(1, currentBlock.endBar - currentBlock.startBar);
    const ticksPerBar = 4 * sequencer.PPQ;
    const startMidiSec = sequencer.ticksToTime(currentBlock.startBar * ticksPerBar);
    currentBarInBlock = totalBarsInBlock;
    for (let b = 1; b <= totalBarsInBlock; b++) {
      const barEndSec = sequencer.ticksToTime((currentBlock.startBar + b) * ticksPerBar) - startMidiSec;
      if (timeInBlock < barEndSec) {
        currentBarInBlock = b;
        break;
      }
    }
  }

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
    timeInBlock,
    currentBarInBlock,
    totalBarsInBlock,
    progressPercent: Math.min(100, Math.max(0, (timeInBlock / blockDurSec) * 100))
  };
}

export function getMeasureLines(viewportStartSec, viewportEndSec) {
  return sequencer.getMeasureLines(viewportStartSec, viewportEndSec);
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
  else if (param === 'chorus') sequencer.setMasterChorusWet(value);
  else if (param === 'stereoWidth') sequencer.setStereoWidth(value);
}

export function setStereoWidth(width) {
  if (sequencer) sequencer.setStereoWidth(width);
}

export function setMixerPreset(presetName) {
  if (!sequencer) return;
  sequencer.setMixerPreset(presetName);
}

export function getMixerSettings() {
  return sequencer ? sequencer.getMixerSettings() : null;
}

export function toggleLinkMovement() {
  return sequencer.toggleLinkMovement();
}

export function setLinkMovement(state) {
  sequencer.setLinkMovement(state);
}

export function getLinkMovementState() {
  return sequencer.linkMovementState;
}

export function playDangerSting(time) {
  sequencer.playDangerSting(time);
}

export function playTowerBell(time) {
  sequencer.playTowerBell(time);
}

export function playWolfosHowl(time) {
  sequencer.playWolfosHowl(time);
}

export function playPrairieWind(time) {
  sequencer.playPrairieWind(time);
}

export function playSfx(name, duration, time, velocity) {
  sequencer.playSfx(name, duration, time, velocity);
}

export function setVibratoDepth(depth) {
  sequencer.setVibratoDepth(depth);
}

export function setRandomizer(enabled) {
  return sequencer.setRandomizer(enabled);
}

export function toggleRandomizer() {
  return sequencer.toggleRandomizer();
}

export function isRandomizerEnabled() {
  return sequencer.isRandomizerEnabled();
}

export function getRandomizerInfo() {
  return sequencer.getRandomizerInfo();
}

export function setAutoCycle(enabled) {
  return sequencer.setRandomizer(enabled);
}

export function toggleAutoCycle() {
  return sequencer.toggleRandomizer();
}

export function isAutoCycleEnabled() {
  return sequencer.isRandomizerEnabled();
}

export function getTimeOfDayInfo() {
  return null;
}



