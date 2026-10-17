/**
 * Please Hold - Main Game Controller
 * 
 * Simple SPA that manages game stages and routes button inputs to minigames.
 */

import './style.css';
import { 
  createAdapter, 
  getReadyGames, 
  type Button, 
  type ControlLabels, 
  type MinigameAdapter 
} from './minigames';

// ---- Game State ----

interface GameState {
  currentStage: 'C1' | 'C2' | 'C3' | 'C4';
  currentGameId: string;
  runId: string;
  completed: Record<string, boolean>;
  digits: Record<string, string>;
}

const PIN_DIGITS = ['7', '3', '1', '9']; // From TECH_SPEC

let state: GameState = {
  currentStage: 'C1',
  currentGameId: 'G1',
  runId: `run-${Date.now()}`,
  completed: { C1: false, C2: false, C3: false, C4: false },
  digits: { C1: '?', C2: '?', C3: '?', C4: '?' },
};

let currentAdapter: MinigameAdapter | null = null;

// ---- DOM Elements ----

const elements = {
  btnG1: document.getElementById('btn-g1') as HTMLButtonElement,
  btnG2: document.getElementById('btn-g2') as HTMLButtonElement,
  btnG3: document.getElementById('btn-g3') as HTMLButtonElement,
  btnG4: document.getElementById('btn-g4') as HTMLButtonElement,
  btnG6: document.getElementById('btn-g6') as HTMLButtonElement,
  btnLeft: document.getElementById('btn-left') as HTMLButtonElement,
  btnRight: document.getElementById('btn-right') as HTMLButtonElement,
  leftLabel: document.querySelector('#btn-left .label') as HTMLSpanElement,
  rightLabel: document.querySelector('#btn-right .label') as HTMLSpanElement,
  stages: document.querySelectorAll('.stage') as NodeListOf<HTMLDivElement>,
  minigameRoot: document.getElementById('minigame-root') as HTMLDivElement,
};

// ---- UI Updates ----

function updateControlLabels(labels: ControlLabels): void {
  elements.leftLabel.textContent = labels.left;
  elements.rightLabel.textContent = labels.right;
  
  // Handle disabled state for inactive buttons
  const leftDisabled = labels.left === '—' || labels.left === '';
  const rightDisabled = labels.right === '—' || labels.right === '';
  
  elements.btnLeft.classList.toggle('disabled', leftDisabled);
  elements.btnRight.classList.toggle('disabled', rightDisabled);
}

function updateStageDisplay(): void {
  const stageIndex = ['C1', 'C2', 'C3', 'C4'].indexOf(state.currentStage);
  
  elements.stages.forEach((el, i) => {
    const stageId = `C${i + 1}` as keyof typeof state.completed;
    const digitEl = el.querySelector('.stage-digit') as HTMLSpanElement;
    
    // Update digit display
    digitEl.textContent = state.digits[stageId];
    
    // Update stage states
    el.classList.remove('active', 'completed');
    if (i === stageIndex) {
      el.classList.add('active');
    }
    if (state.completed[stageId]) {
      el.classList.add('completed');
    }
  });
}

function updateDebugButtons(): void {
  elements.btnG1.classList.toggle('active', state.currentGameId === 'G1');
  elements.btnG2.classList.toggle('active', state.currentGameId === 'G2');
  elements.btnG3.classList.toggle('active', state.currentGameId === 'G3');
  elements.btnG4.classList.toggle('active', state.currentGameId === 'G4');
  elements.btnG6.classList.toggle('active', state.currentGameId === 'G6');
}

// ---- Game Management ----

function startGame(gameId: string): void {
  // Clean up existing adapter
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  
  // Clear the minigame root
  elements.minigameRoot.innerHTML = '';
  
  // Update state
  state.currentGameId = gameId;
  updateDebugButtons();
  
  // Create and start new adapter
  try {
    currentAdapter = createAdapter(gameId);
    currentAdapter.startMinigame({
      gameId,
      stageId: state.currentStage,
      runId: state.runId,
      setControlLabels: updateControlLabels,
      onComplete: handleGameComplete,
      container: elements.minigameRoot,
    });
    console.log(`[Main] Started ${gameId} for stage ${state.currentStage}`);
  } catch (error) {
    console.error(`[Main] Failed to start ${gameId}:`, error);
    elements.minigameRoot.innerHTML = `
      <div style="color: #ff6b57; padding: 20px; text-align: center; font-family: monospace;">
        Error: Could not load ${gameId}
      </div>
    `;
  }
}

