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

// 2. Absolute Measure-Based Calibration Mapping (blockMap)
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

// 3. Master Audio Output Pipeline & Segregated Volume Nodes
let masterLimiter;
let masterReverb;
let melodyVolumeNode = null;
let percussionVolumeNode = null;
let soundRack = null;
let musicalBlockPart = null;
let engineInitialized = false;
let initPromise = null;

async function detectAndInitAudioEngine() {
  if (engineInitialized) return;

  masterLimiter = new Tone.Limiter(-1).toDestination();
  masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterLimiter);

  // Initialize segregated volume nodes connected to masterReverb
  melodyVolumeNode = new Tone.Volume(0).connect(masterReverb);
  percussionVolumeNode = new Tone.Volume(0).connect(masterReverb);

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
    const samplers = {};

    for (const [instKey, spec] of Object.entries(sampleSpecs)) {
      const urls = sampleUrlMaps[instKey];
      if (Object.keys(urls).length > 0) {
        const isPerc = instKey === 'snare' || instKey === 'tom';
        const destNode = isPerc ? percussionVolumeNode : melodyVolumeNode;
        const sampler = new Tone.Sampler({ urls, baseUrl }).connect(destNode);
        sampler.volume.value = spec.defaultVol;
        samplers[instKey] = sampler;
      }
    }

    // Fallback synths for percussive elements without soundfont samples (kick, hi-hat)
    const kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    }).connect(percussionVolumeNode);
    kickSynth.volume.value = -6;

    const hihatSynth = new Tone.MetalSynth({
      frequency: 200, envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
    }).connect(percussionVolumeNode);
    hihatSynth.volume.value = -22;

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

  soundRack = createSoundfontRack(soundfontBaseUrl);

  // Single global Tone.Part linked to instruments
  musicalBlockPart = new Tone.Part((time, noteEvent) => {
    const sampler = getSamplerForTrack(soundRack, noteEvent.trIdx);
    triggerSafeNote(soundRack, sampler, noteEvent, noteEvent.duration, time);
  }, []).start(0);

  engineInitialized = true;
}

// Helper to resolve the correct instrument key for a track based on track and channel metadata
function getInstrumentKeyForTrack(trackIndex) {
  if (!midiData || !midiData.tracks) return 'piano';
  const tr = midiData.tracks[trackIndex];
  if (!tr) return 'piano';

  const channel = tr.channel;
  if (channel === 9 || (tr.instrument && tr.instrument.family === 'drums')) return 'percussion';

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
  return rack ? (rack.samplers[key] || rack.samplers.piano) : null;
}

