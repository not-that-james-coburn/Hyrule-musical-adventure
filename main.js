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

  // Smooth, high-performance rendering loop for the 8-bar countdown clock progress bar
  function renderProgressBar() {
    if (Tone.Transport.state === 'running') {
      // Get position formatted strings like "Measures:Beats:Sixteenths" (e.g., "4:2:1")
      const position = Tone.Transport.position.split(':');
      const measure = parseInt(position[0], 10);
      
      // Calculate how far along we are inside the current 8-measure cycle (0% to 100%)
      const completedMeasuresInCycle = measure % 8;
      const progressPercent = (completedMeasuresInCycle / 8) * 100;
      
      fillEl.style.width = `${progressPercent}%`;

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
