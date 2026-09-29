import * as Tone from 'tone';
import midiData from './hyrule_field_midi.json' with { type: 'json' };

// 1. Core State & Timing Configuration
export const DEFAULT_BPM = 144;
const PPQ = midiData.header.ppq || 960;
const TICKS_PER_BEAT = PPQ;
const TICKS_PER_MEASURE = PPQ * 4; // 3840 ticks per measure in 4/4
const BARS_PER_BLOCK = 8;
const TICKS_PER_BLOCK = TICKS_PER_MEASURE * BARS_PER_BLOCK; // 30,720 ticks

let currentPlaybackState = 'EXPLORATION'; 
let nextPlaybackState = 'EXPLORATION';
let activeScheduledEvents = []; // Holds Tone.Transport event IDs for clean clearing
let currentExplorationBlockIndex = null;
let currentBattleBlockIndex = 0; // Sequential battle loop (blocks 8..13)
let introHasPlayed = false;

// 2. Block Roadmap Definitions (in measure units and tick ranges)
// Block 0: Intro (Bars 0–7)
// Blocks 1–7: Exploration / Normal Pool (Bars 8–63)
// Blocks 8–13: Battle Pool (Bars 64–111)
// Blocks 18–22: Quiet / Night Pool (Bars 144–183)
const INTRO_BLOCK = { id: 0, startBar: 0, endBar: 8, startTicks: 0, endTicks: 30720 };

const EXPLORATION_BLOCKS = [
  { id: 1, startBar: 8, endBar: 16, startTicks: 30720, endTicks: 61440 },
  { id: 2, startBar: 16, endBar: 24, startTicks: 61440, endTicks: 92160 },
  { id: 3, startBar: 24, endBar: 32, startTicks: 92160, endTicks: 122880 },
  { id: 4, startBar: 32, endBar: 40, startTicks: 122880, endTicks: 153600 },
  { id: 5, startBar: 40, endBar: 48, startTicks: 153600, endTicks: 184320 },
  { id: 6, startBar: 48, endBar: 56, startTicks: 184320, endTicks: 215040 },
  { id: 7, startBar: 56, endBar: 64, startTicks: 215040, endTicks: 245760 }
];

const BATTLE_BLOCKS = [
  { id: 8, startBar: 64, endBar: 72, startTicks: 245760, endTicks: 276480 },
  { id: 9, startBar: 72, endBar: 80, startTicks: 276480, endTicks: 307200 },
  { id: 10, startBar: 80, endBar: 88, startTicks: 307200, endTicks: 337920 },
  { id: 11, startBar: 88, endBar: 96, startTicks: 337920, endTicks: 368640 },
  { id: 12, startBar: 96, endBar: 104, startTicks: 368640, endTicks: 399360 },
  { id: 13, startBar: 104, endBar: 112, startTicks: 399360, endTicks: 430080 }
];

const QUIET_BLOCKS = [
  { id: 18, startBar: 144, endBar: 152, startTicks: 552960, endTicks: 583680 },
  { id: 19, startBar: 152, endBar: 160, startTicks: 583680, endTicks: 614400 },
  { id: 20, startBar: 160, endBar: 168, startTicks: 614400, endTicks: 645120 },
  { id: 21, startBar: 168, endBar: 176, startTicks: 645120, endTicks: 675840 },
  { id: 22, startBar: 176, endBar: 184, startTicks: 675840, endTicks: 706560 }
];

// 3. Audio Pipeline & N64 Multi-Instrument Synthesizers
const masterLimiter = new Tone.Limiter(-1).toDestination();
const masterReverb = new Tone.Reverb({ decay: 1.8, wet: 0.15 }).connect(masterLimiter);

// Brass (Trombone, Trumpet, Brass Section)
const brassSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.04, decay: 0.2, sustain: 0.7, release: 0.15 }
}).connect(masterReverb);
brassSynth.volume.value = -8;

// Strings (String Ensembles, Cello, Violin)
const stringSynth = new Tone.PolySynth(Tone.AMSynth, {
  harmonicity: 1.5,
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 0.3 }
}).connect(masterReverb);
stringSynth.volume.value = -10;

// Woodwinds (Flute, Ocarina, Sax)
const windSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sine' },
  envelope: { attack: 0.05, decay: 0.1, sustain: 0.85, release: 0.2 }
}).connect(masterReverb);
windSynth.volume.value = -6;