function handleGameComplete(): void {
  console.log(`[Main] Game ${state.currentGameId} completed for stage ${state.currentStage}`);
  
  // Mark stage as completed
  state.completed[state.currentStage] = true;
  
  // Award the PIN digit for this stage
  const stageIndex = ['C1', 'C2', 'C3', 'C4'].indexOf(state.currentStage);
  state.digits[state.currentStage] = PIN_DIGITS[stageIndex];
  
  // Update UI
  updateStageDisplay();
  
  // Check if all stages are complete
  const allComplete = Object.values(state.completed).every(Boolean);
  if (allComplete) {
    console.log('[Main] All stages complete! PIN:', PIN_DIGITS.join(''));
    // For now, just log it. Later this would trigger the PIN door scene.
  } else {
    // Auto-advance to next stage after a short delay
    setTimeout(() => {
      advanceToNextStage();
    }, 1500);
  }
}

function advanceToNextStage(): void {
  const stages: Array<'C1' | 'C2' | 'C3' | 'C4'> = ['C1', 'C2', 'C3', 'C4'];
  const currentIndex = stages.indexOf(state.currentStage);
  
  if (currentIndex < stages.length - 1) {
    state.currentStage = stages[currentIndex + 1];
    updateStageDisplay();
    // Start the same game type for the next stage (for testing)
    startGame(state.currentGameId);
  }
}

// ---- Input Handling ----

function sendInput(button: Button): void {
  if (!currentAdapter) return;
  
  // Check if button is disabled
  const btnEl = button === 'LEFT' ? elements.btnLeft : elements.btnRight;
  if (btnEl.classList.contains('disabled')) return;
  
  currentAdapter.handleInput(button);
}

function handleButtonPress(button: Button, btnEl: HTMLButtonElement): void {
  if (btnEl.classList.contains('disabled')) return;
  
  btnEl.classList.add('pressed');
  sendInput(button);
}

function handleButtonRelease(btnEl: HTMLButtonElement): void {
  btnEl.classList.remove('pressed');
}

// ---- Event Listeners ----

// Mouse/touch for control buttons
elements.btnLeft.addEventListener('mousedown', () => handleButtonPress('LEFT', elements.btnLeft));
elements.btnLeft.addEventListener('mouseup', () => handleButtonRelease(elements.btnLeft));
elements.btnLeft.addEventListener('mouseleave', () => handleButtonRelease(elements.btnLeft));
elements.btnLeft.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleButtonPress('LEFT', elements.btnLeft);
});
elements.btnLeft.addEventListener('touchend', () => handleButtonRelease(elements.btnLeft));

elements.btnRight.addEventListener('mousedown', () => handleButtonPress('RIGHT', elements.btnRight));
elements.btnRight.addEventListener('mouseup', () => handleButtonRelease(elements.btnRight));
elements.btnRight.addEventListener('mouseleave', () => handleButtonRelease(elements.btnRight));
elements.btnRight.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleButtonPress('RIGHT', elements.btnRight);
});
elements.btnRight.addEventListener('touchend', () => handleButtonRelease(elements.btnRight));

// Keyboard input
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  
  const key = e.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') {
    e.preventDefault();
    handleButtonPress('LEFT', elements.btnLeft);
  } else if (key === 'arrowright' || key === 'd') {
    e.preventDefault();
    handleButtonPress('RIGHT', elements.btnRight);
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') {
    handleButtonRelease(elements.btnLeft);
  } else if (key === 'arrowright' || key === 'd') {
    handleButtonRelease(elements.btnRight);
  }
});

// Debug game selection buttons
elements.btnG1.addEventListener('click', () => {
  if (state.currentGameId !== 'G1') {
    console.log('[Main] Switching to G1');
    startGame('G1');
  }
});

elements.btnG2.addEventListener('click', () => {
  if (state.currentGameId !== 'G2') {
    console.log('[Main] Switching to G2');
    startGame('G2');
  }
});

elements.btnG3.addEventListener('click', () => {
  if (state.currentGameId !== 'G3') {
    console.log('[Main] Switching to G3');
    startGame('G3');
  }
});

elements.btnG4.addEventListener('click', () => {
  if (state.currentGameId !== 'G4') {
    console.log('[Main] Switching to G4');
    startGame('G4');
  }
});

elements.btnG6.addEventListener('click', () => {
  if (state.currentGameId !== 'G6') {
    console.log('[Main] Switching to G6');
    startGame('G6');
  }
});

// ---- Initialization ----

function init(): void {
  console.log('[Main] Initializing Please Hold...');
  
  // Log available games
  const games = getReadyGames();
  console.log('[Main] Ready games:', games.map(g => `${g.id} (${g.inputCount}btn)`).join(', '));
  
  if (games.length === 0) {
    console.error('[Main] No ready games available!');
    elements.minigameRoot.innerHTML = `
      <div style="color: #ff6b57; padding: 20px; text-align: center; font-family: monospace;">
        No games available.<br>Check console for errors.
      </div>
    `;
    return;
  }
  
  // Initialize UI
  updateStageDisplay();
  updateDebugButtons();
  
  // Start the first game
  startGame(state.currentGameId);
}

// Start the app
init();
