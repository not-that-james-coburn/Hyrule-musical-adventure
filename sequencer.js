import * as Tone from 'tone';
import midiData from './hyrule_field_midi.json' with { type: 'json' };

// 1. Core State Configuration
const BPM = midiData.header.bpm || 90; 
const BARS_PER_BLOCK = 8;

let currentPlaybackState = 'EXPLORATION'; 
let nextPlaybackState = 'EXPLORATION';
let activeScheduledEvents = []; // Keeps track of live note triggers

// 2. Map out where the 8-bar blocks live inside your specific MIDI file (in seconds)
const blockMap = {
  EXPLORATION: [
    { start: 0, end: 16 },   // Block 1 (Example assumes 120BPM)
    { start: 16, end: 32 },  // Block 2
    { start: 32, end: 48 }   // Block 3
  ],
  BATTLE: [
    { start: 64, end: 80 },  // Battle Block 1
    { start: 80, end: 96 }   // Battle Block 2
  ],
  QUIET: [
    { start: 112, end: 128 } // Night / Rest Block
  ]
};

// 3. Virtual N64 Synthesizer setup 
// Boost polyphony max voices and lower master volume to prevent clipping
const polySynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "triangle" }, // Richer sound than a harsh sine wave
  envelope: { attack: 0.05, release: 0.1 }
}).toDestination();

polySynth.volume.value = -6; // Attenuate decibels slightly to keep it clean

// 4. The Conductor (The 8-Bar Scheduling Loop)
function setupConductor() {
  const transport = Tone.getTransport();
  transport.bpm.value = BPM;

  // Schedule a recurring event that triggers every 8 measures/bars
  transport.scheduleRepeat((time) => {
    
    // Resolve pending state updates at the 8-bar boundary loop
    currentPlaybackState = nextPlaybackState;

    // Clear notes remaining from previous schedules
    activeScheduledEvents = [];

    // Schedule the next randomized midi chunk
    scheduleMidiBlock(currentPlaybackState, time);

  }, `${BARS_PER_BLOCK}m`);
}

// Helper function to read the JSON roadmap and queue notes on the transport timeline
function scheduleMidiBlock(state, startTime) {
  const transport = Tone.getTransport();
  const pool = blockMap[state];
  const chosenBlock = pool[Math.floor(Math.random() * pool.length)];

  midiData.tracks.forEach((track) => {
    const notesInBlock = track.notes.filter(note => 
      note.time >= chosenBlock.start && note.time < chosenBlock.end
    );

    notesInBlock.forEach((note) => {
      const relativeNoteTime = note.time - chosenBlock.start;
      const exactScheduleTime = startTime + relativeNoteTime;

      const eventId = transport.schedule((scheduledTime) => {
        polySynth.triggerAttackRelease(note.name, note.duration, scheduledTime, note.velocity);
      }, exactScheduleTime);

      activeScheduledEvents.push(eventId);
    });
  });
}

// 5. UI Trigger Functions
export function getCurrentPlaybackState() {
  return currentPlaybackState;
}

export async function changeGameMode(newMode) {
  const transport = Tone.getTransport();

  // Ensure AudioContext runs, starts, and loads the loop safely
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
    console.log("Web Audio Context Activated! Audio state:", Tone.getContext().state);
    
    // Setup the timeline conductor and start it up immediately
    setupConductor();
    transport.start();
    console.log("Tone.Transport started! Transport state:", transport.state);
    
    // Force play the initial block right now so the user doesn't wait 8 bars for sound
    currentPlaybackState = newMode;
    nextPlaybackState = newMode;
    scheduleMidiBlock(newMode, transport.seconds);
    console.log(`Scheduled initial MIDI block for mode: ${newMode}`);
    return;
  }

  console.log(`Mode change requested: ${newMode}. Current mode: ${currentPlaybackState}`);
  if (newMode === 'BATTLE') {
    // Koji Kondo's COMBAT OVERRIDE: Interrupt instantly
    triggerImmediateBattleOverride();
    console.log("Immediate Battle Override triggered!");
  } else {
    // Quiet, Night, or regular Exploration modes queue up safely at the 8-bar mark
    nextPlaybackState = newMode;
    console.log(`Queued transition to ${newMode} at next 8-bar boundary`);
  }
}

function triggerImmediateBattleOverride() {
  const transport = Tone.getTransport();

  // 1. Immediately wipe out all upcoming scheduled notes from the timeline
  activeScheduledEvents.forEach(eventId => transport.clear(eventId));
  activeScheduledEvents = [];

  // 2. Pivot engine state instantly
  currentPlaybackState = 'BATTLE';
  nextPlaybackState = 'BATTLE';

  // 3. Fire up a battle block right away
  scheduleMidiBlock('BATTLE', transport.seconds + 0.05);

  // 4. Reset global Transport timeline to align with the new 8-bar battle grid phase
  transport.position = "0:0:0";
}

