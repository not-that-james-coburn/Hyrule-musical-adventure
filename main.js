import * as Tone from 'tone';
import {
  changeGameMode,
  getCurrentPlaybackState,
  getPendingStateChange,
  currentBlockStartTransportSec,
  currentBlockDurationSec,
  whenAudioLoaded,
  sequencer,
  HyruleSequencer
} from './sequencer.js';

// Wire up the HTML buttons into your Tone.js execution environment
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.state-btn');
  const displayEl = document.getElementById('current-state-display');
  const fillEl = document.getElementById('transition-progress');
  const loadingIndicator = document.getElementById('loading-indicator');

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

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const selectedMode = btn.getAttribute('data-mode');

      // 1. Invoke function to signal change to Tone.js
      changeGameMode(selectedMode);

      // 2. Refresh active UI layouts
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  window.Tone = Tone; // Expose Tone for debugging
  window.sequencer = sequencer; // Expose sequencer for debugging
  window.HyruleSequencer = HyruleSequencer;

  // Smooth, high-performance rendering loop for the 8-bar countdown clock progress bar
  function renderProgressBar() {
    const transport = Tone.getTransport();
    if (transport && (transport.state === 'started' || transport.state === 'running')) {
      const elapsedInBlock = Math.max(0, transport.seconds - currentBlockStartTransportSec);
      const progressPercent = Math.min(100, (elapsedInBlock / currentBlockDurationSec) * 100);

      fillEl.style.width = `${Math.min(Math.max(progressPercent, 0), 100)}%`;

      const currentPlaybackState = getCurrentPlaybackState();
      const pendingState = getPendingStateChange();

      // Dynamically align text styling to update users when state changes or is pending
      if (pendingState) {
        if (pendingState === 'BATTLE') {
          displayEl.innerText = "⚔️ Combat (Pending Phrase Downbeat...)";
          displayEl.className = "status-value mode-pending";
          fillEl.style.backgroundColor = "var(--accent-red)";
        } else if (pendingState === 'EXPLORATION') {
          displayEl.innerText = "☀️ Exploration (Pending Victory Flourish...)";
          displayEl.className = "status-value mode-pending";
          fillEl.style.backgroundColor = "var(--accent-green)";
        } else {
          displayEl.innerText = `${pendingState} (Pending Phrase Downbeat...)`;
          displayEl.className = "status-value mode-pending";
        }
      } else if (currentPlaybackState === 'EXPLORATION') {
        displayEl.innerText = "Exploration (Day)";
        displayEl.className = "status-value mode-exploration";
        fillEl.style.backgroundColor = "var(--accent-green)";
      } else if (currentPlaybackState === 'IDLE') {
        displayEl.innerText = "🛡️ Idle (Standing Still)";
        displayEl.className = "status-value mode-idle";
        fillEl.style.backgroundColor = "#facc15";
      } else if (currentPlaybackState === 'QUIET') {
        displayEl.innerText = "Quiet (Night/Rest)";
        displayEl.className = "status-value mode-quiet";
        fillEl.style.backgroundColor = "var(--accent-blue)";
      } else if (currentPlaybackState === 'BATTLE_INTRO') {
        displayEl.innerText = "⚠️ COMBAT INTRO";
        displayEl.className = "status-value mode-battle";
        fillEl.style.backgroundColor = "var(--accent-red)";
      } else if (currentPlaybackState === 'BATTLE_OUTRO') {
        displayEl.innerText = "⚔️ VICTORY FLOURISH";
        displayEl.className = "status-value mode-battle";
        fillEl.style.backgroundColor = "var(--accent-red)";
      } else if (currentPlaybackState === 'BATTLE') {
        displayEl.innerText = "⚠️ COMBAT ENGAGED";
        displayEl.className = "status-value mode-battle";
        fillEl.style.backgroundColor = "var(--accent-red)";
      }
    }

    requestAnimationFrame(renderProgressBar);
  }

  // Fire up the animation cycle loop
  renderProgressBar();
});
