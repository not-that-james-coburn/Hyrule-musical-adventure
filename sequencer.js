import * as Tone from 'tone';

let midiData = null;
let manifest = null;

// 1. Core State & Timing Configuration
let PPQ = 960;
const BARS_PER_BLOCK = 8;
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

// 2. Block Roadmap Definitions & Map Container
const INTRO_BLOCK = { id: 0, startBar: 0, endBar: 17, startTicks: 0, endTicks: 65280, startTimeSec: 0.000, nextTimeSec: 30.867, durationSec: 30.867 };

const EXPLORATION_BLOCKS = [
  { id: 2, startBar: 17, endBar: 25, startTicks: 65280, endTicks: 96000, startTimeSec: 30.867, nextTimeSec: 43.667, durationSec: 12.800 },
  { id: 3, startBar: 25, endBar: 33, startTicks: 96000, endTicks: 126720, startTimeSec: 43.667, nextTimeSec: 56.467, durationSec: 12.800 },
  { id: 4, startBar: 33, endBar: 41, startTicks: 126720, endTicks: 157440, startTimeSec: 56.467, nextTimeSec: 69.267, durationSec: 12.800 },
  { id: 5, startBar: 41, endBar: 49, startTicks: 157440, endTicks: 188160, startTimeSec: 69.267, nextTimeSec: 82.067, durationSec: 12.800 },
  { id: 6, startBar: 49, endBar: 57, startTicks: 188160, endTicks: 218880, startTimeSec: 82.067, nextTimeSec: 94.867, durationSec: 12.800 },
  { id: 7, startBar: 57, endBar: 65, startTicks: 218880, endTicks: 249600, startTimeSec: 94.867, nextTimeSec: 107.667, durationSec: 12.800 }
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
  { id: 18, startBar: 137, endBar: 145, startTicks: 526080, endTicks: 556800, startTimeSec: 222.867, nextTimeSec: 236.582, durationSec: 13.714 },
  { id: 19, startBar: 145, endBar: 153, startTicks: 556800, endTicks: 587520, startTimeSec: 236.582, nextTimeSec: 250.804, durationSec: 14.222 },
  { id: 20, startBar: 153, endBar: 161, startTicks: 587520, endTicks: 618240, startTimeSec: 250.804, nextTimeSec: 264.518, durationSec: 13.714 },
  { id: 21, startBar: 161, endBar: 169, startTicks: 618240, endTicks: 648960, startTimeSec: 264.518, nextTimeSec: 278.232, durationSec: 13.714 },
  { id: 22, startBar: 169, endBar: 177, startTicks: 648960, endTicks: 679680, startTimeSec: 278.232, nextTimeSec: 291.032, durationSec: 12.800 }
];

const blockMap = {
  INTRO: INTRO_BLOCK,
  EXPLORATION: EXPLORATION_BLOCKS,
  BATTLE: BATTLE_BLOCKS,
  QUIET: QUIET_BLOCKS
};

// Helper to convert MIDI pitch number to note name (e.g. 60 -> "C4")
function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return noteNames[midi % 12] + octave;
}

// Build instrument sample mappings from manifest.json
function buildSamplerUrls(filterFn) {
  const urls = {};
  if (!manifest) return urls;
  for (const [key, item] of Object.entries(manifest)) {
    if (filterFn(key, item)) {
      const noteName = midiToNoteName(item.pitch);
      const relativePath = item.file.startsWith('soundfont/') ? item.file.replace('soundfont/', '') : item.file;
      urls[noteName] = relativePath;
    }
  }
  return urls;
}

// 3. Master Audio Output Pipeline
let masterLimiter;
let masterReverb;
let rackA = null;
let rackB = null;
let activeRack = null;
let inactiveRack = null;
let engineInitialized = false;
let initPromise = null;

async function detectAndInitAudioEngine() {
  if (engineInitialized) return;

  masterLimiter = new Tone.Limiter(-1).toDestination();
  masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterLimiter);

  const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
  const cleanBase = envBase.endsWith('/') ? envBase : envBase + '/';

  let soundfontBaseUrl = `${cleanBase}soundfont/`;

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
        soundfontBaseUrl = candidate;
        manifest = await res.json();
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
        midiData = await res.json();
        if (midiData && midiData.header && midiData.header.ppq) {
          PPQ = midiData.header.ppq;
        }
        break;
      }
    } catch (e) {
      // ignore
    }
  }

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

  const sampleUrlMaps = {};
  for (const [instKey, spec] of Object.entries(sampleSpecs)) {
    sampleUrlMaps[instKey] = buildSamplerUrls(spec.filter);
  }

  function createSoundfontRack(baseUrl) {
    const volumeNode = new Tone.Volume(0).connect(masterReverb);
    const samplers = {};

    for (const [instKey, spec] of Object.entries(sampleSpecs)) {
      const urls = sampleUrlMaps[instKey];
      if (Object.keys(urls).length > 0) {
        const sampler = new Tone.Sampler({ urls, baseUrl }).connect(volumeNode);
        sampler.volume.value = spec.defaultVol;
        samplers[instKey] = sampler;
      }
    }

    // Fallback synths for percussive elements without soundfont samples (kick, hi-hat)
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
      Object.values(samplers).forEach(s => {
        if (s && typeof s.releaseAll === 'function') s.releaseAll();
      });
    }

    return {
      volumeNode,
      samplers,
      kickSynth,
      hihatSynth,
      releaseAll
    };
  }

  rackA = createSoundfontRack(soundfontBaseUrl);
  rackB = createSoundfontRack(soundfontBaseUrl);
  rackB.volumeNode.volume.value = -Infinity; // rackB muted initially

  activeRack = rackA;
  inactiveRack = rackB;

  engineInitialized = true;
}

