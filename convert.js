const fs = require("fs");
const { Midi } = require("@tonejs/midi");

// Read the binary MIDI file
const midiData = fs.readFileSync("./hyrule_field.mid");
// Parse it into Tone.js JSON format
const midi = new Midi(midiData);

// Write out the fresh JSON file
fs.writeFileSync("./hyrule_field_midi.json", JSON.stringify(midi, null, 2));
console.log("Conversion complete! hyrule_field_midi.json has been created.");
