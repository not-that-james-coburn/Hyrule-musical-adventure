import * as Tone from 'tone';
import midiData from './hyrule_field_midi.json' with { type: 'json' };

// 1. Core State & Timing Configuration
const PPQ = midiData.header.ppq || 960;
const BARS_PER_BLOCK = 8;
const TICKS_PER_BLOCK = PPQ * 4 * BARS_PER_BLOCK; // 30,720 ticks per 8-bar block

let currentPlaybackState = 'EXPLORATION'; 
let nextPlaybackState = 'EXPLORATION';
let activeScheduledEvents = []; // Holds Tone.Transport event IDs for clean clearing
let currentExplorationBlockIndex = null;
let currentBattleBlockIndex = 1; // Start battle sequence at index 1 (Battle Block 2) on immediate override
let introHasPlayed = false;

// Track active block info for progress bar calculations
export let currentBlockDurationSec = 13.333;
export let currentBlockStartTimeSec = 0;

// 2. Block Roadmap Definitions (in measure units and tick ranges)
// Block 0: Intro (Bars 0–7, ticks 0..30720)
// Blocks 1–7: Exploration / Normal Pool (Bars 8–63)
// Blocks 8–13: Battle Pool (Bars 64–111)
// Blocks 18–21: Quiet / Night Pool (Bars 144–175)
const INTRO_BLOCK = { id: 0, startBar: 0, endBar: 8, startTicks: 0, endTicks: 30720, startTimeSec: 1.200, nextTimeSec: 15.067, durationSec: 13.867 };

const EXPLORATION_BLOCKS = [
  { id: 1, startBar: 8, endBar: 16, startTicks: 30720, endTicks: 61440, startTimeSec: 15.067, nextTimeSec: 29.267, durationSec: 14.200 },
  { id: 2, startBar: 16, endBar: 24, startTicks: 61440, endTicks: 92160, startTimeSec: 29.267, nextTimeSec: 42.067, durationSec: 12.800 },
  { id: 3, startBar: 24, endBar: 32, startTicks: 92160, endTicks: 122880, startTimeSec: 42.067, nextTimeSec: 54.867, durationSec: 12.800 },
  { id: 4, startBar: 32, endBar: 40, startTicks: 122880, endTicks: 153600, startTimeSec: 54.867, nextTimeSec: 67.667, durationSec: 12.800 },
  { id: 5, startBar: 40, endBar: 48, startTicks: 153600, endTicks: 184320, startTimeSec: 67.667, nextTimeSec: 80.467, durationSec: 12.800 },
  { id: 6, startBar: 48, endBar: 56, startTicks: 184320, endTicks: 215040, startTimeSec: 80.467, nextTimeSec: 93.267, durationSec: 12.800 },
  { id: 7, startBar: 56, endBar: 64, startTicks: 215040, endTicks: 245760, startTimeSec: 93.267, nextTimeSec: 106.067, durationSec: 12.800 }
];

const BATTLE_BLOCKS = [
  { id: 8, startBar: 64, endBar: 72, startTicks: 245760, endTicks: 276480, startTimeSec: 106.067, nextTimeSec: 118.867, durationSec: 12.800 },
  { id: 9, startBar: 72, endBar: 80, startTicks: 276480, endTicks: 307200, startTimeSec: 118.867, nextTimeSec: 131.667, durationSec: 12.800 },
  { id: 10, startBar: 80, endBar: 88, startTicks: 307200, endTicks: 337920, startTimeSec: 131.667, nextTimeSec: 144.467, durationSec: 12.800 },
  { id: 11, startBar: 88, endBar: 96, startTicks: 337920, endTicks: 368640, startTimeSec: 144.467, nextTimeSec: 157.267, durationSec: 12.800 },
  { id: 12, startBar: 96, endBar: 104, startTicks: 368640, endTicks: 399360, startTimeSec: 157.267, nextTimeSec: 170.067, durationSec: 12.800 },
  { id: 13, startBar: 104, endBar: 112, startTicks: 399360, endTicks: 430080, startTimeSec: 170.067, nextTimeSec: 182.867, durationSec: 12.800 }
];

// Truncated Block 22 (Bars 176–183) removed
const QUIET_BLOCKS = [
  { id: 18, startBar: 144, endBar: 152, startTicks: 552960, endTicks: 583680, startTimeSec: 234.867, nextTimeSec: 249.026, durationSec: 14.159 },
  { id: 19, startBar: 152, endBar: 160, startTicks: 583680, endTicks: 614400, startTimeSec: 249.026, nextTimeSec: 262.804, durationSec: 13.778 },
  { id: 20, startBar: 160, endBar: 168, startTicks: 614400, endTicks: 645120, startTimeSec: 262.804, nextTimeSec: 276.518, durationSec: 13.714 },
  { id: 21, startBar: 168, endBar: 176, startTicks: 645120, endTicks: 675840, startTimeSec: 276.518, nextTimeSec: 289.432, durationSec: 12.914 }
];