// Helper to trigger note on sampler / synth safely without throwing if buffer is unready
function triggerSafeNote(rack, sampler, note, durationSec, time) {
  if (!rack) return;
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

// 4. Scheduling & Dynamic Conductor Engine
let conductorScheduleId = null;
let explorationCueSequenceIndex = 0; // 0 = Day Chunk 1, then >= 1 randomized

function selectBlockForState(state) {
  if (state === 'INTRO') {
    return blockMap.INTRO;
  }
  if (state === 'BATTLE_INTRO') {
    return blockMap.BATTLE_INTRO;
  }
  if (state === 'BATTLE_OUTRO') {
    return blockMap.BATTLE_OUTRO;
  }
  if (state === 'BATTLE') {
    const battleChunks = blockMap.BATTLE;
    const chosen = battleChunks[currentBattleBlockIndex % battleChunks.length];
    currentBattleBlockIndex++;
    return chosen;
  }
  if (state === 'QUIET') {
    const quietChunks = blockMap.QUIET;
    return quietChunks[Math.floor(Math.random() * quietChunks.length)];
  }
  if (state === 'EXPLORATION') {
    const pool = blockMap.EXPLORATION;
    if (explorationCueSequenceIndex === 0) {
      // First exploration cue after intro MUST be Day Chunk 1 (pool[0])
      explorationCueSequenceIndex = 1;
      currentExplorationBlockIndex = 0;
      return pool[0];
    } else {
      // Randomized exploration cues thereafter
      let availableIndices = pool.map((_, i) => i).filter(i => i !== currentExplorationBlockIndex);
      if (availableIndices.length === 0) availableIndices = [0];
      const chosenIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      currentExplorationBlockIndex = chosenIdx;
      return pool[chosenIdx];
    }
  }
  return blockMap.INTRO;
}

function tickToSeconds(targetTick) {
  if (!midiData || !midiData.header || !midiData.header.tempos) {
    const bpm = 150;
    return (targetTick / (PPQ * (bpm / 60)));
  }

  const sortedTempos = [...midiData.header.tempos].sort((a, b) => a.ticks - b.ticks);

  let currentTime = 0.0;
  let currentTick = 0;
  let currentBpm = sortedTempos.length > 0 ? sortedTempos[0].bpm : 150;

  for (const t of sortedTempos) {
    if (t.ticks >= targetTick) break;
    const deltaTicks = t.ticks - currentTick;
    const secondsPerTick = (60.0 / currentBpm) / PPQ;
    currentTime += deltaTicks * secondsPerTick;
    currentTick = t.ticks;
    currentBpm = t.bpm;
  }

  const deltaTicks = targetTick - currentTick;
  const secondsPerTick = (60.0 / currentBpm) / PPQ;
  currentTime += deltaTicks * secondsPerTick;

  return currentTime;
}

function scheduleMidiBlock(chosenBlock, startTime) {
  if (!chosenBlock) return 0;

  const ticksPerBar = 4 * PPQ; // 3840
  const startTicks = chosenBlock.startBar * ticksPerBar;
  const endTicks = chosenBlock.endBar * ticksPerBar;

  const blockStartSec = tickToSeconds(startTicks);
  const blockEndSec = tickToSeconds(endTicks);
  const durationSec = blockEndSec - blockStartSec;

  currentBlockStartTransportSec = startTime;
  currentBlockDurationSec = durationSec;

  if (!midiData || !midiData.tracks) return durationSec;

  midiData.tracks.forEach((track, trIdx) => {
    const isPercussion = track.channel === 9 || (track.instrument && track.instrument.family === 'drums');

    const notesInBlock = track.notes.filter(note =>
      note.ticks >= startTicks && note.ticks < endTicks
    );

    notesInBlock.forEach((note) => {
      const noteStartSec = tickToSeconds(note.ticks);
      const relativeNoteTime = noteStartSec - blockStartSec;
      const noteTime = startTime + relativeNoteTime;

      if (musicalBlockPart) {
        musicalBlockPart.add(noteTime, {
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

function scheduleNextBlockChain(startTransportSec) {
  const transport = Tone.getTransport();

  if (currentPlaybackState === 'INTRO') {
    // Intro fanfare finished -> transition cleanly into EXPLORATION (starts on Day Chunk 1)
    currentPlaybackState = 'EXPLORATION';
    explorationCueSequenceIndex = 0;
    if (melodyVolumeNode) {
      melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
    }
  } else if (currentPlaybackState === 'BATTLE_INTRO') {
    // Intro flourish complete -> transition into BATTLE loop
    currentPlaybackState = 'BATTLE';
    if (melodyVolumeNode) {
      melodyVolumeNode.volume.rampTo(-6, 0.1, Tone.now());
    }
  } else if (currentPlaybackState === 'BATTLE') {
    if (nextPlaybackState !== 'BATTLE') {
      // User requested exiting battle -> play BATTLE_OUTRO (Victory Flourish) first
      currentPlaybackState = 'BATTLE_OUTRO';
      if (melodyVolumeNode) {
        melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
      }
    } else {
      // Continue repeating main battle loop
      if (melodyVolumeNode) {
        melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
      }
    }
  } else if (currentPlaybackState === 'BATTLE_OUTRO') {
    // Victory flourish completed -> resolve directly to user's selected nextPlaybackState
    currentPlaybackState = nextPlaybackState;
    if (currentPlaybackState === 'EXPLORATION') {
      explorationCueSequenceIndex = 0;
    }
    if (melodyVolumeNode) {
      melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
    }
  } else if (currentPlaybackState === 'QUIET') {
    if (nextPlaybackState !== 'QUIET') {
      currentPlaybackState = nextPlaybackState;
      if (currentPlaybackState === 'EXPLORATION') {
        explorationCueSequenceIndex = 0;
      }
      return scheduleNextBlockChain(startTransportSec);
    }
    if (melodyVolumeNode) {
      melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
    }
  } else { // EXPLORATION
    if (nextPlaybackState !== 'EXPLORATION') {
      currentPlaybackState = nextPlaybackState;
      if (currentPlaybackState === 'EXPLORATION') {
        explorationCueSequenceIndex = 0;
      }
      return scheduleNextBlockChain(startTransportSec);
    }
    if (melodyVolumeNode) {
      melodyVolumeNode.volume.rampTo(0, 0.1, Tone.now());
    }
  }

  const chosenBlock = selectBlockForState(currentPlaybackState);
  const durationSec = scheduleMidiBlock(chosenBlock, startTransportSec);
  const nextScheduledBlockTransportSec = startTransportSec + durationSec;

  const leadTimeSec = 0.2;
  const scheduleTriggerSec = Math.max(startTransportSec, nextScheduledBlockTransportSec - leadTimeSec);

  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleNextBlockChain(nextScheduledBlockTransportSec);
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
    
    currentPlaybackState = 'INTRO';
    nextPlaybackState = newMode === 'BATTLE' ? 'BATTLE' : newMode;

    if (newMode === 'BATTLE') {
      triggerImmediateBattleOverride();
    } else {
      const durationSec = scheduleMidiBlock(blockMap.INTRO, 0);
      const nextScheduledBlockTransportSec = durationSec;
      const leadTimeSec = 0.2;
      const scheduleTriggerSec = Math.max(0, nextScheduledBlockTransportSec - leadTimeSec);
      conductorScheduleId = transport.schedule((scheduledTime) => {
        scheduleNextBlockChain(nextScheduledBlockTransportSec);
      }, scheduleTriggerSec);
    }
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

  // 1. Mute Melodies Instantly over 0.04s window so intro flourish drum components layer cleanly
  if (melodyVolumeNode) {
    melodyVolumeNode.volume.rampTo(-Infinity, 0.04, Tone.now());
  }

  // 2. Clear Part container and pending conductor schedules
  if (musicalBlockPart) {
    musicalBlockPart.clear();
  }

  activeScheduledEvents.forEach(eventId => transport.clear(eventId));
  activeScheduledEvents = [];

  if (conductorScheduleId !== null) {
    transport.clear(conductorScheduleId);
    conductorScheduleId = null;
  }

  currentPlaybackState = 'BATTLE_INTRO';
  nextPlaybackState = 'BATTLE';

  const startSec = transport.seconds;
  const durationSec = scheduleMidiBlock(blockMap.BATTLE_INTRO, startSec);

  const nextScheduledBlockTransportSec = startSec + durationSec;
  const leadTimeSec = 0.2;
  const scheduleTriggerSec = Math.max(startSec, nextScheduledBlockTransportSec - leadTimeSec);

  conductorScheduleId = transport.schedule((scheduledTime) => {
    scheduleNextBlockChain(nextScheduledBlockTransportSec);
  }, scheduleTriggerSec);
}
