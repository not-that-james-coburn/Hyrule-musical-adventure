const fs = require('fs');
const path = require('path');

// Prefer the newly downloaded authentic rip from Xadra, fallback to 00_ALL.sf2 if needed
const sf2Candidates = [
  path.resolve(__dirname, 'Xadra_s_LoZ_Soundfont_2023.sf2'),
  path.resolve(__dirname, '00_ALL.sf2')
];

let sf2Path = sf2Candidates.find(p => fs.existsSync(p));
if (!sf2Path) {
  console.error('No valid SoundFont found in workspace!');
  process.exit(1);
}

const outDir = path.resolve(__dirname, 'public/soundfont');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log(`Parsing SoundFont: ${path.basename(sf2Path)}...`);
const sf2Buf = fs.readFileSync(sf2Path);
console.log(`Read ${sf2Buf.length} bytes.`);

// 1. Locate RIFF chunks
function readSubchunks(buf, start, end) {
  const chunks = {};
  let pos = start;
  while (pos < end - 8) {
    const chunkId = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    chunks[chunkId] = { pos: pos + 8, size };
    pos += 8 + size + (size % 2);
  }
  return chunks;
}

let smplPos = -1;
let smplSize = 0;
let pdtaPos = -1;
let pdtaSize = 0;

let pos = 12;
while (pos < sf2Buf.length - 8) {
  const chunkId = sf2Buf.toString('ascii', pos, pos + 4);
  const size = sf2Buf.readUInt32LE(pos + 4);
  if (chunkId === 'LIST') {
    const listType = sf2Buf.toString('ascii', pos + 8, pos + 12);
    if (listType === 'sdta') {
      const sdtaSub = readSubchunks(sf2Buf, pos + 12, pos + 8 + size);
      if (sdtaSub.smpl) {
        smplPos = sdtaSub.smpl.pos;
        smplSize = sdtaSub.smpl.size;
      }
    } else if (listType === 'pdta') {
      pdtaPos = pos + 12;
      pdtaSize = size - 4;
    }
  }
  pos += 8 + size + (size % 2);
}

if (smplPos < 0 || pdtaPos < 0) {
  console.error('Failed to locate smpl or pdta chunks in SoundFont');
  process.exit(1);
}

const pdtaSub = readSubchunks(sf2Buf, pdtaPos, pdtaPos + pdtaSize);

// 2. Parse sample headers (shdr)
const samples = [];
for (let i = 0; i < pdtaSub.shdr.size; i += 46) {
  const p = pdtaSub.shdr.pos + i;
  const name = sf2Buf.toString('ascii', p, p + 20).replace(/\0+$/, '').trim();
  const start = sf2Buf.readUInt32LE(p + 20);
  const end = sf2Buf.readUInt32LE(p + 24);
  const startloop = sf2Buf.readUInt32LE(p + 28);
  const endloop = sf2Buf.readUInt32LE(p + 32);
  const sampleRate = sf2Buf.readUInt32LE(p + 36);
  const originalPitch = sf2Buf.readUInt8(p + 40);
  const pitchCorrection = sf2Buf.readInt8(p + 41);
  const sampleType = sf2Buf.readUInt16LE(p + 44);

  samples.push({
    index: i / 46,
    name,
    start,
    end,
    startloop,
    endloop,
    sampleRate: sampleRate || 32000,
    originalPitch,
    pitchCorrection,
    sampleType
  });
}

// 3. Parse generators helper
function readGens(chunk) {
  const gens = [];
  for (let i = 0; i < chunk.size; i += 4) {
    const p = chunk.pos + i;
    gens.push({
      oper: sf2Buf.readUInt16LE(p),
      amount: sf2Buf.readInt16LE(p + 2),
      uAmount: sf2Buf.readUInt16LE(p + 2)
    });
  }
  return gens;
}
const pgens = readGens(pdtaSub.pgen);
const igens = readGens(pdtaSub.igen);

// 4. Parse bags helper
function readBags(chunk) {
  const bags = [];
  for (let i = 0; i < chunk.size; i += 4) {
    const p = chunk.pos + i;
    bags.push({
      genIndex: sf2Buf.readUInt16LE(p),
      modIndex: sf2Buf.readUInt16LE(p + 2)
    });
  }
  return bags;
}
const pbags = readBags(pdtaSub.pbag);
const ibags = readBags(pdtaSub.ibag);