// Helper to resolve the correct instrument key for a track based on track and channel metadata
function getInstrumentKeyForTrack(trackIndex) {
  if (!midiData || !midiData.tracks) return 'piano';
  const tr = midiData.tracks[trackIndex];
  if (!tr) return 'piano';

  const channel = tr.channel;
  if (channel === 9) return 'percussion';

  const instNumber = tr.instrument ? tr.instrument.number : 0;
  const instName = (tr.instrument ? tr.instrument.name : '').toLowerCase();

  // If track has a specific non-piano instrument definition, map it directly
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

  // Channel fallbacks when track instrument is default 0 (Acoustic Grand Piano)
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

function getSamplerForTrack(rack, trackIndex) {
  const key = getInstrumentKeyForTrack(trackIndex);
  if (key === 'percussion') return 'percussion';
  return rack.samplers[key] || rack.samplers.piano;
}

// Helper to trigger note on sampler / synth safely without throwing if buffer is unready
function triggerSafeNote(rack, sampler, note, durationSec, time) {
  const now = Tone.now();
  let safeTime = Math.max(time, now);

  if (sampler === 'percussion') {
    const midiPitch = note.midi;
    // Percussion note mapping for General MIDI drum channel (Channel 9)
    if (midiPitch === 35 || midiPitch === 36) { // Acoustic / Electric Bass Drum (Kick)
      const lastTime = rack.kickSynth._lastTriggerTime || 0;
      safeTime = Math.max(safeTime, lastTime + 0.002);
      rack.kickSynth._lastTriggerTime = safeTime;
      rack.kickSynth.triggerAttackRelease('C1', durationSec, safeTime, note.velocity);
    } else if (midiPitch === 38 || midiPitch === 40) { // Acoustic / Electric Snare Drum
      const snareSampler = rack.samplers.snare;
      if (snareSampler && snareSampler.loaded) {
        snareSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
      }
    } else if (midiPitch === 42 || midiPitch === 44) { // Closed Hi-Hat / Pedal Hi-Hat
      const lastTime = rack.hihatSynth._lastTriggerTime || 0;
      safeTime = Math.max(safeTime, lastTime + 0.002);
      rack.hihatSynth._lastTriggerTime = safeTime;
      rack.hihatSynth.triggerAttackRelease(durationSec, safeTime, note.velocity * 0.7);
    } else if (midiPitch >= 41 && midiPitch <= 50) { // Toms
      const tomSampler = rack.samplers.tom;
      if (tomSampler && tomSampler.loaded) {
        tomSampler.triggerAttackRelease('C4', durationSec, safeTime, note.velocity);
      } else if (rack.samplers.timpani && rack.samplers.timpani.loaded) {
        rack.samplers.timpani.triggerAttackRelease('D3', durationSec, safeTime, note.velocity);
      }
    } else { // Fallback snare or tom for other percussion triggers
      const snareSampler = rack.samplers.snare;
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

// 4. Scheduling & Dynamic Conductor Engine using managed Tone.Part
let conductorScheduleId = null;

// Global Tone.Part instance to hold active block note events
const musicalBlockPart = new Tone.Part((time, noteEvent) => {
  const rack = activeRack;
  if (!rack) return;
  triggerSafeNote(rack, noteEvent.sampler, noteEvent.note, noteEvent.duration, time);
}, []).start(0);

function selectNextBlock(state) {
  const pool = blockMap[state];
  if (!pool) return INTRO_BLOCK;

  if (state === 'INTRO') {
    return INTRO_BLOCK;
  }

  if (Array.isArray(pool)) {
    if (state === 'EXPLORATION') {
      let available = pool.filter(b => b.id !== currentExplorationBlockIndex);
      if (available.length === 0) available = pool;
      const chosen = available[Math.floor(Math.random() * available.length)];
      currentExplorationBlockIndex = chosen.id;
      return chosen;
    } else if (state === 'BATTLE') {
      const chosen = pool[currentBattleBlockIndex % pool.length];
      currentBattleBlockIndex++;
      return chosen;
    } else if (state === 'QUIET') {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  return pool;
}

function scheduleMidiBlock(state, startTime) {
  // 1. Clear out all notes currently remaining in the part container
  musicalBlockPart.clear();

  // Determine state transition if intro has played
  if (state === 'INTRO' && introHasPlayed) {
    state = nextPlaybackState !== 'INTRO' ? nextPlaybackState : 'EXPLORATION';
  }

  currentPlaybackState = state;
  if (state === 'INTRO') {
    introHasPlayed = true;
  }

  const chosenBlock = selectNextBlock(state);

  currentBlockStartTransportSec = startTime;
  currentBlockDurationSec = chosenBlock.durationSec;

  const currentRack = activeRack;
  if (!currentRack || !midiData || !midiData.tracks) return chosenBlock;

  midiData.tracks.forEach((track, trIdx) => {
    const sampler = getSamplerForTrack(currentRack, trIdx);

    const notesInBlock = track.notes.filter(n =>
      n.ticks >= chosenBlock.startTicks && n.ticks < chosenBlock.endTicks
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTimeSec = note.time - chosenBlock.startTimeSec;
      const absNoteTimeSec = startTime + relativeNoteTimeSec;

      // 2. Add the note into the Part using relative transport timestamp offset
      musicalBlockPart.add(absNoteTimeSec, {
        note: note,
        duration: note.duration,
        sampler: sampler
      });
    });
  });

  return chosenBlock;
}

function scheduleBlockChain(startTransportSec) {
  const transport = Tone.getTransport();

  let stateToSchedule = nextPlaybackState;
  if (!introHasPlayed) {
    stateToSchedule = 'INTRO';
  }

  const chosenBlock = scheduleMidiBlock(stateToSchedule, startTransportSec);

  const nextScheduledBlockTransportSec = startTransportSec + chosenBlock.durationSec;
  const leadTimeSec = 0.2;
  const scheduleTriggerSec = Math.max(startTransportSec, nextScheduledBlockTransportSec - leadTimeSec);

  if (conductorScheduleId !== null) {
    transport.clear(conductorScheduleId);
  }

  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, scheduleTriggerSec);
}

// 5. UI Trigger Functions & Loading Indicator Promise
export function getCurrentPlaybackState() {
  return currentPlaybackState;
}

export function whenAudioLoaded(timeoutMs = 15000) {
  if (!initPromise) {
    initPromise = (async () => {
      await detectAndInitAudioEngine();
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
    })();
  }
  return initPromise;
}

export async function changeGameMode(newMode) {
  await whenAudioLoaded();
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

  if (outgoingRack && outgoingRack.volumeNode) {
    outgoingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
    outgoingRack.volumeNode.volume.rampTo(-60, CROSSFADE_TIME);
  }

  if (incomingRack && incomingRack.volumeNode) {
    incomingRack.volumeNode.volume.cancelScheduledValues(Tone.now());
    incomingRack.volumeNode.volume.setValueAtTime(-60, Tone.now());
    incomingRack.volumeNode.volume.rampTo(0, CROSSFADE_TIME);
  }

  setTimeout(() => {
    if (outgoingRack && typeof outgoingRack.releaseAll === 'function') {
      outgoingRack.releaseAll();
    }
  }, CROSSFADE_TIME * 1000);

  // Clear current part notes to cut former melody immediately without resetting transport position
  musicalBlockPart.clear();

  const transportSeconds = transport.seconds;
  const elapsedInBlock = Math.max(0, transportSeconds - currentBlockStartTransportSec);
  const currentOffsetInBlock = elapsedInBlock % currentBlockDurationSec;

  currentBattleBlockIndex = 1; // Battle Block 2
  const battleBlock = BATTLE_BLOCKS[1];

  currentBlockStartTransportSec = transportSeconds - currentOffsetInBlock;
  currentBlockDurationSec = battleBlock.durationSec;

  if (midiData && midiData.tracks) {
    midiData.tracks.forEach((track, trIdx) => {
      const sampler = getSamplerForTrack(incomingRack, trIdx);

      const notesInBlock = track.notes.filter(n =>
        n.ticks >= battleBlock.startTicks && n.ticks < battleBlock.endTicks
      );

      notesInBlock.forEach((note) => {
        const relativeNoteTimeSec = note.time - battleBlock.startTimeSec;
        if (relativeNoteTimeSec >= currentOffsetInBlock) {
          const noteTransportSec = currentBlockStartTransportSec + relativeNoteTimeSec;

          musicalBlockPart.add(noteTransportSec, {
            note: note,
            duration: note.duration,
            sampler: sampler
          });
        }
      });
    });
  }

  const nextScheduledBlockTransportSec = currentBlockStartTransportSec + battleBlock.durationSec;
  const leadTimeSec = 0.2;
  const scheduleTriggerSec = Math.max(transportSeconds, nextScheduledBlockTransportSec - leadTimeSec);

  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, scheduleTriggerSec);
}
