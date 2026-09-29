import * as Tone from 'tone';
import midiData from './hyrule_field_midi.json' with { type: 'json' };

// 1. Core State & Timing Configuration
const PPQ = midiData.header.ppq || 960;
const BARS_PER_BLOCK = 8;
const TICKS_PER_BLOCK = PPQ * 4 * BARS_PER_BLOCK; // 30,720 ticks per 8-bar block
const CROSSFADE_TIME = 0.8; // Duration in seconds for smooth crossfade transition

let currentPlaybackState = 'EXPLORATION'; 
let nextPlaybackState = 'EXPLORATION';
let activeScheduledEvents = []; // Holds Tone.Transport event IDs for clean clearing
let currentExplorationBlockIndex = null;
let currentBattleBlockIndex = 1; // Start battle sequence at index 1 (Battle Block 2) on immediate override
let introHasPlayed = false;

// Track active block info for progress bar calculations (in Transport seconds)
export let currentBlockDurationSec = 13.333;
export let currentBlockStartTransportSec = 0;

// 2. Block Roadmap Definitions (in measure units and tick ranges)
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

const QUIET_BLOCKS = [
  { id: 18, startBar: 144, endBar: 152, startTicks: 552960, endTicks: 583680, startTimeSec: 234.867, nextTimeSec: 249.026, durationSec: 14.159 },
  { id: 19, startBar: 152, endBar: 160, startTicks: 583680, endTicks: 614400, startTimeSec: 249.026, nextTimeSec: 262.804, durationSec: 13.778 },
  { id: 20, startBar: 160, endBar: 168, startTicks: 614400, endTicks: 645120, startTimeSec: 262.804, nextTimeSec: 276.518, durationSec: 13.714 },
  { id: 21, startBar: 168, endBar: 176, startTicks: 645120, endTicks: 675840, startTimeSec: 276.518, nextTimeSec: 289.432, durationSec: 12.914 }
];

// 3. Master Audio Output Pipeline
const masterLimiter = new Tone.Limiter(-1).toDestination();
const masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterLimiter);

// Function to construct an independent synth rack with its own Master Volume channel node for smooth crossfading
function createSynthRack() {
  const volumeNode = new Tone.Volume(0).connect(masterReverb);

  const brassSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.3 }
  }).connect(volumeNode);
  brassSynth.volume.value = -8;

  const stringSynth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 0.4 }
  }).connect(volumeNode);
  stringSynth.volume.value = -10;

  const windSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.85, release: 0.3 }
  }).connect(volumeNode);
  windSynth.volume.value = -6;

  const harpSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.3 }
  }).connect(volumeNode);
  harpSynth.volume.value = -8;

  const bassSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.2 }
  }).connect(volumeNode);
  bassSynth.volume.value = -6;

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
  }).connect(volumeNode);
  timpaniSynth.volume.value = -8;

  function releaseAll() {
    [brassSynth, stringSynth, windSynth, harpSynth, bassSynth].forEach(s => {
      if (typeof s.releaseAll === 'function') s.releaseAll();
    });
  }

  return {
    volumeNode,
    brassSynth,
    stringSynth,
    windSynth,
    harpSynth,
    bassSynth,
    kickSynth,
    snareSynth,
    hihatSynth,
    timpaniSynth,
    releaseAll
  };
}

// Instantiate dual racks for seamless crossfading
const rackA = createSynthRack();
const rackB = createSynthRack();
rackB.volumeNode.volume.value = -Infinity; // rackB muted initially

let activeRack = rackA;
let inactiveRack = rackB;

function getSynthForTrack(rack, trackIndex) {
  const tr = midiData.tracks[trackIndex];
  if (!tr) return rack.brassSynth;

  const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();
  const channel = tr.channel;

  if (channel === 9) {
    return 'percussion';
  }

  if (instName.includes('trombone') || instName.includes('trumpet') || instName.includes('brass')) {
    return rack.brassSynth;
  }
  if (instName.includes('string') || instName.includes('contrabass')) {
    return rack.stringSynth;
  }
  if (instName.includes('flute') || instName.includes('ocarina') || instName.includes('sax')) {
    return rack.windSynth;
  }
  if (instName.includes('harp') || instName.includes('vibraphone') || instName.includes('marimba') || instName.includes('organ') || instName.includes('piano')) {
    return rack.harpSynth;
  }
  if (instName.includes('bass')) {
    return rack.bassSynth;
  }
  if (instName.includes('timpani')) {
    return rack.timpaniSynth;
  }

  return rack.brassSynth;
}

