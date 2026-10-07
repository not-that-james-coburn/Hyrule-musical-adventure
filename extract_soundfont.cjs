const fs = require('fs');
const path = require('path');

const sf2Path = path.resolve(__dirname, '00_ALL.sf2');
const outDir = path.resolve(__dirname, 'public/soundfont');

if (!fs.existsSync(sf2Path)) {
  console.error('00_ALL.sf2 not found at', sf2Path);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const sf2Buf = fs.readFileSync(sf2Path);
console.log('Read 00_ALL.sf2, size:', sf2Buf.length, 'bytes');

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
  console.error('Failed to locate smpl or pdta chunks');
  process.exit(1);
}

console.log(`smpl offset=${smplPos}, size=${smplSize}`);
console.log(`pdta offset=${pdtaPos}, size=${pdtaSize}`);

const pdtaSub = readSubchunks(sf2Buf, pdtaPos, pdtaPos + pdtaSize);
const shdr = pdtaSub.shdr;

if (!shdr) {
  console.error('shdr chunk missing from pdta');
  process.exit(1);
}

// 2. Parse sample headers
const samples = [];
for (let i = 0; i < shdr.size; i += 46) {
  const p = shdr.pos + i;
  const name = sf2Buf.toString('ascii', p, p + 20).replace(/\0+$/, '').trim();
  const start = sf2Buf.readUInt32LE(p + 20);
  const end = sf2Buf.readUInt32LE(p + 24);
  const startloop = sf2Buf.readUInt32LE(p + 28);
  const endloop = sf2Buf.readUInt32LE(p + 32);
  const sampleRate = sf2Buf.readUInt32LE(p + 36);
  const originalPitch = sf2Buf.readUInt8(p + 40);
  const pitchCorrection = sf2Buf.readInt8(p + 41);
  const sampleType = sf2Buf.readUInt16LE(p + 44);

  if (name && name !== 'EOS' && end > start) {
    samples.push({
      index: i / 46,
      name,
      start,
      end,
      startloop,
      endloop,
      sampleRate,
      originalPitch,
      pitchCorrection,
      sampleType
    });
  }
}

console.log(`Parsed ${samples.length} valid sample headers from SF2`);

// 3. Helper: create 16-bit mono PCM WAV
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

// 4. Helper: unroll loop with seamless crossfade for sustained instruments
function processSamplePcm(s, targetSustainSec = 4.5) {
  const numSamples = s.end - s.start;
  const rawPcm = new Int16Array(
    sf2Buf.buffer,
    sf2Buf.byteOffset + smplPos + s.start * 2,
    numSamples
  );

  const hasLoop = (
    s.endloop > s.startloop &&
    s.startloop >= s.start &&
    s.endloop <= s.end &&
    (s.endloop - s.startloop) > 100
  );

  // Non-looping or naturally decaying percussive instruments: export original audio
  const nonLoopInstruments = [
    'Piano', 'Harp', 'Marimba', 'Pizzicato', 'Timpani', 'Snare',
    'Cymbal', 'Beat Kit', 'Ethnic Drum', 'Bell', 'Glockenspiel',
    'Shaker', 'Cowbell', 'Clap', 'Chant', 'Clocktown', 'Lute',
    'Kalimba', 'Bent Drum', 'Conga', 'Cuica', 'Gong'
  ];

  const isPercussive = nonLoopInstruments.some(prefix => s.name.startsWith(prefix));

  if (!hasLoop || isPercussive) {
    return Buffer.from(rawPcm.buffer, rawPcm.byteOffset, rawPcm.byteLength);
  }

  // Sustained instruments: unroll loop smoothly up to targetSustainSec
  const relStartLoop = s.startloop - s.start;
  const relEndLoop = s.endloop - s.start;
  const loopLen = relEndLoop - relStartLoop;
  const targetSamples = Math.max(numSamples, Math.floor(targetSustainSec * s.sampleRate));

  const out = new Int16Array(targetSamples);
  out.set(rawPcm.subarray(0, relEndLoop), 0);

  let writePos = relEndLoop;
  const xfadeLen = Math.min(128, Math.floor(loopLen / 4));

  while (writePos < targetSamples) {
    const remaining = targetSamples - writePos;
    const toCopy = Math.min(loopLen - xfadeLen, remaining);

    // Smooth linear crossfade at splice
    for (let i = 0; i < xfadeLen && (writePos - xfadeLen + i) < targetSamples; i++) {
      const alpha = i / xfadeLen;
      const oldVal = out[writePos - xfadeLen + i];
      const newVal = rawPcm[relStartLoop + i];
      out[writePos - xfadeLen + i] = Math.round(oldVal * (1 - alpha) + newVal * alpha);
    }

    // Copy loop segment
    for (let i = xfadeLen; i < loopLen && writePos < targetSamples; i++) {
      out[writePos++] = rawPcm[relStartLoop + i];
    }
  }

  // 100ms gentle release fade at the very end to prevent abrupt DC cut
  const fadeOutSamples = Math.floor(0.1 * s.sampleRate);
  for (let i = 0; i < fadeOutSamples; i++) {
    const idx = targetSamples - fadeOutSamples + i;
    const gain = 1 - (i / fadeOutSamples);
    out[idx] = Math.round(out[idx] * gain);
  }

  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

// 5. Clean out old public/soundfont files
const existingFiles = fs.readdirSync(outDir);
existingFiles.forEach(f => {
  if (f.endsWith('.ogg') || f.endsWith('.wav')) {
    fs.unlinkSync(path.join(outDir, f));
  }
});

// 6. Extract samples and build manifest
const manifest = {};

samples.forEach((s) => {
  const safeFilename = s.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.wav';
  const outPath = path.join(outDir, safeFilename);

  const pcmBuf = processSamplePcm(s);
  const wavBuf = createWavBuffer(pcmBuf, s.sampleRate, 1, 16);

  fs.writeFileSync(outPath, wavBuf);

  // Manifest key matches sample name
  manifest[s.name] = {
    file: `soundfont/${safeFilename}`,
    pitch: s.originalPitch,
    sampleRate: s.sampleRate,
    cents: s.pitchCorrection
  };
});

// Special drum kit mappings for direct convenience
if (manifest['Beat Kit 1']) {
  manifest['Kick Drum'] = {
    file: manifest['Beat Kit 1'].file,
    pitch: 36, // C2 kick standard
    sampleRate: manifest['Beat Kit 1'].sampleRate
  };
}
if (manifest['Ethnic Drum Kit 2']) {
  manifest['Ethnic Kick'] = {
    file: manifest['Ethnic Drum Kit 2'].file,
    pitch: 36,
    sampleRate: manifest['Ethnic Drum Kit 2'].sampleRate
  };
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Successfully extracted ${Object.keys(manifest).length} samples into ${outDir}`);
console.log('manifest.json created successfully.');