// 3. Audio Pipeline & N64 Multi-Instrument Synthesizers
const masterLimiter = new Tone.Limiter(-1).toDestination();
const masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterLimiter);

// Brass (Trombone, Trumpet, Brass Section)
const brassSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.3 }
}).connect(masterReverb);
brassSynth.volume.value = -8;

// Strings (String Ensembles, Cello, Violin)
const stringSynth = new Tone.PolySynth(Tone.AMSynth, {
  harmonicity: 1.5,
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 0.4 }
}).connect(masterReverb);
stringSynth.volume.value = -10;

// Woodwinds (Flute, Ocarina, Sax)
const windSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sine' },
  envelope: { attack: 0.05, decay: 0.1, sustain: 0.85, release: 0.3 }
}).connect(masterReverb);
windSynth.volume.value = -6;

// Plucked & Keyboard (Harp, Vibraphone, Marimba, Organ)
const harpSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.3 }
}).connect(masterReverb);
harpSynth.volume.value = -8;

// Bass (Electric Bass, Contrabass)
const bassSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.2 }
}).connect(masterReverb);
bassSynth.volume.value = -6;

// Percussion Synths (Drums, Timpani, Snare, Cymbals)
const kickSynth = new Tone.MembraneSynth({
  pitchDecay: 0.05,
  octaves: 4,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
}).connect(masterLimiter);
kickSynth.volume.value = -6;

const snareSynth = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.15, sustain: 0 }
}).connect(masterLimiter);
snareSynth.volume.value = -14;

const hihatSynth = new Tone.MetalSynth({
  frequency: 200,
  envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
  harmonicity: 5.1,
  modulationIndex: 32,
  resonance: 4000,
  octaves: 1.5
}).connect(masterLimiter);
hihatSynth.volume.value = -22;

const timpaniSynth = new Tone.MembraneSynth({
  pitchDecay: 0.08,
  octaves: 2,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.2 }
}).connect(masterReverb);
timpaniSynth.volume.value = -8;

function getSynthForTrack(trackIndex) {
  const tr = midiData.tracks[trackIndex];
  if (!tr) return brassSynth;

  const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();
  const channel = tr.channel;

  if (channel === 9) {
    return 'percussion';
  }

  if (instName.includes('trombone') || instName.includes('trumpet') || instName.includes('brass')) {
    return brassSynth;
  }
  if (instName.includes('string') || instName.includes('contrabass')) {
    return stringSynth;
  }
  if (instName.includes('flute') || instName.includes('ocarina') || instName.includes('sax')) {
    return windSynth;
  }
  if (instName.includes('harp') || instName.includes('vibraphone') || instName.includes('marimba') || instName.includes('organ') || instName.includes('piano')) {
    return harpSynth;
  }
  if (instName.includes('bass')) {
    return bassSynth;
  }
  if (instName.includes('timpani')) {
    return timpaniSynth;
  }

  return brassSynth;
}

// 4. Scheduling & Dynamic Conductor Engine
let nextScheduledBlockTimeSec = 0;
let conductorScheduleId = null;

function selectNextBlock(state) {
  if (state === 'EXPLORATION') {
    if (!introHasPlayed) {
      introHasPlayed = true;
      currentExplorationBlockIndex = 0;
      return INTRO_BLOCK;
    }
    let available = EXPLORATION_BLOCKS.filter(b => b.id !== currentExplorationBlockIndex);
    if (available.length === 0) available = EXPLORATION_BLOCKS;
    const chosen = available[Math.floor(Math.random() * available.length)];
    currentExplorationBlockIndex = chosen.id;
    return chosen;
  } else if (state === 'BATTLE') {
    const chosen = BATTLE_BLOCKS[currentBattleBlockIndex % BATTLE_BLOCKS.length];
    currentBattleBlockIndex++;
    return chosen;
  } else if (state === 'QUIET') {
    const chosen = QUIET_BLOCKS[Math.floor(Math.random() * QUIET_BLOCKS.length)];
    return chosen;
  }

  return INTRO_BLOCK;
}

