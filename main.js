import * as Tone from 'tone';
import {
  changeGameMode,
  getCurrentPlaybackState,
  getPendingStateChange,
  getActiveCueInfo,
  getStreamNotes,
  whenAudioLoaded,
  sequencer,
  HyruleSequencer
} from './sequencer.js';

document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.state-btn');
  const displayEl = document.getElementById('current-state-display');
  const loadingIndicator = document.getElementById('loading-indicator');
  const cueDisplayEl = document.getElementById('cue-display');
  const cueSubnameEl = document.getElementById('cue-subname');
  const cueNextDisplayEl = document.getElementById('cue-next-display');
  const cuePendingBadgeEl = document.getElementById('cue-pending-badge');
  const cueMeasureCounterEl = document.getElementById('cue-measure-counter');
  const canvas = document.getElementById('note-stream-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // Disable control buttons initially while audio buffers load
  buttons.forEach(btn => (btn.disabled = true));

  whenAudioLoaded()
    .then(() => {
      if (loadingIndicator) {
        loadingIndicator.innerText = "✓ Soundfont Audio Ready";
        loadingIndicator.classList.add('loaded');
        loadingIndicator.classList.remove('error');
      }
      buttons.forEach(btn => (btn.disabled = false));
    })
    .catch(err => {
      console.error("Error loading soundfont samples:", err);
      if (loadingIndicator) {
        loadingIndicator.innerText = "❌ Failed to load audio samples. Please check connection and refresh.";
        loadingIndicator.classList.add('error');
        loadingIndicator.classList.remove('loaded');
      }
      buttons.forEach(btn => (btn.disabled = true));
    });

  // Handle Mode Button Clicks
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const selectedMode = btn.getAttribute('data-mode');

      // 1. Signal mode change to sequencer
      changeGameMode(selectedMode);

      // 2. Refresh active UI layouts
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  window.Tone = Tone;
  window.sequencer = sequencer;
  window.HyruleSequencer = HyruleSequencer;

  // -------------------------------------------------------------
  // CONTINUOUS RIGHT-TO-LEFT STREAMING NOTE VISUALIZER (CANVAS)
  // -------------------------------------------------------------
  const PLAYHEAD_X = 84; // Fixed playhead X position in CSS pixels
  const PIXELS_PER_SEC = 110; // Scrolling conveyor rate

  // Setup HiDPI Canvas Scaling
  function setupCanvasDPI() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const targetWidth = rect.width || 640;
    const targetHeight = 230;

    canvas.width = targetWidth * dpr;
    canvas.height = targetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', setupCanvasDPI);
  setupCanvasDPI();

  // Lane geometry definitions
  const LANES = {
    melody: { top: 26, bottom: 92, height: 66, label: 'MELODY' },
    bass: { top: 98, bottom: 160, height: 62, label: 'BASS' },
    percussion: { top: 166, bottom: 224, height: 58, label: 'PERCUSSION' }
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
      const noteH = 6;
      const noteY = (lane.bottom - 4) - norm * (lane.height - 12) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'bass') {
      const lane = LANES.bass;
      // Map MIDI pitch range [28 (E1) to 55 (G3)]
      const minMidi = 28;
      const maxMidi = 55;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 7;
      const noteY = (lane.bottom - 4) - norm * (lane.height - 14) - noteH;
      return { y: noteY, h: noteH };
    }

    // Percussion
    const lane = LANES.percussion;
    const pitch = note.midi;
    let noteY = lane.bottom - 16;
    let noteH = 8;

    if (pitch === 35 || pitch === 36) {
      // Kick drum (bottom of lane)
      noteY = lane.bottom - 12;
      noteH = 9;
    } else if (pitch === 38 || pitch === 40) {
      // Snare (middle of lane)
      noteY = lane.top + 24;
      noteH = 7;
    } else if (pitch === 42 || pitch === 44 || pitch === 46) {
      // Hi-hat / Cymbals (top of lane)
      noteY = lane.top + 6;
      noteH = 5;
    } else {
      // Toms / Timpani
      noteY = lane.top + 16;
      noteH = 7;
    }

    return { y: noteY, h: noteH };
  }

  // Animation Loop: Renders 60 FPS continuous right-to-left note conveyor
  function renderVisualizer() {
    const transport = Tone.getTransport();
    const isPlaying = transport && (transport.state === 'started' || transport.state === 'running');
    const currentTransportSec = isPlaying ? transport.seconds : 0;
    const cueInfo = getActiveCueInfo();

    // 1. Update UI Status & Cue Information Display
    updateUIElements(cueInfo, isPlaying);

    // 2. Draw Note Stream Canvas
    if (canvas && ctx) {
      const cssWidth = canvas.getBoundingClientRect().width || 640;
      const cssHeight = 230;

      // Clear Canvas Background
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Draw background grid & lane separators
      drawCanvasBackground(ctx, cssWidth, cssHeight, currentTransportSec);

      // Draw streaming notes traveling right to left
      const streamNotes = getStreamNotes();
      let activeNotesHitCount = 0;

      for (let i = 0; i < streamNotes.length; i++) {
        const note = streamNotes[i];
        const noteX = PLAYHEAD_X + (note.transportTime - currentTransportSec) * PIXELS_PER_SEC;
        const noteW = Math.max(6, (note.duration * PIXELS_PER_SEC) - 2);

        // Cull notes outside visible viewport
        if (noteX + noteW < 0 || noteX > cssWidth + 80) {
          continue;
        }

        const { y, h } = getNoteYAndHeight(note);
        const colors = getNoteColors(note);

        const isCurrentlyPlaying = isPlaying &&
          (note.transportTime <= currentTransportSec) &&
          ((note.transportTime + note.duration) >= currentTransportSec);

        if (isCurrentlyPlaying) {
          activeNotesHitCount++;
        }

        // Draw note rounded bar
        ctx.save();

        // Alpha fade out if passing playhead towards the left margin
        if (noteX < PLAYHEAD_X) {
          const fadeAlpha = Math.max(0.15, (noteX + noteW) / (PLAYHEAD_X + noteW));
          ctx.globalAlpha = fadeAlpha;
        }

        ctx.fillStyle = isCurrentlyPlaying ? colors.hit : colors.fill;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;

        if (isCurrentlyPlaying) {
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = 14;
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(noteX, y, noteW, h, 3);
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

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lane.bottom);
      ctx.lineTo(width, lane.bottom);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(lane.label, 12, lane.top + 13);
    });

    // 2. Measure / Bar Grid Lines scrolling right-to-left (1 bar = 1.6s at 150 BPM)
    const barSec = 1.6;
    const startBarIdx = Math.floor(currentTransportSec / barSec) - 1;
    const endBarIdx = startBarIdx + Math.ceil(width / (barSec * PIXELS_PER_SEC)) + 3;

    ctx.save();
    for (let b = Math.max(0, startBarIdx); b <= endBarIdx; b++) {
      const barTime = b * barSec;
      const barX = PLAYHEAD_X + (barTime - currentTransportSec) * PIXELS_PER_SEC;

      if (barX >= 0 && barX <= width + 50) {
        const is8BarBoundary = (b % 8 === 0);

        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, height);

        if (is8BarBoundary) {
          // Luminous 8-bar phrase boundary line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([]);
          ctx.stroke();

          // Subtitle tag at top of phrase boundary
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText('8-BAR CUE BOUNDARY', barX + 4, 13);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
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
    ctx.lineWidth = isHitting ? 2.5 : 2;

    if (isHitting) {
      ctx.shadowColor = hitColor;
      ctx.shadowBlur = 12;
    }

    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X, 0);
    ctx.lineTo(PLAYHEAD_X, height);
    ctx.stroke();

    // Playhead top triangle marker
    ctx.fillStyle = isHitting ? '#ffffff' : hitColor;
    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X - 5, 0);
    ctx.lineTo(PLAYHEAD_X + 5, 0);
    ctx.lineTo(PLAYHEAD_X, 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function updateUIElements(cueInfo, isPlaying) {
    if (!displayEl) return;

    // 1. Current State display
    if (cueInfo.pendingMode) {
      if (cueInfo.pendingMode === 'BATTLE') {
        displayEl.innerText = "⚔️ Combat (Pending Phrase Downbeat...)";
        displayEl.className = "status-value mode-pending";
      } else if (cueInfo.pendingMode === 'EXPLORATION') {
        displayEl.innerText = "☀️ Exploration (Pending Victory Flourish...)";
        displayEl.className = "status-value mode-pending";
      } else if (cueInfo.pendingMode === 'QUIET') {
        displayEl.innerText = "🌙 Quiet (Pending Phrase Downbeat...)";
        displayEl.className = "status-value mode-pending";
      } else {
        displayEl.innerText = `${cueInfo.pendingMode} (Pending Phrase Downbeat...)`;
        displayEl.className = "status-value mode-pending";
      }
    } else if (cueInfo.currentMode === 'EXPLORATION') {
      displayEl.innerText = "Exploration (Day)";
      displayEl.className = "status-value mode-exploration";
    } else if (cueInfo.currentMode === 'QUIET') {
      displayEl.innerText = "Quiet (Night/Rest)";
      displayEl.className = "status-value mode-quiet";
    } else if (cueInfo.currentMode === 'BATTLE_INTRO') {
      displayEl.innerText = "⚠️ COMBAT INTRO";
      displayEl.className = "status-value mode-battle";
    } else if (cueInfo.currentMode === 'BATTLE_OUTRO') {
      displayEl.innerText = "⚔️ VICTORY FLOURISH";
      displayEl.className = "status-value mode-battle";
    } else if (cueInfo.currentMode === 'BATTLE') {
      displayEl.innerText = "⚠️ COMBAT ENGAGED";
      displayEl.className = "status-value mode-battle";
    }

    // 2. Active 8-Bar Cue ID display
    if (cueDisplayEl) {
      const modeIcon = (cueInfo.cueMode === 'BATTLE')
        ? '⚔️'
        : (cueInfo.cueMode === 'QUIET' ? '🌙' : '☀️');

      cueDisplayEl.innerText = `${modeIcon} ${cueInfo.cueId}`;

      if (cueInfo.cueMode === 'BATTLE') {
        cueDisplayEl.className = "cue-badge mode-battle";
      } else if (cueInfo.cueMode === 'QUIET') {
        cueDisplayEl.className = "cue-badge mode-quiet";
      } else {
        cueDisplayEl.className = "cue-badge mode-exploration";
      }
    }

    if (cueSubnameEl) {
      cueSubnameEl.innerText = cueInfo.cueName || "Hyrule Overworld";
    }

    // 3. Next Queued 8-Bar Cue ID display
    if (cueNextDisplayEl) {
      if (cueInfo.upcomingCueId) {
        const nextIcon = (cueInfo.upcomingCueMode === 'BATTLE')
          ? '⚔️'
          : (cueInfo.upcomingCueMode === 'QUIET' ? '🌙' : '☀️');
        cueNextDisplayEl.innerText = `${nextIcon} ${cueInfo.upcomingCueId}`;

        if (cueInfo.upcomingCueMode === 'BATTLE') {
          cueNextDisplayEl.className = "cue-next-badge mode-battle";
        } else if (cueInfo.upcomingCueMode === 'QUIET') {
          cueNextDisplayEl.className = "cue-next-badge mode-quiet";
        } else {
          cueNextDisplayEl.className = "cue-next-badge mode-exploration";
        }
      } else {
        cueNextDisplayEl.innerText = "--";
      }
    }

    // 4. Measure Counter within 8-bar block
    if (cueMeasureCounterEl) {
      if (isPlaying) {
        const barInBlock = Math.min(8, Math.floor(cueInfo.timeInBlock / 1.6) + 1);
        const timeSec = (cueInfo.timeInBlock % 12.8).toFixed(1);
        cueMeasureCounterEl.innerText = `Bar ${barInBlock} / 8 (${timeSec}s)`;
      } else {
        cueMeasureCounterEl.innerText = "Ready to Play";
      }
    }

    // 5. Pending transition notification banner
    if (cuePendingBadgeEl) {
      if (cueInfo.pendingMode) {
        cuePendingBadgeEl.style.display = 'block';
        cuePendingBadgeEl.innerText = `⏳ Transition Queued: ${cueInfo.pendingMode} (Switches at Bar 8 Downbeat)`;
      } else {
        cuePendingBadgeEl.style.display = 'none';
      }
    }
  }

  // Start the 60 FPS animation loop
  renderVisualizer();
});