// 5. Parse instruments (inst)
const instruments = [];
for (let i = 0; i < pdtaSub.inst.size; i += 22) {
  const p = pdtaSub.inst.pos + i;
  instruments.push({
    index: i / 22,
    name: sf2Buf.toString('ascii', p, p + 20).replace(/\0+$/, '').trim(),
    bagIdx: sf2Buf.readUInt16LE(p + 20)
  });
}

// 6. Parse presets (phdr)
const presets = [];
for (let i = 0; i < pdtaSub.phdr.size; i += 38) {
  const p = pdtaSub.phdr.pos + i;
  presets.push({
    index: i / 38,
    name: sf2Buf.toString('ascii', p, p + 20).replace(/\0+$/, '').trim(),
    presetNum: sf2Buf.readUInt16LE(p + 20),
    bankNum: sf2Buf.readUInt16LE(p + 22),
    bagIdx: sf2Buf.readUInt16LE(p + 24)
  });
}

function getPresetSamples(presetName) {
  const pList = presets.filter(p => p.name.toLowerCase() === presetName.toLowerCase());
  if (pList.length === 0) return [];
  const preset = pList[0];
  const startBag = preset.bagIdx;
  const endBag = presets[preset.index + 1] ? presets[preset.index + 1].bagIdx : pbags.length;

  const mappedSamples = [];
  for (let b = startBag; b < endBag; b++) {
    const startGen = pbags[b].genIndex;
    const endGen = pbags[b + 1] ? pbags[b + 1].genIndex : pgens.length;
    let instIdx = -1;
    let pKeyRange = null;
    let pStartOff = 0, pEndOff = 0, pStartLoopOff = 0, pEndLoopOff = 0;
    let pSampleModes = null;

    for (let g = startGen; g < endGen; g++) {
      if (pgens[g].oper === 41) instIdx = pgens[g].uAmount;
      if (pgens[g].oper === 43) pKeyRange = { lo: pgens[g].uAmount & 0xFF, hi: (pgens[g].uAmount >> 8) & 0xFF };
      if (pgens[g].oper === 0) pStartOff += pgens[g].amount;
      if (pgens[g].oper === 1) pEndOff += pgens[g].amount;
      if (pgens[g].oper === 2) pStartLoopOff += pgens[g].amount;
      if (pgens[g].oper === 3) pEndLoopOff += pgens[g].amount;
      if (pgens[g].oper === 4) pStartOff += pgens[g].amount * 32768;
      if (pgens[g].oper === 12) pEndOff += pgens[g].amount * 32768;
      if (pgens[g].oper === 45) pStartLoopOff += pgens[g].amount * 32768;
      if (pgens[g].oper === 50) pEndLoopOff += pgens[g].amount * 32768;
      if (pgens[g].oper === 54) pSampleModes = pgens[g].uAmount;
    }

    if (instIdx >= 0 && instIdx < instruments.length) {
      const inst = instruments[instIdx];
      const startIbag = inst.bagIdx;
      const endIbag = instruments[instIdx + 1] ? instruments[instIdx + 1].bagIdx : ibags.length;

      for (let ib = startIbag; ib < endIbag; ib++) {
        const startIgen = ibags[ib].genIndex;
        const endIgen = ibags[ib + 1] ? ibags[ib + 1].genIndex : igens.length;
        let sampleId = -1;
        let rootKey = null;
        let keyRange = pKeyRange;
        let coarseTune = 0;
        let fineTune = 0;
        let startOff = pStartOff, endOff = pEndOff, startLoopOff = pStartLoopOff, endLoopOff = pEndLoopOff;
        let sampleModes = pSampleModes;

        for (let ig = startIgen; ig < endIgen; ig++) {
          if (igens[ig].oper === 53) sampleId = igens[ig].uAmount;
          if (igens[ig].oper === 58) rootKey = igens[ig].uAmount;
          if (igens[ig].oper === 43) keyRange = { lo: igens[ig].uAmount & 0xFF, hi: (igens[ig].uAmount >> 8) & 0xFF };
          if (igens[ig].oper === 51) coarseTune = igens[ig].amount;
          if (igens[ig].oper === 52) fineTune = igens[ig].amount;
          if (igens[ig].oper === 0) startOff += igens[ig].amount;
          if (igens[ig].oper === 1) endOff += igens[ig].amount;
          if (igens[ig].oper === 2) startLoopOff += igens[ig].amount;
          if (igens[ig].oper === 3) endLoopOff += igens[ig].amount;
          if (igens[ig].oper === 4) startOff += igens[ig].amount * 32768;
          if (igens[ig].oper === 12) endOff += igens[ig].amount * 32768;
          if (igens[ig].oper === 45) startLoopOff += igens[ig].amount * 32768;
          if (igens[ig].oper === 50) endLoopOff += igens[ig].amount * 32768;
          if (igens[ig].oper === 54) sampleModes = igens[ig].uAmount;
        }

        if (sampleId >= 0 && sampleId < samples.length) {
          const smp = samples[sampleId];
          mappedSamples.push({
            presetName: preset.name,
            sampleId,
            sampleName: smp.name,
            rootKey: (rootKey !== null ? rootKey : smp.originalPitch) + coarseTune,
            keyRange: keyRange || { lo: 0, hi: 127 },
            sampleRate: smp.sampleRate,
            start: smp.start + startOff,
            end: smp.end + endOff,
            startloop: smp.startloop + startLoopOff,
            endloop: smp.endloop + endLoopOff,
            sampleModes: sampleModes !== null ? sampleModes : (smp.sampleType & 1),
            pitchCorrection: smp.pitchCorrection + fineTune
          });
        }
      }
    }
  }
  return mappedSamples;
}