// Helper to trigger monophonic or polyphonic synths without schedule time collisions
function triggerSafeNote(rack, synth, note, durationSec, time) {
  const now = Tone.now();
  // Ensure scheduled time is never in the past relative to AudioContext current time
  let safeTime = Math.max(time, now);

  if (synth === 'percussion') {
    const midiPitch = note.midi;
    let targetSynth = rack.snareSynth;
    let pitchParam = undefined;
    let velMult = 0.5;

    if (midiPitch === 35 || midiPitch === 36) {
      targetSynth = rack.kickSynth;
      pitchParam = 'C1';
      velMult = 1.0;
    } else if (midiPitch === 38 || midiPitch === 40) {
      targetSynth = rack.snareSynth;
      velMult = 1.0;
    } else if (midiPitch === 42 || midiPitch === 44) {
      targetSynth = rack.hihatSynth;
      velMult = 0.7;
    } else if (midiPitch === 47 || midiPitch === 48) {
      targetSynth = rack.timpaniSynth;
      pitchParam = 'G1';
      velMult = 1.0;
    }

    const lastTime = targetSynth._lastTriggerTime || 0;
    safeTime = Math.max(safeTime, lastTime + 0.002);
    targetSynth._lastTriggerTime = safeTime;

    if (pitchParam !== undefined) {
      targetSynth.triggerAttackRelease(pitchParam, durationSec, safeTime, note.velocity * velMult);
    } else {
      targetSynth.triggerAttackRelease(durationSec, safeTime, note.velocity * velMult);
    }
  } else if (synth instanceof Tone.MembraneSynth) {
    const lastTime = synth._lastTriggerTime || 0;
    safeTime = Math.max(safeTime, lastTime + 0.002);
    synth._lastTriggerTime = safeTime;
    synth.triggerAttackRelease(note.name, durationSec, safeTime, note.velocity);
  } else {
    synth.triggerAttackRelease(note.name, durationSec, safeTime, note.velocity);
  }
}

// 4. Scheduling & Dynamic Conductor Engine
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

function scheduleBlockChain(startTransportSec) {
  const transport = Tone.getTransport();

  // Resolve next state for this phrase
  currentPlaybackState = nextPlaybackState;
  const chosenBlock = selectNextBlock(currentPlaybackState);

  currentBlockStartTransportSec = startTransportSec;
  currentBlockDurationSec = chosenBlock.durationSec;

  const currentRack = activeRack;

  // Queue notes using JSON exact relative note times for natural tempo variations
  midiData.tracks.forEach((track, trIdx) => {
    const synth = getSynthForTrack(currentRack, trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= chosenBlock.startTicks && n.ticks < chosenBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - chosenBlock.startTimeSec;
      const noteTransportSec = startTransportSec + relativeNoteTimeSec;
      const exactDurationSec = note.duration;

      const eventId = transport.schedule((scheduledTime) => {
        triggerSafeNote(currentRack, synth, note, exactDurationSec, scheduledTime);
      }, noteTransportSec);

      activeScheduledEvents.push(eventId);
    });
  });

  // Calculate the Transport start time of the next block
  const nextScheduledBlockTransportSec = startTransportSec + chosenBlock.durationSec;

  // Recursively schedule the subsequent block trigger at nextScheduledBlockTransportSec
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, nextScheduledBlockTransportSec);
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

    // Start chain from Transport time 0
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

  // Clear upcoming note triggers and conductor schedule from Transport
  activeScheduledEvents.forEach(eventId => transport.clear(eventId));
  activeScheduledEvents = [];

  if (conductorScheduleId !== null) {
    transport.clear(conductorScheduleId);
    conductorScheduleId = null;
  }

  currentPlaybackState = 'BATTLE';
  nextPlaybackState = 'BATTLE';

  // Perform smooth crossfade between synth racks
  const outgoingRack = activeRack;
  const incomingRack = inactiveRack;

  // Swap racks
  activeRack = incomingRack;
  inactiveRack = outgoingRack;

  // Ramp outgoing volume down and incoming volume up
  outgoingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
  outgoingRack.volumeNode.volume.rampTo(-60, CROSSFADE_TIME);

  incomingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
  incomingRack.volumeNode.volume.setValueAtTime(-60, Tone.now());
  incomingRack.volumeNode.volume.rampTo(0, CROSSFADE_TIME);

  // Release lingering notes on outgoing rack after crossfade completes
  setTimeout(() => {
    outgoingRack.releaseAll();
  }, CROSSFADE_TIME * 1000);

  // Calculate position within current 8-bar block to maintain timing
  const transportSeconds = transport.seconds;
  const elapsedInBlock = Math.max(0, transportSeconds - currentBlockStartTransportSec);
  const currentOffsetInBlock = elapsedInBlock % currentBlockDurationSec;

  currentBattleBlockIndex = 1; // Battle Block 2 (Bars 72..80)
  const battleBlock = BATTLE_BLOCKS[1];

  currentBlockStartTransportSec = transportSeconds - currentOffsetInBlock;
  currentBlockDurationSec = battleBlock.durationSec;

  midiData.tracks.forEach((track, trIdx) => {
    const synth = getSynthForTrack(incomingRack, trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= battleBlock.startTicks && n.ticks < battleBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - battleBlock.startTimeSec;
      if (relativeNoteTimeSec >= currentOffsetInBlock) {
        const noteTransportSec = currentBlockStartTransportSec + relativeNoteTimeSec;
        const exactDurationSec = note.duration;

        const eventId = transport.schedule((scheduledTime) => {
          triggerSafeNote(incomingRack, synth, note, exactDurationSec, scheduledTime);
        }, noteTransportSec);

        activeScheduledEvents.push(eventId);
      }
    });
  });

  // Next block start transport time
  const nextScheduledBlockTransportSec = currentBlockStartTransportSec + battleBlock.durationSec;
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, nextScheduledBlockTransportSec);
}
