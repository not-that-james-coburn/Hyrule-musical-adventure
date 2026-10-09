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
  pausePlayback,
  resumePlayback,
  setMixerParameter,
  setMixerPreset,
  getMixerSettings,
  toggleLinkMovement,
  setLinkMovement,
  getLinkMovementState,
  setAutoPlay,
  toggleAutoPlay,
  isAutoPlayEnabled,
  setRandomizer,
  toggleRandomizer,
  isRandomizerEnabled,
  getRandomizerInfo,
  setAutoCycle,
  toggleAutoCycle,
  isAutoCycleEnabled
} from './sequencer.js';

document.addEventListener('DOMContentLoaded', () => {
  const playOverlay = document.getElementById('play-overlay');
  const startBtn = document.getElementById('start-btn');
  const startBtnLabel = document.getElementById('start-btn-label');
  const loadingIndicator = document.getElementById('loading-indicator');
  const menuBtn = document.getElementById('menu-btn');
  const autoplayToggleBtn = document.getElementById('autoplay-toggle-btn');
  const modeRunBtn = document.getElementById('mode-run-btn');
  const modeRestBtn = document.getElementById('mode-rest-btn');
  const modeBattleBtn = document.getElementById('mode-battle-btn');
  const canvas = document.getElementById('note-stream-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // Dedicated Menu Modal DOM Elements
  const menuModal = document.getElementById('menu-modal');
  const tabBtnAbout = document.getElementById('tab-btn-about');
  const tabBtnSound = document.getElementById('tab-btn-sound');
  const tabPanelAbout = document.getElementById('tab-panel-about');
  const tabPanelSound = document.getElementById('tab-panel-sound');
  const menuCloseBtn = document.getElementById('menu-close-btn');

  // Mixer DOM Elements (inside Menu Sound tab)
  const presetButtons = document.querySelectorAll('.preset-btn');
  const sliderWarmth = document.getElementById('slider-warmth');
  const sliderTreble = document.getElementById('slider-treble');
  const sliderReverb = document.getElementById('slider-reverb');
  const sliderChorus = document.getElementById('slider-chorus');
  const sliderStereo = document.getElementById('slider-stereo');
  const sliderVolume = document.getElementById('slider-volume');
  const valWarmth = document.getElementById('val-warmth');
  const valTreble = document.getElementById('val-treble');
  const valReverb = document.getElementById('val-reverb');
  const valChorus = document.getElementById('val-chorus');
  const valStereo = document.getElementById('val-stereo');
  const valVolume = document.getElementById('val-volume');

  let hasStarted = false;
  let isMenuOpen = false;
  let activeMenuTab = 'about';
  let lastSyncedMode = 'EXPLORATION';

  // 1. Audio Loading Lifecycle
  whenAudioLoaded()
    .then(() => {
      if (loadingIndicator) {
        loadingIndicator.innerText = "READY";
        loadingIndicator.className = "status-pill ready";
      }
      if (startBtn && !hasStarted) {
        startBtn.disabled = false;
        if (startBtnLabel) startBtnLabel.innerText = "Begin";
        startBtn.classList.add('ready');
      }
    })
    .catch(err => {
      console.error("Error loading soundfont samples:", err);
      if (loadingIndicator) {
        loadingIndicator.innerText = "SAMPLE ERROR";
        loadingIndicator.className = "status-pill error";
      }
      if (startBtnLabel) startBtnLabel.innerText = "ERROR LOADING";
    });

  // Mode Selection UI Updater (3 Distinct Mode Buttons: Run, Rest, Battle)
  function updateActiveModeUi(currentMode) {
    lastSyncedMode = currentMode;
    const isBattle = (currentMode === 'BATTLE' || currentMode === 'BATTLE_INTRO' || currentMode === 'BATTLE_OUTRO');
    const isRest = (currentMode === 'QUIET');
    const isRun = !isBattle && !isRest;

    if (modeRunBtn) modeRunBtn.classList.toggle('active', isRun);
    if (modeRestBtn) modeRestBtn.classList.toggle('active', isRest);
    if (modeBattleBtn) modeBattleBtn.classList.toggle('active', isBattle);
  }

  // Auto UI Updater
  function updateAutoPlayUi(enabled) {
    if (autoplayToggleBtn) {
      autoplayToggleBtn.classList.toggle('active', enabled);
      autoplayToggleBtn.classList.toggle('inactive', !enabled);
      autoplayToggleBtn.innerText = enabled ? "AUTO: ON" : "AUTO: OFF";
    }
  }

  // Mobile Background Audio Keep-Alive & Media Session Registration
  let bgAudioElement = null;

  function createSilentAudioBlobUrl() {
    const sampleRate = 8000;
    const numSamples = sampleRate; // 1 second of silence
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, numSamples * 2, true);

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  function initBackgroundAudioKeeper() {
    if (bgAudioElement) return;

    // Enable background audio session on iOS WebKit if supported
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (e) {}
    }

    try {
      bgAudioElement = document.createElement('audio');
      bgAudioElement.id = 'hyrule-bg-audio-keeper';
      bgAudioElement.setAttribute('playsinline', '');
      bgAudioElement.setAttribute('webkit-playsinline', '');
      bgAudioElement.loop = true;
      bgAudioElement.volume = 0.01;
      bgAudioElement.src = createSilentAudioBlobUrl();
      document.body.appendChild(bgAudioElement);
    } catch (e) {
      console.warn('Could not initialize background audio keeper:', e);
    }

    // Register Media Session API for mobile lock screen controls and background prioritization
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Hyrule Field (Dynamic Score)',
          artist: 'Koji Kondo / Nintendo',
          album: 'The Legend of Zelda: Ocarina of Time',
          artwork: [
            {
              src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230f172a"/><polygon points="50,15 90,85 10,85" fill="%23d4af37"/><polygon points="50,85 30,50 70,50" fill="%230f172a"/></svg>',
              sizes: '128x128',
              type: 'image/svg+xml'
            }
          ]
        });

        navigator.mediaSession.setActionHandler('play', async () => {
          await resumePlayback();
          playBackgroundKeeper();
          if (loadingIndicator) {
            loadingIndicator.innerText = "PLAYING";
            loadingIndicator.className = "status-pill ready";
          }
        });

        navigator.mediaSession.setActionHandler('pause', async () => {
          await pausePlayback();
          pauseBackgroundKeeper();
          if (loadingIndicator) {
            loadingIndicator.innerText = "PAUSED";
            loadingIndicator.className = "status-pill";
          }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          const target = (lastSyncedMode === 'QUIET') ? 'EXPLORATION' : 'QUIET';
          changeGameMode(target);
          updateActiveModeUi(target);
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          changeGameMode('EXPLORATION');
          updateActiveModeUi('EXPLORATION');
        });
      } catch (e) {
        console.warn('MediaSession setup failed:', e);
      }
    }
  }

  function playBackgroundKeeper() {
    if (bgAudioElement) {
      bgAudioElement.play().catch(() => {});
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  function pauseBackgroundKeeper() {
    if (bgAudioElement) {
      bgAudioElement.pause();
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  // Menu Modal Tab Switcher ('about' vs 'sound')
  async function switchMenuTab(tabName) {
    activeMenuTab = tabName;
    if (tabName === 'about') {
      if (tabBtnAbout) tabBtnAbout.classList.add('active');
      if (tabBtnSound) tabBtnSound.classList.remove('active');
      if (tabPanelAbout) {
        tabPanelAbout.classList.add('active');
        tabPanelAbout.style.display = 'block';
      }
      if (tabPanelSound) {
        tabPanelSound.classList.remove('active');
        tabPanelSound.style.display = 'none';
      }
      if (menuBtn) menuBtn.classList.add('active');

      // Pause audio so user can read About technical background in quiet
      if (hasStarted) {
        await pausePlayback();
        pauseBackgroundKeeper();
      }
    } else if (tabName === 'sound') {
      if (tabBtnSound) tabBtnSound.classList.add('active');
      if (tabBtnAbout) tabBtnAbout.classList.remove('active');
      if (tabPanelSound) {
        tabPanelSound.classList.add('active');
        tabPanelSound.style.display = 'block';
      }
      if (tabPanelAbout) {
        tabPanelAbout.classList.remove('active');
        tabPanelAbout.style.display = 'none';
      }

      // Resume audio so user can hear real-time adjustments before exiting menu
      if (hasStarted) {
        await resumePlayback();
        playBackgroundKeeper();
      }
    }
  }

  // Menu Modal Functions (Pauses with instant mute on open, un-mutes and resumes on close)
  async function openMenu(targetTab = 'about', pushState = true) {
    if (!hasStarted) return;
    isMenuOpen = true;
    wasAutoPausedByMinimize = false;

    // Switch to target tab (handles audio pausing for 'about' or resuming for 'sound')
    await switchMenuTab(targetTab);

    // Show menu modal dialog
    if (menuModal) {
      menuModal.style.display = 'flex';
    }

    // Push browser history state for seamless browser back button navigation
    if (pushState && window.location.hash !== '#menu') {
      try {
        history.pushState({ menuOpen: true, tab: targetTab }, '', '#menu');
      } catch (e) {}
    }
  }

  async function closeMenu(triggerHistoryBack = true) {
    if (!hasStarted) return;

    // If closing via UI and #menu is present in URL hash, trigger history.back() for native browser back stack
    if (triggerHistoryBack && window.location.hash === '#menu') {
      history.back();
      return; // popstate handler will finalize closeMenu(false)
    }

    isMenuOpen = false;
    wasAutoPausedByMinimize = false;

    // Hide menu modal dialog
    if (menuModal) {
      menuModal.style.display = 'none';
    }
    if (menuBtn) {
      menuBtn.classList.remove('active');
    }

    // Ensure audio is running upon exiting menu
    await resumePlayback();
    playBackgroundKeeper();
  }

  // Listen for browser back / forward navigation to exit or re-enter the menu
  window.addEventListener('popstate', (e) => {
    if (!hasStarted) return;
    const isMenuTarget = (e.state && e.state.menuOpen) || window.location.hash === '#menu';
    if (isMenuTarget) {
      const tab = (e.state && e.state.tab) ? e.state.tab : 'about';
      openMenu(tab, false);
    } else {
      if (isMenuOpen) {
        closeMenu(false);
      }
    }
  });

  // Play / Pause internal logic (preserved for keyboard shortcuts & future features)
  async function togglePlayPause() {
    if (!hasStarted) return;
    wasAutoPausedByMinimize = false;
    if (isMenuOpen) {
      await closeMenu();
      return;
    }
    const transport = Tone.getTransport();
    if (transport.state === 'started') {
      await pausePlayback();
      pauseBackgroundKeeper();
      if (loadingIndicator) {
        loadingIndicator.innerText = "PAUSED";
        loadingIndicator.className = "status-pill";
      }
    } else {
      await resumePlayback();
      playBackgroundKeeper();
      if (loadingIndicator) {
        loadingIndicator.innerText = "PLAYING";
        loadingIndicator.className = "status-pill ready";
      }
    }
  }

  // 2. Play / Begin Button Tap on Splash Overlay
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (startBtn.disabled || hasStarted) return;

      hasStarted = true;
      isMenuOpen = false;

      // Unlock AudioContext & start sequencer with runway lead-in
      await Tone.start();
      initBackgroundAudioKeeper();
      playBackgroundKeeper();
      await changeGameMode('EXPLORATION');
      updateActiveModeUi('EXPLORATION');

      // Slide splash overlay out of view
      if (playOverlay) {
        playOverlay.classList.add('slide-out');
      }

      // Unlock controls
      if (autoplayToggleBtn) autoplayToggleBtn.disabled = false;
      if (menuBtn) menuBtn.disabled = false;
      if (modeRunBtn) modeRunBtn.disabled = false;
      if (modeRestBtn) modeRestBtn.disabled = false;
      if (modeBattleBtn) modeBattleBtn.disabled = false;
    });
  }

  // 3. Menu Button Tap (Toggles About pane inside Menu Modal)
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      if (!hasStarted) return;
      if (isMenuOpen) {
        closeMenu(true);
      } else {
        openMenu('about', true);
      }
    });
  }

  // 4. Three Distinct Mode Button Taps: Run, Rest, Battle
  if (modeRunBtn) {
    modeRunBtn.addEventListener('click', () => {
      if (!hasStarted) return;
      changeGameMode('EXPLORATION');
      updateActiveModeUi('EXPLORATION');
    });
  }

  if (modeRestBtn) {
    modeRestBtn.addEventListener('click', () => {
      if (!hasStarted) return;
      changeGameMode('QUIET');
      updateActiveModeUi('QUIET');
    });
  }

  if (modeBattleBtn) {
    modeBattleBtn.addEventListener('click', () => {
      if (!hasStarted) return;
      const cue = getActiveCueInfo();
      const current = (cue && cue.currentMode) ? cue.currentMode : lastSyncedMode;
      if (current === 'BATTLE' || current === 'BATTLE_INTRO') {
        changeGameMode('EXPLORATION');
        updateActiveModeUi('EXPLORATION');
      } else {
        changeGameMode('BATTLE');
        updateActiveModeUi('BATTLE');
      }
    });
  }

  // 5. Auto Toggle Tap (Off by default)
  if (autoplayToggleBtn) {
    updateAutoPlayUi(isAutoPlayEnabled());
    autoplayToggleBtn.addEventListener('click', () => {
      const enabled = toggleAutoPlay();
      updateAutoPlayUi(enabled);
    });
  }

  // 6. Keyboard Shortcuts: Space for Play/Pause, M/ESC for Menu, 1/R for Run, 2 for Rest, 3/B for Battle, A for Auto
  window.addEventListener('keydown', (e) => {
    if (!hasStarted) return;
    const key = e.key.toLowerCase();
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
    } else if (key === 'm' || e.key === 'Escape') {
      if (isMenuOpen) {
        closeMenu(true);
      } else {
        openMenu('about', true);
      }
    } else if (e.key === '1' || key === 'r') {
      changeGameMode('EXPLORATION');
      updateActiveModeUi('EXPLORATION');
    } else if (e.key === '2') {
      changeGameMode('QUIET');
      updateActiveModeUi('QUIET');
    } else if (e.key === '3' || key === 'b') {
      const cue = getActiveCueInfo();
      const current = (cue && cue.currentMode) ? cue.currentMode : lastSyncedMode;
      if (current === 'BATTLE' || current === 'BATTLE_INTRO') {
        changeGameMode('EXPLORATION');
        updateActiveModeUi('EXPLORATION');
      } else {
        changeGameMode('BATTLE');
        updateActiveModeUi('BATTLE');
      }
    } else if (key === 'a') {
      const enabled = toggleAutoPlay();
      updateAutoPlayUi(enabled);
    }
  });

  // 7. Menu Modal Tab Buttons & Navigation
  if (tabBtnAbout) {
    tabBtnAbout.addEventListener('click', () => switchMenuTab('about'));
  }
  if (tabBtnSound) {
    tabBtnSound.addEventListener('click', () => switchMenuTab('sound'));
  }

  // Close Button (supports native history back)
  if (menuCloseBtn) {
    menuCloseBtn.addEventListener('click', () => closeMenu(true));
  }

  // Close when clicking modal backdrop outside dialog
  if (menuModal) {
    menuModal.addEventListener('click', (e) => {
      if (e.target === menuModal) {
        closeMenu(true);
      }
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

  if (sliderStereo) {
    sliderStereo.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      setMixerParameter('stereoWidth', pct / 100);
      if (valStereo) valStereo.innerText = pct + '%';
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
        if (sliderStereo) {
          const pct = Math.round((settings.stereoWidth ?? 1.0) * 100);
          sliderStereo.value = pct;
          if (valStereo) valStereo.innerText = pct + '%';
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
  const PLAYHEAD_X = 64; // Playhead X anchor
  const PIXELS_PER_SEC = 112; // Expanded conveyor rate for horizontal breathing room between fast notes

  let cachedCanvasWidth = 800;
  const cachedCanvasHeight = 300; // 300px height for uncrowded multi-track separation
  let resizeRafId = null;

  // Setup HiDPI Canvas Scaling (spans full viewport width in any orientation without GPU thrashing)
  function setupCanvasDPI() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); // Cap DPR at 2 for mobile GPU efficiency
    const newWidth = canvas.clientWidth || window.innerWidth || 800;
    cachedCanvasWidth = newWidth;

    const targetW = Math.round(newWidth * dpr);
    const targetH = Math.round(cachedCanvasHeight * dpr);

    // Only update canvas dimensions if they actually changed to prevent bitmap texture reallocations
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function debouncedCanvasResize() {
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null;
      setupCanvasDPI();
    });
  }

  window.addEventListener('resize', debouncedCanvasResize, { passive: true });
  window.addEventListener('orientationchange', () => {
    debouncedCanvasResize();
    setTimeout(debouncedCanvasResize, 150);
    setTimeout(debouncedCanvasResize, 350);
  }, { passive: true });

  let wasAutoPausedByMinimize = false;

  // Clean minimize / background handler: cleanly suspends Web Audio to prevent OS timer-throttling garble & drift
  async function handleAppHide() {
    if (!hasStarted || isMenuOpen) return;
    const transport = Tone.getTransport();
    const isPlaying = transport && (transport.state === 'started' || transport.state === 'running');
    if (isPlaying && !wasAutoPausedByMinimize) {
      wasAutoPausedByMinimize = true;
      await pausePlayback();
      pauseBackgroundKeeper();
      if (loadingIndicator) {
        loadingIndicator.innerText = "PAUSED";
        loadingIndicator.className = "status-pill";
      }
    }
  }

  // Restore handler: cleanly unfreezes AudioContext and continues playback with zero fast-forward rush
  async function handleAppShow() {
    debouncedCanvasResize();
    if (wasAutoPausedByMinimize && !isMenuOpen) {
      wasAutoPausedByMinimize = false;
      await resumePlayback();
      playBackgroundKeeper();
      if (loadingIndicator) {
        loadingIndicator.innerText = "PLAYING";
        loadingIndicator.className = "status-pill ready";
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleAppHide();
    } else {
      handleAppShow();
    }
  }, { passive: true });

  window.addEventListener('pagehide', handleAppHide, { passive: true });
  window.addEventListener('pageshow', handleAppShow, { passive: true });

  setupCanvasDPI();

  // Lane geometry definitions (spacious 300px height with dedicated header clearance for sticky titles)
  const LANES = {
    melody: { top: 28, bottom: 88, height: 60, label: 'MELODY' },
    harmony: { top: 94, bottom: 176, height: 82, label: 'HARMONY' },
    bass: { top: 182, bottom: 238, height: 56, label: 'BASS' },
    percussion: { top: 244, bottom: 294, height: 50, label: 'PERC' }
  };

  // Static color table: eliminates per-frame object allocations
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
      const minMidi = 48;
      const maxMidi = 96;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 5.5;
      const noteY = (lane.bottom - 4) - norm * (lane.height - 12) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'harmony') {
      const lane = LANES.harmony;
      const minMidi = 36;
      const maxMidi = 96;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 5.5;
      const noteY = (lane.bottom - 4) - norm * (lane.height - 13) - noteH;
      return { y: noteY, h: noteH };
    }

    if (track === 'bass') {
      const lane = LANES.bass;
      const minMidi = 30;
      const maxMidi = 66;
      const norm = Math.max(0, Math.min(1, (note.midi - minMidi) / (maxMidi - minMidi)));
      const noteH = 6;
      const noteY = (lane.bottom - 4) - norm * (lane.height - 13) - noteH;
      return { y: noteY, h: noteH };
    }

    // Percussion: dedicated 4 vertical tiers so drum hits never overlap
    const lane = LANES.percussion;
    const pitch = note.midi;
    let noteY = lane.bottom - 11;
    let noteH = 7;

    if (pitch === 42 || pitch === 44 || pitch === 46) {
      // Hi-hat tier (top)
      noteY = lane.top + 6;
      noteH = 4.5;
    } else if (pitch === 38 || pitch === 43) {
      // Snare / Rim tier (mid-upper)
      noteY = lane.top + 18;
      noteH = 6;
    } else if (pitch === 30 || pitch === 31 || pitch === 32 || pitch === 33 || pitch === 34 || pitch === 35) {
      // Toms / Timpani tier (mid-lower)
      noteY = lane.top + 29;
      noteH = 6.5;
    } else {
      // Kick drum / Main Bass Beat tier (bottom, pitch 36 or 40)
      noteY = lane.bottom - 11;
      noteH = 7.5;
    }

    return { y: noteY, h: noteH };
  }

  let lastVisualizerSec = 0;

  // Animation Loop: Renders 60 FPS continuous right-to-left note conveyor with latency sync
  function renderVisualizer() {
    // If the browser tab/app is completely hidden (minimized on mobile or background tab),
    // skip canvas draw commands to save 100% CPU for Web Audio synthesis!
    if (document.hidden) {
      requestAnimationFrame(renderVisualizer);
      return;
    }

    const transport = Tone.getTransport();
    const isPlaying = transport && (transport.state === 'started' || transport.state === 'running');

    // Audio-to-Visual Latency Sync Compensation
    let visualizerSec = lastVisualizerSec;
    if (isPlaying) {
      const rawCtx = Tone.getContext().rawContext;
      const outputLat = (rawCtx && typeof rawCtx.outputLatency === 'number') ? rawCtx.outputLatency : 0.035;
      const baseLat = (rawCtx && typeof rawCtx.baseLatency === 'number') ? rawCtx.baseLatency : 0.02;
      const audioLatency = outputLat + baseLat + 0.015;
      visualizerSec = Math.max(0, transport.seconds - audioLatency);
      lastVisualizerSec = visualizerSec;
    } else if (transport && transport.state === 'paused') {
      // While paused, stay exactly at the paused transport position instead of resetting to 0!
      const rawCtx = Tone.getContext().rawContext;
      const outputLat = (rawCtx && typeof rawCtx.outputLatency === 'number') ? rawCtx.outputLatency : 0.035;
      const baseLat = (rawCtx && typeof rawCtx.baseLatency === 'number') ? rawCtx.baseLatency : 0.02;
      const audioLatency = outputLat + baseLat + 0.015;
      visualizerSec = Math.max(0, transport.seconds - audioLatency);
      lastVisualizerSec = visualizerSec;
    }

    const cueInfo = getActiveCueInfo();

    // Sync active mode button UI when mode changes (e.g. via Autoplay or deferred branch)
    if (cueInfo && cueInfo.currentMode && cueInfo.currentMode !== lastSyncedMode) {
      lastSyncedMode = cueInfo.currentMode;
      updateActiveModeUi(lastSyncedMode);
    }

    // Draw Note Stream Canvas
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
      let activeHitVelocitySum = 0;

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
        const vel = (typeof note.velocity === 'number') ? Math.max(0.1, Math.min(1.0, note.velocity)) : 0.8;

        const isPercMuted = (note.trackType === 'percussion' && cueInfo.currentMode === 'QUIET');

        const isCurrentlyPlaying = isPlaying &&
          (note.transportTime <= visualizerSec) &&
          ((note.transportTime + note.duration) >= visualizerSec) &&
          !isPercMuted;

        if (isCurrentlyPlaying) {
          activeNotesHitCount++;
          activeHitVelocitySum += vel;
        }

        let alpha = 0.65 + 0.35 * vel;
        // Alpha fade out as notes pass playhead towards left margin
        if (noteX < PLAYHEAD_X) {
          alpha *= Math.max(0.12, (noteX + noteW) / (PLAYHEAD_X + noteW));
        }

        // When in Rest mode, percussion is muted: render faint ghost notes
        if (isPercMuted) {
          alpha *= 0.2;
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = isCurrentlyPlaying ? colors.hit : colors.fill;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;

        if (vel >= 0.85) {
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = (vel - 0.7) * 15;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(noteX, y, noteW, h, 2.5);
        } else {
          ctx.rect(noteX, y, noteW, h);
        }
        ctx.fill();
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;

      // Draw Playhead line and active collision sparks
      drawPlayhead(ctx, cssHeight, activeNotesHitCount > 0, cueInfo, activeHitVelocitySum);
    }

    requestAnimationFrame(renderVisualizer);
  }

  function drawCanvasBackground(ctx, width, height, currentTransportSec) {
    // 1. Draw Lane Backdrops & Dividers
    Object.values(LANES).forEach((lane, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.012)' : 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(0, lane.top, width, lane.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lane.bottom);
      ctx.lineTo(width, lane.bottom);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.font = '600 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(lane.label, 24, lane.top + 12);
    });

    // 2. Measure / Bar Grid Lines
    const viewportStartSec = currentTransportSec - (PLAYHEAD_X / PIXELS_PER_SEC);
    const viewportEndSec = currentTransportSec + ((width - PLAYHEAD_X) / PIXELS_PER_SEC);
    const measureLines = getMeasureLines(viewportStartSec, viewportEndSec);

    const STICKY_LEFT = 24; // Left anchor inside 20px edge blur

    ctx.save();

    // Pass A: Vertical Measure Lines
    for (let i = 0; i < measureLines.length; i++) {
      const line = measureLines[i];
      const barX = PLAYHEAD_X + (line.transportTime - currentTransportSec) * PIXELS_PER_SEC;

      if (barX >= 0 && barX <= width + 50) {
        if (line.is8BarBoundary) {
          const mode = line.mode || 'EXPLORATION';
          const modeLineColor = (mode === 'BATTLE')
            ? 'rgba(239, 68, 68, 0.45)'
            : (mode === 'QUIET' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(74, 222, 128, 0.45)');

          ctx.strokeStyle = modeLineColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(barX, 28);
          ctx.lineTo(barX, height);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(barX, 28);
          ctx.lineTo(barX, height);
          ctx.stroke();
        }
      }
    }

    // Pass B: Sticky 8-Bar Cue Titles with full title & increased font sizing
    const cueLinesToRender = [];
    for (let i = 0; i < measureLines.length; i++) {
      const line = measureLines[i];
      if (line.is8BarBoundary && (line.cueFullTitle || line.cueTitle || line.cueId)) {
        const barX = PLAYHEAD_X + (line.transportTime - currentTransportSec) * PIXELS_PER_SEC;
        cueLinesToRender.push({ line, barX });
      }
    }

    cueLinesToRender.sort((a, b) => a.line.transportTime - b.line.transportTime);

    for (let i = 0; i < cueLinesToRender.length; i++) {
      const item = cueLinesToRender[i];
      const line = item.line;
      const barX = item.barX;
      const fullTitle = line.cueFullTitle || (line.cueId ? `${line.cueId} — ${line.cueTitle || ''}` : line.cueTitle);

      const mode = line.mode || 'EXPLORATION';
      const modeTextColor = (mode === 'BATTLE')
        ? '#fca5a5'
        : (mode === 'QUIET' ? '#93c5fd' : '#86efac');
      const modeBgColor = (mode === 'BATTLE')
        ? 'rgba(153, 27, 27, 0.45)'
        : (mode === 'QUIET' ? 'rgba(30, 58, 138, 0.45)' : 'rgba(20, 83, 45, 0.45)');
      const modeBorderColor = (mode === 'BATTLE')
        ? 'rgba(239, 68, 68, 0.5)'
        : (mode === 'QUIET' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(74, 222, 128, 0.5)');

      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textWidth = ctx.measureText(fullTitle).width;
      const pillW = textWidth + 20;
      const pillH = 22;
      const pillY = 4;

      let pillX = barX - 10;

      // Stickiness to the left side:
      // While active (or once past the sticky anchor), stays pinned at STICKY_LEFT
      if (line.isActiveCue || barX <= STICKY_LEFT) {
        pillX = STICKY_LEFT;

        // Smooth push-off as next 8-bar cue line approaches
        const nextItem = cueLinesToRender[i + 1];
        if (nextItem && nextItem.barX < STICKY_LEFT + pillW + 16) {
          pillX = nextItem.barX - pillW - 16;
        }
      }

      if (pillX + pillW >= 0 && pillX <= width + 50) {
        ctx.fillStyle = modeBgColor;
        ctx.strokeStyle = modeBorderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(pillX, pillY, pillW, pillH, 5);
        } else {
          ctx.rect(pillX, pillY, pillW, pillH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = modeTextColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fullTitle, pillX + 10, pillY + pillH / 2 + 0.5);
      }
    }

    ctx.restore();
  }

  function drawPlayhead(ctx, height, isHitting, cueInfo, activeHitVelocitySum = 0) {
    ctx.save();

    const hitColor = (cueInfo.cueMode === 'BATTLE')
      ? '#ef4444'
      : (cueInfo.cueMode === 'QUIET' ? '#38bdf8' : '#4ade80');

    const intensity = Math.min(2.5, 0.8 + (activeHitVelocitySum * 0.4));
    ctx.strokeStyle = isHitting ? '#ffffff' : hitColor;
    ctx.lineWidth = isHitting ? (1.5 + intensity * 0.8) : 1.5;

    if (isHitting) {
      ctx.shadowColor = hitColor;
      ctx.shadowBlur = 8 * intensity;
    }

    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X, 28);
    ctx.lineTo(PLAYHEAD_X, height);
    ctx.stroke();

    // Playhead top marker at Y=28
    ctx.fillStyle = isHitting ? '#ffffff' : hitColor;
    ctx.beginPath();
    ctx.moveTo(PLAYHEAD_X - 5, 28);
    ctx.lineTo(PLAYHEAD_X + 5, 28);
    ctx.lineTo(PLAYHEAD_X, 34);
    ctx.closePath();
    ctx.fill();

    // Dynamic collision sparks on active note impact
    if (isHitting) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const sparkR = Math.min(3.5, 1.2 + intensity);
      ctx.beginPath();
      ctx.arc(PLAYHEAD_X, height * 0.28, sparkR, 0, Math.PI * 2);
      ctx.arc(PLAYHEAD_X, height * 0.52, sparkR * 0.85, 0, Math.PI * 2);
      ctx.arc(PLAYHEAD_X, height * 0.78, sparkR * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Start the 60 FPS animation loop
  renderVisualizer();
});
