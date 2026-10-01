import * as Tone from 'tone';
import midiData from './hyrule_field_midi.json';
import manifest from './public/soundfont/manifest.json';

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

// Helper to convert MIDI pitch number to note name (e.g. 60 -> "C4")
function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

// Build instrument sample mappings from manifest.json
function buildSamplerUrls(filterFn) {
  const urls = {};
  for (const [key, item] of Object.entries(manifest)) {
    if (filterFn(key, item)) {
      const noteName = midiToNoteName(item.pitch);
      const relativePath = item.file.startsWith('soundfont/') ? item.file.replace('soundfont/', '') : item.file;
      urls[noteName] = relativePath;
    }
  }
  return urls;
}

const brassUrls = buildSamplerUrls(k => k.startsWith('Brass Section') || k.startsWith('Trombone') || k.startsWith('Trumpet'));
const stringUrls = buildSamplerUrls(k => k.startsWith('StrLoop') || k.startsWith('Cello'));
const windUrls = buildSamplerUrls(k => k.startsWith('Flute') || k.startsWith('Tenor Sax') || k.startsWith('Ocarina'));
const harpUrls = buildSamplerUrls(k => k.startsWith('Orchestral Harp') || k.startsWith('Grand Piano') || k.startsWith('Vibraphone') || k.startsWith('Marimba') || k.startsWith('Accordion'));
const bassUrls = buildSamplerUrls(k => k.startsWith('Double Bass') || k.startsWith('Pick Bass'));
const timpaniUrls = buildSamplerUrls(k => k.startsWith('Timpani'));
const percussionUrls = buildSamplerUrls(k => k.startsWith('Standard Snare') || k.startsWith('Jazz Snare') || k.startsWith('Standard Tom'));

// 3. Master Audio Output Pipeline
const masterLimiter = new Tone.Limiter(-1).toDestination();
const masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterLimiter);

// Use import.meta.env.BASE_URL to dynamically align with Vite base path (e.g. ./ or /Hyrule-musical-adventure/)
const envBase = import.meta.env.BASE_URL || './';
const baseUrl = `${envBase.endsWith('/') ? envBase : envBase + '/'}soundfont/`;

function createSoundfontRack() {
  const volumeNode = new Tone.Volume(0).connect(masterReverb);

  const brassSampler = new Tone.Sampler({ urls: brassUrls, baseUrl }).connect(volumeNode);
  brassSampler.volume.value = -4;

  const stringSampler = new Tone.Sampler({ urls: stringUrls, baseUrl }).connect(volumeNode);
  stringSampler.volume.value = -6;

  const windSampler = new Tone.Sampler({ urls: windUrls, baseUrl }).connect(volumeNode);
  windSampler.volume.value = -4;

  const harpSampler = new Tone.Sampler({ urls: harpUrls, baseUrl }).connect(volumeNode);
  harpSampler.volume.value = -6;

  const bassSampler = new Tone.Sampler({ urls: bassUrls, baseUrl }).connect(volumeNode);
  bassSampler.volume.value = -4;

  const timpaniSampler = new Tone.Sampler({ urls: timpaniUrls, baseUrl }).connect(volumeNode);
  timpaniSampler.volume.value = -4;

  const percussionSampler = new Tone.Sampler({ urls: percussionUrls, baseUrl }).connect(volumeNode);
  percussionSampler.volume.value = -4;

  // Fallback synths for percussive elements without samples (kick, hi-hat)
  const kickSynth = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 4, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
  }).connect(masterLimiter);
  kickSynth.volume.value = -6;

  const hihatSynth = new Tone.MetalSynth({
    frequency: 200, envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
    harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
  }).connect(masterLimiter);
  hihatSynth.volume.value = -22;

  function releaseAll() {
    [brassSampler, stringSampler, windSampler, harpSampler, bassSampler, timpaniSampler, percussionSampler].forEach(s => {
      if (s && typeof s.releaseAll === 'function') s.releaseAll();
    });
  }

  return {
    volumeNode,
    brassSampler,
    stringSampler,
    windSampler,
    harpSampler,
    bassSampler,
    timpaniSampler,
    percussionSampler,
    kickSynth,
    hihatSynth,
    releaseAll
  };
}

// Dual racks for seamless crossfading
const rackA = createSoundfontRack();
const rackB = createSoundfontRack();
rackB.volumeNode.volume.value = -Infinity; // rackB muted initially

let activeRack = rackA;
let inactiveRack = rackB;

function getSamplerForTrack(rack, trackIndex) {
  const tr = midiData.tracks[trackIndex];
  if (!tr) return rack.brassSampler;

  const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();
  const channel = tr.channel;

  if (channel === 9) {
    return 'percussion';
  }

  if (instName.includes('trombone') || instName.includes('trumpet') || instName.includes('brass')) {
    return rack.brassSampler;
  }
  if (instName.includes('string') || instName.includes('contrabass')) {
    return rack.stringSampler;
  }
  if (instName.includes('flute') || instName.includes('ocarina') || instName.includes('sax')) {
    return rack.windSampler;
  }
  if (instName.includes('harp') || instName.includes('vibraphone') || instName.includes('marimba') || instName.includes('organ') || instName.includes('piano')) {
    return rack.harpSampler;
  }
  if (instName.includes('bass')) {
    return rack.bassSampler;
  }
  if (instName.includes('timpani')) {
    return rack.timpaniSampler;
  }

  return rack.brassSampler;
}

