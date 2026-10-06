import * as Tone from 'tone';
import {
  changeGameMode,
  getCurrentPlaybackState,
  getPendingStateChange,
  getActiveCueInfo,
  getStreamNotes,
  whenAudioLoaded,
  sequencer,
  HyruleSequencer,
  setMixerParameter,
  setMixerPreset,
  getMixerSettings
} from './sequencer.js';

document.addEventListener('DOMContentLoaded', () => {
  const modeButtons = document.querySelectorAll('.pad-btn');
  const playOverlay = document.getElementById('play-overlay');
  const startBtn = document.getElementById('start-btn');
  const startBtnLabel = document.getElementById('start-btn-label');
  const loadingIndicator = document.getElementById('loading-indicator');
  const cueDisplayEl = document.getElementById('cue-display');
  const cueSubnameEl = document.getElementById('cue-subname');
  const cueNextDisplayEl = document.getElementById('cue-next-display');
  const hudNextTagEl = document.getElementById('hud-next-tag');
  const cuePendingTextEl = document.getElementById('cue-pending-text');
  const cueMeasureCounterEl = document.getElementById('cue-measure-counter');
  const canvas = document.getElementById('note-stream-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // Mixer DOM Elements
  const mixerToggleBtn = document.getElementById('mixer-toggle-btn');
  const mixerCloseBtn = document.getElementById('mixer-close-btn');
  const mixerDrawer = document.getElementById('mixer-drawer');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const sliderWarmth = document.getElementById('slider-warmth');
  const sliderTreble = document.getElementById('slider-treble');
  const sliderReverb = document.getElementById('slider-reverb');
  const sliderVolume = document.getElementById('slider-volume');
  const valWarmth = document.getElementById('val-warmth');
  const valTreble = document.getElementById('val-treble');
  const valReverb = document.getElementById('val-reverb');
  const valVolume = document.getElementById('val-volume');

  let hasStarted = false;

  // 1. Audio Loading Lifecycle
  whenAudioLoaded()
    .then(() => {
      if (loadingIndicator) {
        loadingIndicator.innerText = "✓ Ready";
        loadingIndicator.className = "status-pill ready";
      }
      if (startBtn && !hasStarted) {
        startBtn.disabled = false;
        if (startBtnLabel) startBtnLabel.innerText = "▶ START ADVENTURE";
        startBtn.classList.add('ready');
      }
    })
    .catch(err => {
      console.error("Error loading soundfont samples:", err);
      if (loadingIndicator) {
        loadingIndicator.innerText = "❌ Sample Error";
        loadingIndicator.className = "status-pill error";
      }
      if (startBtnLabel) startBtnLabel.innerText = "ERROR LOADING";
    });

  // 2. Play Button Overlay Tap
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (startBtn.disabled || hasStarted) return;
      hasStarted = true;

      // Unlock AudioContext & start sequencer with Morning & Intro cues
      await Tone.start();
      await changeGameMode('EXPLORATION');

      // Fade out overlay with smooth animation
      if (playOverlay) {
        playOverlay.classList.add('fade-out');
        setTimeout(() => {
          playOverlay.style.display = 'none';
        }, 450);
      }

      // Unlock mode buttons
      modeButtons.forEach(btn => (btn.disabled = false));
    });
  }

  // 3. Handle Mode Button Clicks
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled || !hasStarted) return;
      const selectedMode = btn.getAttribute('data-mode');

      // Signal mode change to sequencer
      changeGameMode(selectedMode);

      // Refresh button active highlights
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 4. Mixer Drawer Toggle & Controls
  if (mixerToggleBtn && mixerDrawer) {
    mixerToggleBtn.addEventListener('click', () => {
      const isHidden = mixerDrawer.style.display === 'none';
      mixerDrawer.style.display = isHidden ? 'block' : 'none';
      mixerToggleBtn.classList.toggle('active', isHidden);
    });
  }

  if (mixerCloseBtn && mixerDrawer) {
    mixerCloseBtn.addEventListener('click', () => {
      mixerDrawer.style.display = 'none';
      if (mixerToggleBtn) mixerToggleBtn.classList.remove('active');
    });
  }

  // Real-time Slider Adjustments
  if (sliderWarmth) {
    sliderWarmth.addEventListener('input', (e) => {
      const hz = parseFloat(e.target.value);
      setMixerParameter('warmth', hz);
      if (valWarmth) valWarmth.innerText = (hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : hz + ' Hz');
      presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  if (sliderTreble) {
    sliderTreble.addEventListener('input', (e) => {
      const db = parseFloat(e.target.value);
      setMixerParameter('treble', db);
      if (valTreble) valTreble.innerText = (db > 0 ? '+' : '') + db.toFixed(1) + ' dB';
      presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  if (sliderReverb) {
    sliderReverb.addEventListener('input', (e) => {
      const pct = parseFloat(e.target.value);
      setMixerParameter('reverb', pct / 100);
      if (valReverb) valReverb.innerText = pct + '%';
      presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  if (sliderVolume) {
    sliderVolume.addEventListener('input', (e) => {
      const db = parseFloat(e.target.value);
      setMixerParameter('volume', db);
      if (valVolume) valVolume.innerText = (db > 0 ? '+' : '') + db.toFixed(1) + ' dB';
      presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  // Mixer Presets
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      setMixerPreset(preset);
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Sync slider UI controls with newly active preset
      const settings = getMixerSettings();
      if (settings) {
        if (sliderWarmth) {
          sliderWarmth.value = settings.warmth;
          if (valWarmth) valWarmth.innerText = (settings.warmth >= 1000 ? (settings.warmth / 1000).toFixed(1) + ' kHz' : settings.warmth + ' Hz');
        }
        if (sliderTreble) {
          sliderTreble.value = settings.treble;
          if (valTreble) valTreble.innerText = (settings.treble > 0 ? '+' : '') + Number(settings.treble).toFixed(1) + ' dB';
        }
        if (sliderReverb) {
          const pct = Math.round(settings.reverbWet * 100);
          sliderReverb.value = pct;
          if (valReverb) valReverb.innerText = pct + '%';
        }
        if (sliderVolume) {
          sliderVolume.value = settings.volume;
          if (valVolume) valVolume.innerText = (settings.volume > 0 ? '+' : '') + Number(settings.volume).toFixed(1) + ' dB';
        }
      }
    });
  });

  window.Tone = Tone;
  window.sequencer = sequencer;
  window.HyruleSequencer = HyruleSequencer;

  // -------------------------------------------------------------
  // CONTINUOUS RIGHT-TO-LEFT STREAMING NOTE VISUALIZER (CANVAS)
  // -------------------------------------------------------------
  const PLAYHEAD_X = 64; // Compact playhead X position for mobile
  const PIXELS_PER_SEC = 100; // Conveyor rate

  // Setup HiDPI Canvas Scaling
  function setupCanvasDPI() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const targetWidth = rect.width || 600;
    const targetHeight = 175;

    canvas.width = targetWidth * dpr;
    canvas.height = targetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', setupCanvasDPI);
  setupCanvasDPI();

  // Lane geometry definitions (compact 175px height)
  const LANES = {
    melody: { top: 18, bottom: 74, height: 56, label: 'MELODY' },
    bass: { top: 80, bottom: 126, height: 46, label: 'BASS' },
    percussion: { top: 132, bottom: 172, height: 40, label: 'PERC' }
  };

  function getNoteColors(note) {
    const mode = note.mode || 'EXPLORATION';
    const track = note.trackType || 'melody';

    if (track === 'melody') {
      if (mode === 'EXPLORATION') {
        return { fill: '#4ade80', stroke: '#86efac', glow: 'rgba(74, 222, 128, 0.55)', hit: '#ffffff' };
      }
      if (mode === 'QUIET') {
        return { fill: '#38bdf8', stroke: '#93c5fd', glow: 'rgba(56, 189, 248, 0.55)', hit: '#ffffff' };
      }
      // BATTLE
      return { fill: '#ef4444', stroke: '#fca5a5', glow: 'rgba(239, 68, 68, 0.6)', hit: '#ffffff' };
    }

    if (track === 'bass') {
      if (mode === 'EXPLORATION') {
        return { fill: '#10b981', stroke: '#34d399', glow: 'rgba(16, 185, 129, 0.4)', hit: '#a7f3d0' };
      }
      if (mode === 'QUIET') {
        return { fill: '#6366f1', stroke: '#818cf8', glow: 'rgba(99, 102, 241, 0.4)', hit: '#c7d2fe' };
      }
      // BATTLE
      return { fill: '#f97316', stroke: '#fb923c', glow: 'rgba(249, 115, 22, 0.45)', hit: '#fed7aa' };
    }

    // Percussion
    if (mode === 'EXPLORATION') {
      return { fill: '#a3e635', stroke: '#bef264', glow: 'rgba(163, 230, 53, 0.4)', hit: '#fef08a' };
    }
    if (mode === 'QUIET') {
      return { fill: '#06b6d4', stroke: '#67e8f9', glow: 'rgba(6, 182, 212, 0.4)', hit: '#e0f2fe' };
    }
    // BATTLE
    return { fill: '#f43f5e', stroke: '#fda4af', glow: 'rgba(244, 63, 94, 0.45)', hit: '#ffe4e6' };
  }

  function getNoteYAndHeight(note) {
    const track = note.trackType || 'melody';

    if (track === 'melody') {
      const lane = LANES.melody;
      // Map MIDI pitch range [52 (E3) to 88 (E6)]
      const minMidi = 52;
      const maxMidi = 88;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 5;
      const noteY = (lane.bottom - 3) - norm * (lane.height - 10) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'bass') {
      const lane = LANES.bass;
      // Map MIDI pitch range [28 (E1) to 55 (G3)]
      const minMidi = 28;
      const maxMidi = 55;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 6;
      const noteY = (lane.bottom - 3) - norm * (lane.height - 11) - noteH;
      return { y: noteY, h: noteH };
    }

    // Percussion
    const lane = LANES.percussion;
    const pitch = note.midi;
    let noteY = lane.bottom - 12;
    let noteH = 7;

    if (pitch === 35 || pitch === 36) {
      // Kick drum
      noteY = lane.bottom - 10;
      noteH = 7;
    } else if (pitch === 38 || pitch === 40) {
      // Snare
      noteY = lane.top + 16;
      noteH = 6;
    } else if (pitch === 42 || pitch === 44 || pitch === 46) {
      // Hi-hat
      noteY = lane.top + 4;
      noteH = 4;
    } else {
      // Toms / Timpani
      noteY = lane.top + 10;
      noteH = 6;
    }

    return { y: noteY, h: noteH };
  }

  // Animation Loop: Renders 60 FPS continuous right-to-left note conveyor with latency sync
  function renderVisualizer() {
    const transport = Tone.getTransport();
    const isPlaying = transport && (transport.state === 'started' || transport.state === 'running');

    // Audio-to-Visual Latency Sync Compensation:
    // Aligns the visual note hit on PLAYHEAD_X with the exact physical sound from speakers
    let visualizerSec = 0;
    if (isPlaying) {
      const rawCtx = Tone.getContext().rawContext;
      const outputLat = (rawCtx && typeof rawCtx.outputLatency === 'number') ? rawCtx.outputLatency : 0.035;
      const baseLat = (rawCtx && typeof rawCtx.baseLatency === 'number') ? rawCtx.baseLatency : 0.02;
      const audioLatency = outputLat + baseLat + 0.015;
      visualizerSec = Math.max(0, transport.seconds - audioLatency);
    }

    const cueInfo = getActiveCueInfo();

    // 1. Update UI Status & Cue Information Display (Zero Layout Shift)
    updateUIElements(cueInfo, isPlaying);

    // 2. Draw Note Stream Canvas
    if (canvas && ctx) {
      const cssWidth = canvas.getBoundingClientRect().width || 600;
      const cssHeight = 175;

      // Clear Canvas Background
      ctx.fillStyle = '#080c10';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Draw background grid & lane separators
      drawCanvasBackground(ctx, cssWidth, cssHeight, visualizerSec);

      // Draw streaming notes traveling right to left
      const streamNotes = getStreamNotes();
      let activeNotesHitCount = 0;

      for (let i = 0; i < streamNotes.length; i++) {
        const note = streamNotes[i];
        const noteX = PLAYHEAD_X + (note.transportTime - visualizerSec) * PIXELS_PER_SEC;
        const noteW = Math.max(5, (note.duration * PIXELS_PER_SEC) - 2);

        // Cull notes outside visible viewport
        if (noteX + noteW < 0 || noteX > cssWidth + 60) {
          continue;
        }

        const { y, h } = getNoteYAndHeight(note);
        const colors = getNoteColors(note);

        const isCurrentlyPlaying = isPlaying &&
          (note.transportTime <= visualizerSec) &&
          ((note.transportTime + note.duration) >= visualizerSec);

        if (isCurrentlyPlaying) {
          activeNotesHitCount++;
        }

        ctx.save();

        // Alpha fade out as notes pass playhead towards left margin
        if (noteX < PLAYHEAD_X) {
          const fadeAlpha = Math.max(0.12, (noteX + noteW) / (PLAYHEAD_X + noteW));
          ctx.globalAlpha = fadeAlpha;
        }

        ctx.fillStyle = isCurrentlyPlaying ? colors.hit : colors.fill;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;

        if (isCurrentlyPlaying) {
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = 12;
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(noteX, y, noteW, h, 2.5);
        } else {
          ctx.rect(noteX, y, noteW, h);
        }
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // Draw Playhead line and active collision sparks
      drawPlayhead(ctx, cssHeight, activeNotesHitCount > 0, cueInfo);
    }

    requestAnimationFrame(renderVisualizer);
  }

  function drawCanvasBackground(ctx, width, height, currentTransportSec) {
    // 1. Draw Lane Backdrops & Dividers
    Object.values(LANES).forEach((lane, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, lane.top, width, lane.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lane.bottom);
      ctx.lineTo(width, lane.bottom);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(lane.label, 8, lane.top + 10);
    });

    // 2. Measure / Bar Grid Lines scrolling right-to-left (1 bar = 1.6s at 150 BPM)
    const barSec = 1.6;
    const startBarIdx = Math.floor(currentTransportSec / barSec) - 1;
    const endBarIdx = startBarIdx + Math.ceil(width / (barSec * PIXELS_PER_SEC)) + 3;

    ctx.save();
    for (let b = Math.max(0, startBarIdx); b <= endBarIdx; b++) {
      const barTime = b * barSec;
      const barX = PLAYHEAD_X + (barTime - currentTransportSec) * PIXELS_PER_SEC;

      if (barX >= 0 && barX <= width + 40) {
        const is8BarBoundary = (b % 8 === 0);

        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, height);

        if (is8BarBoundary) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = '7.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText('8-BAR', barX + 3, 11);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawPlayhead(ctx, height, isHitting, cueInfo) {
    ctx.save();

    const hitColor = (cueInfo.cueMode === 'BATTLE')
      ? '#ef4444'
      : (cueInfo.cueMode === 'QUIET' ? '#38bdf8' : '#4ade80');

    ctx.strokeStyle = isHitting ? '#ffffff' : hitColor;
    ctx.lineWidth = isHitting ? 2 : 1.5;

    if (isHitting) {
      ctx.shadowColor = hitColor;
      ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X, 0);
    ctx.lineTo(PLAYHEAD_X, height);
    ctx.stroke();

    // Playhead top marker
    ctx.fillStyle = isHitting ? '#ffffff' : hitColor;
    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X - 4, 0);
    ctx.lineTo(PLAYHEAD_X + 4, 0);
    ctx.lineTo(PLAYHEAD_X, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function updateUIElements(cueInfo, isPlaying) {
    // 1. Active 8-Bar Cue ID display
    if (cueDisplayEl) {
      const modeIcon = (cueInfo.cueMode === 'BATTLE')
        ? '⚔️'
        : (cueInfo.cueMode === 'QUIET' ? '🌙' : '☀️');

      cueDisplayEl.innerText = `${modeIcon} ${cueInfo.cueId}`;

      if (cueInfo.cueMode === 'BATTLE') {
        cueDisplayEl.className = "hud-title mode-battle";
      } else if (cueInfo.cueMode === 'QUIET') {
        cueDisplayEl.className = "hud-title mode-quiet";
      } else {
        cueDisplayEl.className = "hud-title mode-exploration";
      }
    }

    // 2. Motif name & inline transition queue status (Zero Layout Shift)
    if (cueSubnameEl) {
      cueSubnameEl.innerText = cueInfo.cueName || "Hyrule Overworld";
    }

    if (cuePendingTextEl) {
      if (cueInfo.pendingMode) {
        cuePendingTextEl.style.display = 'inline';
        cuePendingTextEl.innerText = ` • ⏳ Queued: ${cueInfo.pendingMode} (Bar 8 Downbeat)`;
      } else {
        cuePendingTextEl.style.display = 'none';
      }
    }

    // 3. Next Queued 8-Bar Cue ID display
    if (cueNextDisplayEl) {
      if (cueInfo.upcomingCueId) {
        const nextIcon = (cueInfo.upcomingCueMode === 'BATTLE')
          ? '⚔️'
          : (cueInfo.upcomingCueMode === 'QUIET' ? '🌙' : '☀️');
        cueNextDisplayEl.innerText = `${nextIcon} ${cueInfo.upcomingCueId.replace(/\s*\(Bars.*?\)/, '')}`;

        if (cueInfo.upcomingCueMode === 'BATTLE') {
          cueNextDisplayEl.className = "hud-title next-title mode-battle";
        } else if (cueInfo.upcomingCueMode === 'QUIET') {
          cueNextDisplayEl.className = "hud-title next-title mode-quiet";
        } else {
          cueNextDisplayEl.className = "hud-title next-title mode-exploration";
        }
      } else {
        cueNextDisplayEl.innerText = "--";
      }
    }

    // 4. Next Tag / Queued Tag state
    if (hudNextTagEl) {
      if (cueInfo.pendingMode) {
        hudNextTagEl.innerText = "QUEUED";
        hudNextTagEl.className = "hud-tag queued";
      } else {
        hudNextTagEl.innerText = "NEXT";
        hudNextTagEl.className = "hud-tag muted";
      }
    }

    // 5. Measure Counter within 8-bar block
    if (cueMeasureCounterEl) {
      if (isPlaying) {
        const barInBlock = Math.min(8, Math.floor(cueInfo.timeInBlock / 1.6) + 1);
        cueMeasureCounterEl.innerText = `Bar ${barInBlock}/8`;
      } else {
        cueMeasureCounterEl.innerText = "Ready";
      }
    }
  }

  // Start the 60 FPS animation loop
  renderVisualizer();
});