// 7. Helper: create 16-bit mono PCM WAV
function createWavBuffer(pcmData, sampleRate = 32000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  pcmData.copy(buffer, 44);
  return buffer;
}

// 8. Helper: unroll loop with seamless equal-power crossfade for sustained instruments
function processSamplePcm(s, isPercussive = false, targetSustainSec = 7.0) {
  const numSamples = s.end - s.start;
  const rawPcm = new Int16Array(
    sf2Buf.buffer,
    sf2Buf.byteOffset + smplPos + s.start * 2,
    numSamples
  );

  const hasLoop = !isPercussive && (
    s.endloop > s.startloop &&
    s.startloop >= s.start &&
    s.endloop <= s.end &&
    (s.endloop - s.startloop) > 100
  );

  if (!hasLoop) {
    return Buffer.from(rawPcm.buffer, rawPcm.byteOffset, rawPcm.byteLength);
  }

  // Sustained instruments: preserve attack phase (0 to relStartLoop) ONCE,
  // then loop strictly between relStartLoop and relEndLoop up to targetSustainSec
  const relStartLoop = Math.max(0, s.startloop - s.start);
  const relEndLoop = Math.min(numSamples, s.endloop - s.start);
  const loopLen = relEndLoop - relStartLoop;

  if (loopLen <= 100) {
    return Buffer.from(rawPcm.buffer, rawPcm.byteOffset, rawPcm.byteLength);
  }

  const targetSamples = Math.max(numSamples, Math.floor(targetSustainSec * s.sampleRate));
  const out = new Int16Array(targetSamples);

  // 1. Initial attack & first loop pass: copy up to relEndLoop
  out.set(rawPcm.subarray(0, relEndLoop), 0);

  let writePos = relEndLoop;
  // Use smooth equal-power crossfade at each loop junction (up to 256 samples, or 1/4 of loop)
  const xfadeLen = Math.min(256, Math.floor(loopLen / 4));

  while (writePos < targetSamples) {
    // Equal-power crossfade between the end of previous cycle and start of new loop cycle
    for (let i = 0; i < xfadeLen && (writePos - xfadeLen + i) < targetSamples; i++) {
      const alpha = i / xfadeLen;
      const gainOld = Math.cos(alpha * 0.5 * Math.PI);
      const gainNew = Math.sin(alpha * 0.5 * Math.PI);
      const oldVal = out[writePos - xfadeLen + i];
      const newVal = rawPcm[relStartLoop + i];
      out[writePos - xfadeLen + i] = Math.round(oldVal * gainOld + newVal * gainNew);
    }

    // Copy remaining body of loop segment
    for (let i = xfadeLen; i < loopLen && writePos < targetSamples; i++) {
      out[writePos++] = rawPcm[relStartLoop + i];
    }
  }

  // 150ms gentle release fade at the very end of buffer to avoid hard cutoff
  const fadeOutSamples = Math.floor(0.15 * s.sampleRate);
  for (let i = 0; i < fadeOutSamples; i++) {
    const idx = targetSamples - fadeOutSamples + i;
    const gain = 1 - (i / fadeOutSamples);
    out[idx] = Math.round(out[idx] * gain);
  }

  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

// 9. Clean out old public/soundfont files
const existingFiles = fs.readdirSync(outDir);
existingFiles.forEach(f => {
  if (f.endsWith('.ogg') || f.endsWith('.wav')) {
    fs.unlinkSync(path.join(outDir, f));
  }
});

// 10. Define the Pertinent Instruments Mapping for Hyrule Field Sequencer
const pertinentPlan = [
  // Melody & Winds
  { preset: 'Ocarina', percussive: false, key: 'Ocarina', out: 'Ocarina.wav', pitch: 80 },
  { preset: 'Piccolo', percussive: false, key: 'Piccolo', out: 'Piccolo.wav', pitch: 91, alias: ['Flute'] },
  { preset: 'Flute Pad', percussive: false, key: 'Flute Pad', out: 'Flute_Pad.wav', pitch: 54 },
  { preset: 'Clarinet', percussive: false, key: 'Clarinet', out: 'Clarinet.wav', pitch: 72 },
  { preset: 'Oboe', percussive: false, key: 'Oboe', out: 'Oboe.wav', pitch: 76 },
  { preset: 'Bassoon', percussive: false, key: 'Bassoon', out: 'Bassoon.wav', pitch: 45 },
  { preset: 'Accordion', percussive: false, key: 'Accordion', out: 'Accordion.wav', pitch: 72 },

  // Brass
  { preset: 'French Horn', percussive: false, key: 'Horn', out: 'Horn.wav', pitch: 60 },
  { preset: 'Trumpet (Alto)', percussive: false, key: 'Trumpet', out: 'Trumpet.wav', pitch: 72 },
  { preset: 'Trumpet (Soprano)', percussive: false, key: 'Trumpet Soprano', out: 'Trumpet_Soprano.wav', pitch: 67 },
  { preset: 'Trombone', percussive: false, key: 'Trombone', out: 'Trombone.wav', pitch: 40 },

  // Strings & Pad
  {
    preset: 'Strings',
    percussive: false,
    multi: [
      { filterRoot: 36, key: 'Strings Low', out: 'Strings_Low.wav', pitch: 36 },
      { filterRoot: 56, key: 'Strings Middle', out: 'Strings_Middle.wav', pitch: 56 },
      { filterRoot: 68, key: 'Strings High', out: 'Strings_High.wav', pitch: 68, alias: ['Strings'] }
    ]
  },
  { preset: 'String Pad', percussive: false, key: 'String Pad', out: 'String_Pad.wav', pitch: 65, alias: ['Pad'] },
  {
    preset: 'Pizzicato Strings',
    percussive: true,
    multi: [
      { filterRoot: 47, key: 'Pizzicato Low', out: 'Pizzicato_Low.wav', pitch: 47 },
      { filterRoot: 70, key: 'Pizzicato High', out: 'Pizzicato_High.wav', pitch: 70 }
    ]
  },
  { preset: 'Guitar (E. Bass)', percussive: true, key: 'Guitar Bass', out: 'Guitar_Bass.wav', pitch: 41 },

  // Keyboards & Plucked
  {
    preset: 'Piano',
    percussive: true,
    multi: [
      { filterRoot: 45, key: 'Piano Low', out: 'Piano_Low.wav', pitch: 45 },
      { filterRoot: 60, key: 'Piano Middle', out: 'Piano_Middle.wav', pitch: 60, alias: ['Piano'] },
      { filterRoot: 72, key: 'Piano High', out: 'Piano_High.wav', pitch: 72 }
    ]
  },
  {
    preset: "Sheik's Harp",
    percussive: true,
    multi: [
      { filterRoot: 65, key: 'Harp Low', out: 'Harp_Low.wav', pitch: 65 },
      { filterRoot: 77, key: 'Harp High', out: 'Harp_High.wav', pitch: 77, alias: ['Harp'] }
    ]
  },
  {
    preset: 'Marimba',
    percussive: true,
    multi: [
      { filterRoot: 62, key: 'Marimba Low', out: 'Marimba_Low.wav', pitch: 62 },
      { filterRoot: 74, key: 'Marimba High', out: 'Marimba_High.wav', pitch: 74 }
    ]
  },
  { preset: 'Glockenspiel', percussive: true, key: 'Glockenspiel', out: 'Glockenspiel.wav', pitch: 83, alias: ['Bell'] },

  // Percussion & Drums
  { preset: 'PERC Timpani', percussive: true, key: 'Timpani', out: 'Timpani.wav', pitch: 60, alias: ['Timpani High', 'Timpani Low'] },
  {
    preset: 'PERC Snares/Crash',
    percussive: true,
    multi: [
      { filterRoot: 48, key: 'Snare Low', out: 'Snare_Low.wav', pitch: 48 },
      { filterRoot: 60, key: 'Snare High', out: 'Snare_High.wav', pitch: 60, alias: ['Snare'] },
      { filterRoot: 72, key: 'Cymbal Hit', out: 'Cymbal_Hit.wav', pitch: 72 }
    ]
  },
  { preset: 'PERC Hi Hat', percussive: true, key: 'Hi Hat', out: 'Hi_Hat.wav', pitch: 60 },
  { preset: 'PERC Low Drum', percussive: true, key: 'Kick Drum', out: 'Kick_Drum.wav', pitch: 36, alias: ['Ethnic Kick'] },
  {
    preset: 'PERC Bongos',
    percussive: true,
    multi: [
      { filterRoot: 36, key: 'Bent Drum', out: 'Bent_Drum.wav', pitch: 48 },
      { filterRoot: 41, key: 'Ethnic Drum Kit 1', out: 'Ethnic_Drum_Kit_1.wav', pitch: 60 },
      { filterRoot: 47, key: 'Ethnic Drum Kit 2', out: 'Ethnic_Drum_Kit_2.wav', pitch: 72 }
    ]
  },

  // Atmospheric Environmental Sound Effects
  { preset: 'MISC Wolfos Howl', percussive: true, key: 'Wolfos Howl', out: 'Wolfos_Howl.wav', pitch: 72 },
  { preset: 'MISC Tower Bell', percussive: true, key: 'Tower Bell', out: 'Tower_Bell.wav', pitch: 66 },
  { preset: 'AMB Danger!', percussive: true, key: 'Danger Sting', out: 'Danger_Sting.wav', pitch: 66 },
  { preset: 'AMB Howling Wind', percussive: false, key: 'Prairie Wind', out: 'Prairie_Wind.wav', pitch: 66 }
];

const manifest = {};
let extractedCount = 0;

for (const plan of pertinentPlan) {
  const pSamples = getPresetSamples(plan.preset);
  if (pSamples.length === 0) {
    console.warn(`Warning: No samples found for preset "${plan.preset}"`);
    continue;
  }

  if (plan.multi) {
    for (const sub of plan.multi) {
      // Find matching sample closest to filterRoot
      let match = pSamples.find(s => s.rootKey === sub.filterRoot);
      if (!match) match = pSamples[0];

      const outPath = path.join(outDir, sub.out);
      const pcm = processSamplePcm(match, plan.percussive);
      const wav = createWavBuffer(pcm, match.sampleRate, 1, 16);
      fs.writeFileSync(outPath, wav);

      manifest[sub.key] = {
        file: `soundfont/${sub.out}`,
        pitch: sub.pitch,
        sampleRate: match.sampleRate,
        cents: match.pitchCorrection || 0
      };
      extractedCount++;

      if (sub.alias) {
        sub.alias.forEach(a => {
          manifest[a] = manifest[sub.key];
        });
      }
      console.log(`Extracted: [${plan.preset}] -> ${sub.key} (${sub.out}, root=${sub.pitch})`);
    }
  } else {
    const match = pSamples[0];
    const outPath = path.join(outDir, plan.out);
    const pcm = processSamplePcm(match, plan.percussive);
    const wav = createWavBuffer(pcm, match.sampleRate, 1, 16);
    fs.writeFileSync(outPath, wav);

    manifest[plan.key] = {
      file: `soundfont/${plan.out}`,
      pitch: plan.pitch,
      sampleRate: match.sampleRate,
      cents: match.pitchCorrection || 0
    };
    extractedCount++;

    if (plan.alias) {
      plan.alias.forEach(a => {
        manifest[a] = manifest[plan.key];
      });
    }
    console.log(`Extracted: [${plan.preset}] -> ${plan.key} (${plan.out}, root=${plan.pitch})`);
  }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`\n========================================`);
console.log(`SUCCESS: Extracted ${extractedCount} authentic instruments to ${outDir}`);
console.log(`Generated manifest.json with ${Object.keys(manifest).length} mapped keys/aliases.`);
console.log(`========================================\n`);
