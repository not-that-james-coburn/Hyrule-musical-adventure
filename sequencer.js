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

// 2. Block Roadmap Definitions (in measure units and tick ranges)
// INTRO_BLOCK now combines the 9-bar intro fanfare and the first 8-bar main theme statement (Bars 0–17, ticks 0..65280)
const INTRO_BLOCK = { id: 0, startBar: 0, endBar: 17, startTicks: 0, endTicks: 65280, startTimeSec: 0.000, nextTimeSec: 30.867, durationSec: 30.867 };

// Random Exploration cues loop across Blocks 2 through 7 (Bars 17–65, 8 measures each)
const EXPLORATION_BLOCKS = [
  { id: 2, startBar: 17, endBar: 25, startTicks: 65280, endTicks: 96000, startTimeSec: 30.867, nextTimeSec: 43.667, durationSec: 12.800 },
  { id: 3, startBar: 25, endBar: 33, startTicks: 96000, endTicks: 126720, startTimeSec: 43.667, nextTimeSec: 56.467, durationSec: 12.800 },
  { id: 4, startBar: 33, endBar: 41, startTicks: 126720, endTicks: 157440, startTimeSec: 56.467, nextTimeSec: 69.267, durationSec: 12.800 },
  { id: 5, startBar: 41, endBar: 49, startTicks: 157440, endTicks: 188160, startTimeSec: 69.267, nextTimeSec: 82.067, durationSec: 12.800 },
  { id: 6, startBar: 49, endBar: 57, startTicks: 188160, endTicks: 218880, startTimeSec: 82.067, nextTimeSec: 94.867, durationSec: 12.800 },
  { id: 7, startBar: 57, endBar: 65, startTicks: 218880, endTicks: 249600, startTimeSec: 94.867, nextTimeSec: 107.667, durationSec: 12.800 }
];

const BATTLE_BLOCKS = [
  { id: 8, startBar: 65, endBar: 73, startTicks: 249600, endTicks: 280320, startTimeSec: 107.667, nextTimeSec: 120.467, durationSec: 12.800 },
  { id: 9, startBar: 73, endBar: 81, startTicks: 280320, endTicks: 311040, startTimeSec: 120.467, nextTimeSec: 133.267, durationSec: 12.800 },
  { id: 10, startBar: 81, endBar: 89, startTicks: 311040, endTicks: 341760, startTimeSec: 133.267, nextTimeSec: 146.067, durationSec: 12.800 },
  { id: 11, startBar: 89, endBar: 97, startTicks: 341760, endTicks: 372480, startTimeSec: 146.067, nextTimeSec: 158.867, durationSec: 12.800 },
  { id: 12, startBar: 97, endBar: 105, startTicks: 372480, endTicks: 403200, startTimeSec: 158.867, nextTimeSec: 171.667, durationSec: 12.800 },
  { id: 13, startBar: 105, endBar: 113, startTicks: 403200, endTicks: 433920, startTimeSec: 171.667, nextTimeSec: 184.467, durationSec: 12.800 }
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

  const brassUrls = buildSamplerUrls(k => k.startsWith('Brass Section') || k.startsWith('Trombone') || k.startsWith('Trumpet'));
  const stringUrls = buildSamplerUrls(k => k.startsWith('StrLoop') || k.startsWith('Cello'));
  const windUrls = buildSamplerUrls(k => k.startsWith('Flute') || k.startsWith('Tenor Sax') || k.startsWith('Ocarina'));
  const harpUrls = buildSamplerUrls(k => k.startsWith('Orchestral Harp') || k.startsWith('Grand Piano') || k.startsWith('Vibraphone') || k.startsWith('Marimba') || k.startsWith('Accordion'));
  const bassUrls = buildSamplerUrls(k => k.startsWith('Double Bass') || k.startsWith('Pick Bass'));
  const timpaniUrls = buildSamplerUrls(k => k.startsWith('Timpani'));
  const percussionUrls = buildSamplerUrls(k => k.startsWith('Standard Snare') || k.startsWith('Jazz Snare') || k.startsWith('Standard Tom'));

  function createSoundfontRack(baseUrl) {
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

  rackA = createSoundfontRack(soundfontBaseUrl);
  rackB = createSoundfontRack(soundfontBaseUrl);
  rackB.volumeNode.volume.value = -Infinity; // rackB muted initially

  activeRack = rackA;
  inactiveRack = rackB;

  engineInitialized = true;
}

function getSamplerForTrack(rack, trackIndex) {
  if (!midiData || !midiData.tracks) return rack.brassSampler;
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
  if (!currentRack || !midiData || !midiData.tracks) return;

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

  const transportSeconds = transport.seconds;
  const elapsedInBlock = Math.max(0, transportSeconds - currentBlockStartTransportSec);
  const currentOffsetInBlock = elapsedInBlock % currentBlockDurationSec;

  currentBattleBlockIndex = 1; // Battle Block 2 (Bars 72..80)
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
          const exactDurationSec = note.duration;

          const eventId = transport.schedule((scheduledTime) => {
            triggerSafeNote(incomingRack, sampler, note, exactDurationSec, scheduledTime);
          }, noteTransportSec);

          activeScheduledEvents.push(eventId);
        }
      });
    });
  }

  const nextScheduledBlockTransportSec = currentBlockStartTransportSec + battleBlock.durationSec;
  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleBlockChain(nextScheduledBlockTransportSec);
  }, nextScheduledBlockTransportSec);
}
