import * as Tone from 'tone';
import {
  changeGameMode,
  getCurrentPlaybackState,
  getPendingStateChange,
  getActiveCueInfo,
  getStreamNotes,
  getMeasureLines,
  whenAudioLoaded,
  sequencer,
  HyruleSequencer,
  setMixerParameter,
  setMixerPreset,
  getMixerSettings,
  toggleLinkMovement,
  setLinkMovement,
  getLinkMovementState,
  playDangerSting,
  playTowerBell,
  playWolfosHowl,
  playPrairieWind,
  setRandomizer,
  toggleRandomizer,
  isRandomizerEnabled,
  getRandomizerInfo,
  setAutoCycle,
  toggleAutoCycle,
  isAutoCycleEnabled
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

  // Link Movement Interactive Controls
  const movementToggleBtn = document.getElementById('movement-toggle-btn');
  const movementIcon = document.getElementById('movement-icon');
  const movementBtnText = document.getElementById('movement-btn-text');

  // Mixer DOM Elements
  const mixerToggleBtn = document.getElementById('mixer-toggle-btn');
  const mixerCloseBtn = document.getElementById('mixer-close-btn');
  const mixerDrawer = document.getElementById('mixer-drawer');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const sliderWarmth = document.getElementById('slider-warmth');
  const sliderTreble = document.getElementById('slider-treble');
  const sliderReverb = document.getElementById('slider-reverb');
  const sliderChorus = document.getElementById('slider-chorus');
  const sliderVolume = document.getElementById('slider-volume');
  const valWarmth = document.getElementById('val-warmth');
  const valTreble = document.getElementById('val-treble');
  const valReverb = document.getElementById('val-reverb');
  const valChorus = document.getElementById('val-chorus');
  const valVolume = document.getElementById('val-volume');

  // Ambient Environmental SFX Controls
  const sfxBellBtn = document.getElementById('sfx-bell-btn');
  const sfxHowlBtn = document.getElementById('sfx-howl-btn');
  const sfxStingBtn = document.getElementById('sfx-sting-btn');
  const sfxWindBtn = document.getElementById('sfx-wind-btn');
  const sfxButtons = [sfxBellBtn, sfxHowlBtn, sfxStingBtn, sfxWindBtn].filter(Boolean);

  function flashBtn(btn) {
    if (!btn) return;
    btn.classList.add('flash-active');
    setTimeout(() => btn.classList.remove('flash-active'), 250);
  }

  let hasStarted = false;

  // Random Mode Cycling DOM Elements
  const randomToggleBtn = document.getElementById('random-toggle-btn') || document.getElementById('cycle-toggle-btn');
  const randomToggleLabel = document.getElementById('random-toggle-label') || document.getElementById('cycle-toggle-label');

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

  function updateMovementUi(state) {
    if (!movementToggleBtn) return;
    if (state === 'RUNNING') {
      movementToggleBtn.className = 'movement-btn running';
      if (movementIcon) movementIcon.innerText = '🏃';
      if (movementBtnText) movementBtnText.innerText = 'LINK RUNNING (FULL MELODY)';
    } else {
      movementToggleBtn.className = 'movement-btn idle';
      if (movementIcon) movementIcon.innerText = '🧍';
      if (movementBtnText) movementBtnText.innerText = 'LINK STANDING STILL (PASTORAL HARP)';
    }
  }

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

      // Unlock mode buttons, movement button, randomizer button & ambient SFX buttons
      modeButtons.forEach(btn => (btn.disabled = false));
      sfxButtons.forEach(btn => (btn.disabled = false));
      if (randomToggleBtn) randomToggleBtn.disabled = false;
      if (movementToggleBtn) {
        movementToggleBtn.disabled = false;
        updateMovementUi(getLinkMovementState());
      }
    });
  }

  // 3. Link Movement Button Tap
  if (movementToggleBtn) {
    movementToggleBtn.addEventListener('click', () => {
      if (movementToggleBtn.disabled || !hasStarted) return;
      const next = toggleLinkMovement();
      updateMovementUi(next);
    });
  }

  // 4. Ambient Environmental SFX Buttons Tap
  if (sfxBellBtn) {
    sfxBellBtn.addEventListener('click', () => {
      if (sfxBellBtn.disabled || !hasStarted) return;
      flashBtn(sfxBellBtn);
      playTowerBell();
    });
  }
  if (sfxHowlBtn) {
    sfxHowlBtn.addEventListener('click', () => {
      if (sfxHowlBtn.disabled || !hasStarted) return;
      flashBtn(sfxHowlBtn);
      playWolfosHowl();
    });
  }
  if (sfxStingBtn) {
    sfxStingBtn.addEventListener('click', () => {
      if (sfxStingBtn.disabled || !hasStarted) return;
      flashBtn(sfxStingBtn);
      playDangerSting();
    });
  }
  if (sfxWindBtn) {
    sfxWindBtn.addEventListener('click', () => {
      if (sfxWindBtn.disabled || !hasStarted) return;
      flashBtn(sfxWindBtn);
      playPrairieWind();
    });
  }

  // 5. Keyboard Shortcuts: Space/M for Link Movement, 1/2/3 for Game Modes, B/H/D/W for SFX
  window.addEventListener('keydown', (e) => {
    if (!hasStarted) return;
    const key = e.key.toLowerCase();
    if (e.code === 'Space' || e.key === ' ' || key === 'm') {
      e.preventDefault();
      const next = toggleLinkMovement();
      updateMovementUi(next);
    } else if (e.key === '1') {
      changeGameMode('EXPLORATION');
      modeButtons.forEach(b => b.classList.remove('active'));
      const btn = document.querySelector('.day-btn');
      if (btn) btn.classList.add('active');
    } else if (e.key === '2') {
      changeGameMode('QUIET');
      modeButtons.forEach(b => b.classList.remove('active'));
      const btn = document.querySelector('.rest-btn') || document.querySelector('.night-btn');
      if (btn) btn.classList.add('active');
    } else if (e.key === '3') {
      changeGameMode('BATTLE');
      modeButtons.forEach(b => b.classList.remove('active'));
      const btn = document.querySelector('.battle-btn');
      if (btn) btn.classList.add('active');
    } else if (key === 'b') {
      flashBtn(sfxBellBtn);
      playTowerBell();
    } else if (key === 'h') {
      flashBtn(sfxHowlBtn);
      playWolfosHowl();
    } else if (key === 'd') {
      flashBtn(sfxStingBtn);
      playDangerSting();
    } else if (key === 'w') {
      flashBtn(sfxWindBtn);
      playPrairieWind();
    } else if (key === 'r' || key === 'a') {
      const enabled = toggleRandomizer();
      updateRandomizerUi(enabled);
    }
  });

  // 6. Simple Mode Randomizer Toggle Button Tap
  function updateRandomizerUi(enabled) {
    if (randomToggleBtn) {
      randomToggleBtn.classList.toggle('active', enabled);
      randomToggleBtn.classList.toggle('inactive', !enabled);
      if (randomToggleLabel) randomToggleLabel.innerText = enabled ? "RANDOM: ON" : "RANDOM: OFF";
    }
  }

  if (randomToggleBtn) {
    randomToggleBtn.addEventListener('click', () => {
      const enabled = toggleRandomizer();
      updateRandomizerUi(enabled);
    });
  }

  // 7. Handle Mode Button Clicks
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

  if (sliderChorus) {
    sliderChorus.addEventListener('input', (e) => {
      const pct = parseFloat(e.target.value);
      setMixerParameter('chorus', pct / 100);
      if (valChorus) valChorus.innerText = pct + '%';
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
        if (sliderChorus) {
          const pct = Math.round(settings.chorusWet * 100);
          sliderChorus.value = pct;
          if (valChorus) valChorus.innerText = pct + '%';
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

  let cachedCanvasWidth = 600;
  const cachedCanvasHeight = 225;

  // Setup HiDPI Canvas Scaling (cached dimensions eliminate per-frame getBoundingClientRect)
  function setupCanvasDPI() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cachedCanvasWidth = canvas.clientWidth || 600;

    canvas.width = cachedCanvasWidth * dpr;
    canvas.height = cachedCanvasHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', setupCanvasDPI);
  setupCanvasDPI();

  // Lane geometry definitions (expanded 225px height with dedicated Harmony track)
  const LANES = {
    melody: { top: 14, bottom: 64, height: 50, label: 'MELODY' },
    harmony: { top: 68, bottom: 118, height: 50, label: 'HARMONY' },
    bass: { top: 122, bottom: 168, height: 46, label: 'BASS' },
    percussion: { top: 172, bottom: 218, height: 46, label: 'PERC' }
  };

  // Static color table: eliminates ~24,000 per-second object allocations in the render loop
  const NOTE_COLORS = {
    melody: {
      EXPLORATION: { fill: '#4ade80', stroke: '#86efac', glow: 'rgba(74, 222, 128, 0.55)', hit: '#ffffff' },
      QUIET: { fill: '#38bdf8', stroke: '#93c5fd', glow: 'rgba(56, 189, 248, 0.55)', hit: '#ffffff' },
      BATTLE: { fill: '#ef4444', stroke: '#fca5a5', glow: 'rgba(239, 68, 68, 0.6)', hit: '#ffffff' }
    },
    harmony: {
      EXPLORATION: { fill: '#fbbf24', stroke: '#fde68a', glow: 'rgba(251, 191, 36, 0.5)', hit: '#ffffff' },
      QUIET: { fill: '#818cf8', stroke: '#c7d2fe', glow: 'rgba(129, 140, 248, 0.5)', hit: '#ffffff' },
      BATTLE: { fill: '#f97316', stroke: '#fed7aa', glow: 'rgba(249, 115, 22, 0.5)', hit: '#ffffff' }
    },
    bass: {
      EXPLORATION: { fill: '#10b981', stroke: '#34d399', glow: 'rgba(16, 185, 129, 0.4)', hit: '#a7f3d0' },
      QUIET: { fill: '#6366f1', stroke: '#818cf8', glow: 'rgba(99, 102, 241, 0.4)', hit: '#c7d2fe' },
      BATTLE: { fill: '#e11d48', stroke: '#fda4af', glow: 'rgba(225, 29, 72, 0.45)', hit: '#ffe4e6' }
    },
    percussion: {
      EXPLORATION: { fill: '#a3e635', stroke: '#bef264', glow: 'rgba(163, 230, 53, 0.4)', hit: '#fef08a' },
      QUIET: { fill: '#06b6d4', stroke: '#67e8f9', glow: 'rgba(6, 182, 212, 0.4)', hit: '#e0f2fe' },
      BATTLE: { fill: '#f43f5e', stroke: '#fda4af', glow: 'rgba(244, 63, 94, 0.45)', hit: '#ffe4e6' }
    }
  };

  function getNoteColors(note) {
    const track = note.trackType || 'melody';
    const mode = note.mode || 'EXPLORATION';
    const trackColors = NOTE_COLORS[track] || NOTE_COLORS.melody;
    return trackColors[mode] || trackColors.EXPLORATION;
  }

  function getNoteYAndHeight(note) {
    const track = note.trackType || 'melody';

    if (track === 'melody') {
      const lane = LANES.melody;
      // Map MIDI pitch range [48 (C3) to 96 (C7)]
      const minMidi = 48;
      const maxMidi = 96;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 5;
      const noteY = (lane.bottom - 3) - norm * (lane.height - 10) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'harmony') {
      const lane = LANES.harmony;
      // Map MIDI pitch range [40 (E2) to 90 (F#6)]
      const minMidi = 40;
      const maxMidi = 90;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 5;
      const noteY = (lane.bottom - 3) - norm * (lane.height - 10) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'bass') {
      const lane = LANES.bass;
      // Map MIDI pitch range [28 (E1) to 60 (C4)]
      const minMidi = 28;
      const maxMidi = 60;
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

    if (pitch === 35 || pitch === 36 || pitch === 40) {
      // Kick drum / Main Snare
      noteY = lane.bottom - 10;
      noteH = 7;
    } else if (pitch === 38 || pitch === 43) {
      // Snare / Rim
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
      const cssWidth = cachedCanvasWidth;
      const cssHeight = cachedCanvasHeight;

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

        const isPercMuted = (note.trackType === 'percussion' && cueInfo.currentMode === 'QUIET');

        const isCurrentlyPlaying = isPlaying &&
          (note.transportTime <= visualizerSec) &&
          ((note.transportTime + note.duration) >= visualizerSec) &&
          !isPercMuted;

        if (isCurrentlyPlaying) {
          activeNotesHitCount++;
        }

        let alpha = 1.0;
        // Alpha fade out as notes pass playhead towards left margin
        if (noteX < PLAYHEAD_X) {
          alpha = Math.max(0.12, (noteX + noteW) / (PLAYHEAD_X + noteW));
        }

        // When in Rest mode, percussion is muted: render faint ghost notes
        if (isPercMuted) {
          alpha *= 0.2;
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = isCurrentlyPlaying ? colors.hit : colors.fill;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(noteX, y, noteW, h, 2.5);
        } else {
          ctx.rect(noteX, y, noteW, h);
        }
        ctx.fill();
        ctx.stroke();
      }

      ctx.globalAlpha = 1.0;

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

    // 2. Measure / Bar Grid Lines scrolling right-to-left (calculated dynamically at runtime from actual music timing)
    const viewportStartSec = currentTransportSec - (PLAYHEAD_X / PIXELS_PER_SEC);
    const viewportEndSec = currentTransportSec + ((width - PLAYHEAD_X) / PIXELS_PER_SEC);
    const measureLines = getMeasureLines(viewportStartSec, viewportEndSec);

    ctx.save();
    for (let i = 0; i < measureLines.length; i++) {
      const line = measureLines[i];
      const barX = PLAYHEAD_X + (line.transportTime - currentTransportSec) * PIXELS_PER_SEC;

      if (barX >= 0 && barX <= width + 40) {
        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, height);

        if (line.is8BarBoundary) {
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

  let lastCueText = '';
  let lastCueClass = '';
  let lastSubname = '';
  let lastPendingDisplay = '';
  let lastPendingText = '';
  let lastNextText = '';
  let lastNextClass = '';
  let lastNextTagText = '';
  let lastNextTagClass = '';
  let lastCounterText = '';

  function updateUIElements(cueInfo, isPlaying) {
    // 1. Active 8-Bar Cue ID display
    if (cueDisplayEl) {
      const modeIcon = (cueInfo.cueMode === 'BATTLE')
        ? '⚔️'
        : (cueInfo.cueMode === 'QUIET' ? '🌿' : '☀️');
      const cueText = `${modeIcon} ${cueInfo.cueId}`;
      if (cueText !== lastCueText) {
        cueDisplayEl.innerText = cueText;
        lastCueText = cueText;
      }

      const cueClass = (cueInfo.cueMode === 'BATTLE')
        ? "hud-title mode-battle"
        : (cueInfo.cueMode === 'QUIET' ? "hud-title mode-quiet" : "hud-title mode-exploration");
      if (cueClass !== lastCueClass) {
        cueDisplayEl.className = cueClass;
        lastCueClass = cueClass;
      }
    }

    // 2. Motif name & inline transition queue status (Zero Layout Shift)
    if (cueSubnameEl) {
      const subname = cueInfo.cueName || "Hyrule Overworld";
      if (subname !== lastSubname) {
        cueSubnameEl.innerText = subname;
        lastSubname = subname;
      }
    }

    if (cuePendingTextEl) {
      if (cueInfo.pendingMode) {
        const modeLabel = (cueInfo.pendingMode === 'BATTLE')
          ? 'Battle'
          : (cueInfo.pendingMode === 'QUIET' ? 'Rest' : 'Adventure');
        const pText = ` • ⏳ Queued: ${modeLabel} (Bar 8 Downbeat)`;
        if (lastPendingDisplay !== 'inline') {
          cuePendingTextEl.style.display = 'inline';
          lastPendingDisplay = 'inline';
        }
        if (pText !== lastPendingText) {
          cuePendingTextEl.innerText = pText;
          lastPendingText = pText;
        }
      } else {
        if (lastPendingDisplay !== 'none') {
          cuePendingTextEl.style.display = 'none';
          lastPendingDisplay = 'none';
        }
      }
    }

    // 3. Next Queued 8-Bar Cue ID display
    if (cueNextDisplayEl) {
      if (cueInfo.upcomingCueId) {
        const nextIcon = (cueInfo.upcomingCueMode === 'BATTLE')
          ? '⚔️'
          : (cueInfo.upcomingCueMode === 'QUIET' ? '🌿' : '☀️');
        const nextText = `${nextIcon} ${cueInfo.upcomingCueId.replace(/\s*\(Bars.*?\)/, '')}`;
        if (nextText !== lastNextText) {
          cueNextDisplayEl.innerText = nextText;
          lastNextText = nextText;
        }

        const nextClass = (cueInfo.upcomingCueMode === 'BATTLE')
          ? "hud-title next-title mode-battle"
          : (cueInfo.upcomingCueMode === 'QUIET' ? "hud-title next-title mode-quiet" : "hud-title next-title mode-exploration");
        if (nextClass !== lastNextClass) {
          cueNextDisplayEl.className = nextClass;
          lastNextClass = nextClass;
        }
      } else {
        if (lastNextText !== '--') {
          cueNextDisplayEl.innerText = '--';
          lastNextText = '--';
        }
      }
    }

    // 4. Next Tag / Queued Tag state
    if (hudNextTagEl) {
      if (cueInfo.pendingMode) {
        if (lastNextTagText !== 'QUEUED') {
          hudNextTagEl.innerText = 'QUEUED';
          lastNextTagText = 'QUEUED';
        }
        if (lastNextTagClass !== 'hud-tag queued') {
          hudNextTagEl.className = 'hud-tag queued';
          lastNextTagClass = 'hud-tag queued';
        }
      } else {
        if (lastNextTagText !== 'NEXT') {
          hudNextTagEl.innerText = 'NEXT';
          lastNextTagText = 'NEXT';
        }
        if (lastNextTagClass !== 'hud-tag muted') {
          hudNextTagEl.className = 'hud-tag muted';
          lastNextTagClass = 'hud-tag muted';
        }
      }
    }

    // 5. Measure Counter within 8-bar block (Updates synchronously from accurate musical bar)
    if (cueMeasureCounterEl) {
      let counterText = "Ready";
      if (isPlaying) {
        const curBar = cueInfo.currentBarInBlock || 1;
        const totalBars = cueInfo.totalBarsInBlock || 8;
        counterText = `Bar ${curBar}/${totalBars}`;
      }
      if (counterText !== lastCounterText) {
        cueMeasureCounterEl.innerText = counterText;
        lastCounterText = counterText;
      }
    }

    // 6. Sync controller mode buttons (Adventure, Rest, Battle) with current playing mode
    if (isPlaying) {
      const curMode = cueInfo.currentMode;
      modeButtons.forEach(b => {
        const m = b.getAttribute('data-mode');
        b.classList.toggle('active', m === curMode);
      });
    }
  }

  // Start the 60 FPS animation loop
  renderVisualizer();
});