// Plucked & Keyboard (Harp, Vibraphone, Marimba, Organ)
const harpSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.2 }
}).connect(masterReverb);
harpSynth.volume.value = -8;

// Bass (Electric Bass, Contrabass)
const bassSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.1 }
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

// 4. Scheduling & Block Engine
let conductorLoopId = null;

function setupConductor() {
  const transport = Tone.getTransport();
  transport.bpm.value = DEFAULT_BPM;

  if (conductorLoopId !== null) {
    transport.clear(conductorLoopId);
  }

  // Schedule recurring 8-bar block trigger
  conductorLoopId = transport.scheduleRepeat((time) => {
    // Resolve next state at 8-bar boundary
    currentPlaybackState = nextPlaybackState;

    // Schedule next block
    scheduleNextBlock(time);
  }, `${BARS_PER_BLOCK}m`);
}

function selectNextBlock(state) {
  if (state === 'EXPLORATION') {
    if (!introHasPlayed) {
      introHasPlayed = true;
      currentExplorationBlockIndex = 0;
      return INTRO_BLOCK;
    }
    // Pick from EXPLORATION_BLOCKS excluding the immediately preceding block
    let available = EXPLORATION_BLOCKS.filter(b => b.id !== currentExplorationBlockIndex);
    if (available.length === 0) available = EXPLORATION_BLOCKS;
    const chosen = available[Math.floor(Math.random() * available.length)];
    currentExplorationBlockIndex = chosen.id;
    return chosen;
  } else if (state === 'BATTLE') {
    // Battle loops through battle blocks sequentially
    const chosen = BATTLE_BLOCKS[currentBattleBlockIndex % BATTLE_BLOCKS.length];
    currentBattleBlockIndex++;
    return chosen;
  } else if (state === 'QUIET') {
    const chosen = QUIET_BLOCKS[Math.floor(Math.random() * QUIET_BLOCKS.length)];
    return chosen;
  }

  return INTRO_BLOCK;
}

function scheduleNextBlock(startTime) {
  const transport = Tone.getTransport();
  const chosenBlock = selectNextBlock(currentPlaybackState);

  // Queue all notes in chosen block on Tone.Transport
  midiData.tracks.forEach((track, trIdx) => {
    const synth = getSynthForTrack(trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= chosenBlock.startTicks && n.ticks < chosenBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      // Calculate beat offset relative to block start
      const beatOffset = (note.ticks - chosenBlock.startTicks) / TICKS_PER_BEAT;
      const durationBeats = note.durationTicks / TICKS_PER_BEAT;

      const secondsPerBeat = 60 / transport.bpm.value;
      const exactTime = startTime + (beatOffset * secondsPerBeat);
      const exactDuration = Math.max(durationBeats * secondsPerBeat, 0.05);

      const eventId = transport.schedule((scheduledTime) => {
        triggerNote(synth, note, exactDuration, scheduledTime);
      }, exactTime);

      activeScheduledEvents.push(eventId);
    });
  });
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

export function setBpm(newBpm) {
  if (newBpm >= 60 && newBpm <= 200) {
    Tone.getTransport().bpm.value = newBpm;
  }
}

export async function changeGameMode(newMode) {
  const transport = Tone.getTransport();

  // Ensure AudioContext is running
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
    console.log("AudioContext activated!");
    
    setupConductor();
    transport.start();
    
    currentPlaybackState = newMode;
    nextPlaybackState = newMode;
    scheduleNextBlock(transport.seconds);
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
  const currentBpm = transport.bpm.value;
  const secondsPerMeasure = (60 / currentBpm) * 4;

  // Calculate next 1-bar downbeat boundary time
  const currentSeconds = transport.seconds;
  const currentMeasure = Math.floor(currentSeconds / secondsPerMeasure);
  const nextDownbeatTime = (currentMeasure + 1) * secondsPerMeasure;

  // Clear all future scheduled events from transport
  activeScheduledEvents.forEach(eventId => {
    transport.clear(eventId);
  });
  activeScheduledEvents = [];

  currentPlaybackState = 'BATTLE';
  nextPlaybackState = 'BATTLE';

  // Schedule battle block starting on the next downbeat time
  scheduleNextBlock(nextDownbeatTime);
}
