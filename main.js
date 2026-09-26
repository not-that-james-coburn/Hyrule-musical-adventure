import * as Tone from 'tone';
import { changeGameMode, getCurrentPlaybackState } from './sequencer.js';

// Wire up the HTML buttons into your Tone.js execution environment
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.state-btn');
  const displayEl = document.getElementById('current-state-display');
  const fillEl = document.getElementById('transition-progress');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedMode = btn.getAttribute('data-mode');
      
      // 1. Invoke your existing function to signal the change to Tone.js
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
      // Get position formatted strings like "Measures:Beats:Sixteenths" (e.g., "4:2:1") or seconds
      let progressPercent = 0;
      if (typeof transport.position === 'string') {
        const position = transport.position.split(':');
        const measure = parseInt(position[0], 10) || 0;
        const beats = parseFloat(position[1]) || 0;
        const sixteenths = parseFloat(position[2]) || 0;

        // Calculate total measures in current position
        const totalMeasures = (measure % 8) + (beats / 4) + (sixteenths / 16);
        progressPercent = (totalMeasures / 8) * 100;
      } else if (typeof transport.seconds === 'number') {
        // Fallback calculation using transport seconds & bpm
        const bpm = transport.bpm ? transport.bpm.value : 90;
        const secondsPer8Bars = (60 / bpm) * 4 * 8;
        const currentCycleSeconds = transport.seconds % secondsPer8Bars;
        progressPercent = (currentCycleSeconds / secondsPer8Bars) * 100;
      }

      fillEl.style.width = `${Math.min(Math.max(progressPercent, 0), 100)}%`;

      // Dynamically align text styling to update users when a state change switches over
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
