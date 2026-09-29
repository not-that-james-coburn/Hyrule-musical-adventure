import * as Tone from 'tone';
import { changeGameMode, getCurrentPlaybackState, currentBlockStartTransportSec, currentBlockDurationSec } from './sequencer.js';

// Wire up the HTML buttons into your Tone.js execution environment
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.state-btn');
  const displayEl = document.getElementById('current-state-display');
  const fillEl = document.getElementById('transition-progress');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedMode = btn.getAttribute('data-mode');
      
      // 1. Invoke function to signal change to Tone.js
      changeGameMode(selectedMode);

      // 2. Refresh active UI layouts
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  window.Tone = Tone; // Expose Tone for debugging

  // Smooth, high-performance rendering loop for the 8-bar countdown clock progress bar
  function renderProgressBar() {
    const transport = Tone.getTransport();
    if (transport && (transport.state === 'started' || transport.state === 'running')) {
      const elapsedInBlock = Math.max(0, transport.seconds - currentBlockStartTransportSec);
      const progressPercent = Math.min(100, (elapsedInBlock / currentBlockDurationSec) * 100);

      fillEl.style.width = `${Math.min(Math.max(progressPercent, 0), 100)}%`;

      // Dynamically align text styling to update users when state changes
      const currentPlaybackState = getCurrentPlaybackState();
      if (currentPlaybackState === 'EXPLORATION') {
        displayEl.innerText = "Exploration (Day)";
        displayEl.className = "status-value mode-exploration";
        fillEl.style.backgroundColor = "var(--accent-green)";
      } else if (currentPlaybackState === 'QUIET') {
        displayEl.innerText = "Quiet (Night/Rest)";
        displayEl.className = "status-value mode-quiet";
        fillEl.style.backgroundColor = "var(--accent-blue)";
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