function scheduleBlockChain(startTimeSec) {
  const transport = Tone.getTransport();

  // Resolve next state for this phrase
  currentPlaybackState = nextPlaybackState;
  const chosenBlock = selectNextBlock(currentPlaybackState);

  currentBlockStartTimeSec = startTimeSec;
  currentBlockDurationSec = chosenBlock.durationSec;

  // Queue notes using JSON exact relative note times for natural tempo variations
  midiData.tracks.forEach((track, trIdx) => {
    const synth = getSynthForTrack(trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= chosenBlock.startTicks && n.ticks < chosenBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      // Calculate relative time from block start using JSON time
      const relativeNoteTimeSec = note.time - chosenBlock.startTimeSec;
      const exactTimeSec = startTimeSec + relativeNoteTimeSec;
      const exactDurationSec = note.duration;

      const eventId = transport.schedule((scheduledTime) => {
        triggerNote(synth, note, exactDurationSec, scheduledTime);
      }, exactTimeSec);

      activeScheduledEvents.push(eventId);
    });
  });

  // Calculate the start time of the next block
  nextScheduledBlockTimeSec = startTimeSec + chosenBlock.durationSec;

  // Recursively schedule the subsequent block trigger at nextScheduledBlockTimeSec
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(scheduledTime);
  }, nextScheduledBlockTimeSec);
}

function triggerNote(synth, note, durationSec, time) {
  if (synth === 'percussion') {
    const midiPitch = note.midi;
    if (midiPitch === 35 || midiPitch === 36) {
      kickSynth.triggerAttackRelease('C1', durationSec, time, note.velocity);
    } else if (midiPitch === 38 || midiPitch === 40) {
      snareSynth.triggerAttackRelease(durationSec, time, note.velocity);
    } else if (midiPitch === 42 || midiPitch === 44) {
      hihatSynth.triggerAttackRelease(durationSec, time, note.velocity * 0.7);
    } else if (midiPitch === 47 || midiPitch === 48) {
      timpaniSynth.triggerAttackRelease('G1', durationSec, time, note.velocity);
    } else {
      snareSynth.triggerAttackRelease(durationSec, time, note.velocity * 0.5);
    }
  } else if (synth instanceof Tone.MembraneSynth) {
    synth.triggerAttackRelease(note.name, durationSec, time, note.velocity);
  } else {
    synth.triggerAttackRelease(note.name, durationSec, time, note.velocity);
  }
}

// 5. UI Trigger Functions
export function getCurrentPlaybackState() {
  return currentPlaybackState;
}

export async function changeGameMode(newMode) {
  const transport = Tone.getTransport();

  if (Tone.getContext().state !== 'running') {
    await Tone.start();
    console.log("AudioContext activated!");
    
    currentPlaybackState = newMode;
    nextPlaybackState = newMode;

    // Start chain from time 0
    scheduleBlockChain(0);
    transport.start();
    return;
  }

  console.log(`Mode change requested: ${newMode}. Current state: ${currentPlaybackState}`);

  if (newMode === 'BATTLE') {
    triggerImmediateBattleOverride();
  } else {
    nextPlaybackState = newMode;
  }
}

function triggerImmediateBattleOverride() {
  const transport = Tone.getTransport();

  // Clear upcoming note triggers and conductor schedule
  activeScheduledEvents.forEach(eventId => transport.clear(eventId));
  activeScheduledEvents = [];

  if (conductorScheduleId !== null) {
    transport.clear(conductorScheduleId);
  }

  currentPlaybackState = 'BATTLE';
  nextPlaybackState = 'BATTLE';

  // Align battle cue (Battle Block 2) smoothly to current playback offset
  const transportSeconds = transport.seconds;
  const currentOffsetInBlock = transportSeconds - currentBlockStartTimeSec;

  currentBattleBlockIndex = 1; // Index 1 is Battle Block 2 (Bars 72..80)
  const battleBlock = BATTLE_BLOCKS[1];

  currentBlockStartTimeSec = transportSeconds - currentOffsetInBlock;
  currentBlockDurationSec = battleBlock.durationSec;

  midiData.tracks.forEach((track, trIdx) => {
    const synth = getSynthForTrack(trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= battleBlock.startTicks && n.ticks < battleBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - battleBlock.startTimeSec;
      if (relativeNoteTimeSec >= currentOffsetInBlock) {
        const exactTimeSec = transportSeconds + (relativeNoteTimeSec - currentOffsetInBlock);
        const exactDurationSec = note.duration;

        const eventId = transport.schedule((scheduledTime) => {
          triggerNote(synth, note, exactDurationSec, scheduledTime);
        }, exactTimeSec);

        activeScheduledEvents.push(eventId);
      }
    });
  });

  // Next block start time
  nextScheduledBlockTimeSec = currentBlockStartTimeSec + battleBlock.durationSec;
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(scheduledTime);
  }, nextScheduledBlockTimeSec);
}