// Helper to trigger note on sampler / synth safely without throwing if buffer is unready
function triggerSafeNote(rack, sampler, note, durationSec, time) {
  const now = Tone.now();
  let safeTime = Math.max(time, now);

  if (sampler === 'percussion') {
    const midiPitch = note.midi;
    if (midiPitch === 35 || midiPitch === 36) {
      const lastTime = rack.kickSynth._lastTriggerTime || 0;
      safeTime = Math.max(safeTime, lastTime + 0.002);
      rack.kickSynth._lastTriggerTime = safeTime;
      rack.kickSynth.triggerAttackRelease('C1', durationSec, safeTime, note.velocity);
    } else if (midiPitch === 42 || midiPitch === 44) {
      const lastTime = rack.hihatSynth._lastTriggerTime || 0;
      safeTime = Math.max(safeTime, lastTime + 0.002);
      rack.hihatSynth._lastTriggerTime = safeTime;
      rack.hihatSynth.triggerAttackRelease(durationSec, safeTime, note.velocity * 0.7);
    } else if (midiPitch === 47 || midiPitch === 48) {
      if (rack.timpaniSampler && rack.timpaniSampler.loaded) {
        rack.timpaniSampler.triggerAttackRelease('D3', durationSec, safeTime, note.velocity);
      }
    } else {
      if (rack.percussionSampler && rack.percussionSampler.loaded) {
        rack.percussionSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
      }
    }
  } else {
    if (sampler && sampler.loaded) {
      sampler.triggerAttackRelease(note.name, durationSec, safeTime, note.velocity);
    }
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

  currentPlaybackState = nextPlaybackState;
  const chosenBlock = selectNextBlock(currentPlaybackState);

  currentBlockStartTransportSec = startTransportSec;
  currentBlockDurationSec = chosenBlock.durationSec;

  const currentRack = activeRack;

  midiData.tracks.forEach((track, trIdx) => {
    const sampler = getSamplerForTrack(currentRack, trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= chosenBlock.startTicks && n.ticks < chosenBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - chosenBlock.startTimeSec;
      const noteTransportSec = startTransportSec + relativeNoteTimeSec;
      const exactDurationSec = note.duration;

      const eventId = transport.schedule((scheduledTime) => {
        triggerSafeNote(currentRack, sampler, note, exactDurationSec, scheduledTime);
      }, noteTransportSec);

      activeScheduledEvents.push(eventId);
    });
  });

  const nextScheduledBlockTransportSec = startTransportSec + chosenBlock.durationSec;

  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, nextScheduledBlockTransportSec);
}

// 5. UI Trigger Functions & Loading Indicator Promise
export function getCurrentPlaybackState() {
  return currentPlaybackState;
}

export function whenAudioLoaded(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      reject(new Error("Audio sample loading timed out after " + (timeoutMs / 1000) + "s"));
    }, timeoutMs);

    Tone.loaded().then(() => {
      clearTimeout(timer);
      resolve();
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function changeGameMode(newMode) {
  const transport = Tone.getTransport();

  await Tone.start();

  if (transport.state !== 'started') {
    console.log("AudioContext activated and Transport started!");
    
    currentPlaybackState = newMode;
    nextPlaybackState = newMode;

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

  activeScheduledEvents.forEach(eventId => transport.clear(eventId));
  activeScheduledEvents = [];

  if (conductorScheduleId !== null) {
    transport.clear(conductorScheduleId);
    conductorScheduleId = null;
  }

  currentPlaybackState = 'BATTLE';
  nextPlaybackState = 'BATTLE';

  const outgoingRack = activeRack;
  const incomingRack = inactiveRack;

  activeRack = incomingRack;
  inactiveRack = outgoingRack;

  outgoingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
  outgoingRack.volumeNode.volume.rampTo(-60, CROSSFADE_TIME);

  incomingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
  incomingRack.volumeNode.volume.setValueAtTime(-60, Tone.now());
  incomingRack.volumeNode.volume.rampTo(0, CROSSFADE_TIME);

  setTimeout(() => {
    outgoingRack.releaseAll();
  }, CROSSFADE_TIME * 1000);

  const transportSeconds = transport.seconds;
  const elapsedInBlock = Math.max(0, transportSeconds - currentBlockStartTransportSec);
  const currentOffsetInBlock = elapsedInBlock % currentBlockDurationSec;

  currentBattleBlockIndex = 1; // Battle Block 2 (Bars 72..80)
  const battleBlock = BATTLE_BLOCKS[1];

  currentBlockStartTransportSec = transportSeconds - currentOffsetInBlock;
  currentBlockDurationSec = battleBlock.durationSec;

  midiData.tracks.forEach((track, trIdx) => {
    const sampler = getSamplerForTrack(incomingRack, trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= battleBlock.startTicks && n.ticks < battleBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - battleBlock.startTimeSec;
      if (relativeNoteTimeSec >= currentOffsetInBlock) {
        const noteTransportSec = currentBlockStartTransportSec + relativeNoteTimeSec;
        const exactDurationSec = note.duration;

        const eventId = transport.schedule((scheduledTime) => {
          triggerSafeNote(incomingRack, sampler, note, exactDurationSec, scheduledTime);
        }, noteTransportSec);

        activeScheduledEvents.push(eventId);
      }
    });
  });

  const nextScheduledBlockTransportSec = currentBlockStartTransportSec + battleBlock.durationSec;
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, nextScheduledBlockTransportSec);
}
