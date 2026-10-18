/**
 * Please Hold - Main Game Controller
 *
 * Game Flow:
 * 0. Main menu: Start begins a new run (menu music loops until then)
 * 1. C1: Random one-button game (introduces controls)
 * 2. C2-C4: Random two-button games (no repeats within a run)
 * 3. After C4: PIN entry phase using E1 or E2 ending minigame
 *
 * Each completed stage reveals one digit of the 4-digit PIN.
 */

import {
  createAdapter,
  getAllGames,
  getInputCount,
  getReadyGames,
  getOneButtonGames,
  getTwoButtonGames,
  type Button,
  type ControlLabels,
  type MinigameAdapter,
} from './minigames';
import { createBossAdapter } from './minigames/boss-tunnel';
import { audio, trackForMinigame, trackForScene, GAMES_WITH_OWN_AUDIO, MINIGAME_TRACKS } from './audio'; // [audio]
import { createMainMenuScene } from './scenes/main-menu';

// ---- Seeded PRNG ----

/** mulberry32: deterministic PRNG for run reproducibility */
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using seeded RNG */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---- Game State ----

type GamePhase = 'STAGES' | 'PIN_ENTRY' | 'BOSS' | 'ENDING' | 'GAME_OVER';
type StageId = 'C1' | 'C2' | 'C3' | 'C4';

const INITIAL_LIVES = 3;

interface RunPlan {
  seed: number;
  games: string[]; // [C1 game, C2 game, C3 game, C4 game]
  pinDigits: string[]; // 4 random digits generated from seed
}

interface GameState {
  phase: GamePhase;
  currentStage: StageId;
  runPlan: RunPlan;
  completed: Record<StageId, boolean>;
  digits: Record<StageId, string>;
  pinEntered: string;
  endingGame: 'E1' | 'E2' | null;
  currentGameId: string; // The actually-running game (may differ from runPlan when debugging)
  lives: number; // Global lives for G-games (E-games are instant death)
}

const STAGES: StageId[] = ['C1', 'C2', 'C3', 'C4'];

/** Anything that receives button input and can be disposed: a minigame adapter or the main menu. */
type InputScene = Pick<MinigameAdapter, 'handleInput' | 'dispose'>;

let state: GameState;
let currentAdapter: InputScene | null = null;
let currentInputCount: 1 | 2 = 2; // Track current game's input mode
let inMainMenu = false;
/** Delay before the ending screen offers Replay, so the victory sound is heard first. */
const ENDING_REPLAY_DELAY_MS = 4000;

// ---- Run Plan Generation ----

function generateRunPlan(seed: number): RunPlan {
  const rng = createSeededRng(seed);

  const oneButtonGames = getOneButtonGames();
  const twoButtonGames = getTwoButtonGames();

  // Validate we have enough games
  if (oneButtonGames.length === 0) {
    console.error('[Main] No one-button games available for C1!');
    throw new Error('Need at least one one-button game for C1');
  }
  if (twoButtonGames.length < 3) {
    console.warn(`[Main] Only ${twoButtonGames.length} two-button games available, need 3 for C2-C4`);
  }

  // Track used games to prevent duplicates
  const usedGameIds = new Set<string>();

  // C1: Random one-button game
  const shuffledOneBtn = shuffleArray(oneButtonGames, rng);
  const c1Game = shuffledOneBtn[0].id;
  usedGameIds.add(c1Game);

  // C2-C4: Random two-button games (no repeats, also excluding C1 game)
  const availableTwoBtn = shuffleArray(twoButtonGames, rng).filter(g => !usedGameIds.has(g.id));
  
  const games: string[] = [c1Game];
  
  for (let i = 0; i < 3; i++) {
    if (availableTwoBtn[i]) {
      games.push(availableTwoBtn[i].id);
      usedGameIds.add(availableTwoBtn[i].id);
    } else {
      // Fallback: reuse a game if not enough available (shouldn't happen with 5+ two-button games)
      console.warn(`[Main] Not enough unique two-button games for stage ${i + 2}`);
      games.push(availableTwoBtn[0]?.id ?? c1Game);
    }
  }

  const plan: RunPlan = {
    seed,
    games,
    pinDigits: [
      Math.floor(rng() * 10).toString(),
      Math.floor(rng() * 10).toString(),
      Math.floor(rng() * 10).toString(),
      Math.floor(rng() * 10).toString(),
    ],
  };

  console.log('[Main] Generated run plan:', plan);
  console.log('[Main] PIN for this run:', plan.pinDigits.join(''));
  
  // Verify no duplicates
  const uniqueGames = new Set(plan.games);
  if (uniqueGames.size !== plan.games.length) {
    console.warn('[Main] Warning: Run plan contains duplicate games!', plan.games);
  }
  
  return plan;
}

function createInitialState(): GameState {
  // Read seed from URL ?seed=123 or generate random
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const seed = seedParam ? parseInt(seedParam, 10) || Date.now() : Date.now();
  
  console.log(`[Main] Seed: ${seed}${seedParam ? ' (from URL)' : ' (random)'}`);
  
  const runPlan = generateRunPlan(seed);
  return {
    phase: 'STAGES',
    currentStage: 'C1',
    runPlan,
    completed: { C1: false, C2: false, C3: false, C4: false },
    digits: { C1: '?', C2: '?', C3: '?', C4: '?' },
    pinEntered: '',
    endingGame: null,
    currentGameId: runPlan.games[0], // Start with C1's game
    lives: INITIAL_LIVES,
  };
}

// ---- DOM Elements ----

const elements = {
  debugGames: document.getElementById('debug-games') as HTMLDivElement,
  debugPin: document.getElementById('debug-pin') as HTMLSpanElement,
  btnLeft: document.getElementById('btn-left') as HTMLButtonElement,
  btnRight: document.getElementById('btn-right') as HTMLButtonElement,
  leftLabel: document.querySelector('#btn-left .label') as HTMLSpanElement,
  rightLabel: document.querySelector('#btn-right .label') as HTMLSpanElement,
  btnSingle: document.getElementById('btn-single') as HTMLButtonElement,
  singleLabel: document.querySelector('#btn-single .label') as HTMLSpanElement,
  controls: document.getElementById('controls') as HTMLElement,
  stages: document.querySelectorAll('.stage') as NodeListOf<HTMLDivElement>,
  minigameRoot: document.getElementById('minigame-root') as HTMLDivElement,
  sceneBg: document.getElementById('scene-bg') as HTMLDivElement,
  livesCount: document.getElementById('lives-count') as HTMLSpanElement,
  gameOverOverlay: document.getElementById('game-over-overlay') as HTMLDivElement,
  btnRestart: document.getElementById('btn-restart') as HTMLButtonElement,
  btnMenu: document.getElementById('btn-menu') as HTMLButtonElement,
};

// ---- UI Updates ----

function updateControlLabels(labels: ControlLabels): void {
  elements.leftLabel.textContent = labels.left;
  elements.rightLabel.textContent = labels.right;
  
  // For single button mode, use the left label
  elements.singleLabel.textContent = labels.left || labels.right || 'Action';

  const leftDisabled = labels.left === '—' || labels.left === '';
  const rightDisabled = labels.right === '—' || labels.right === '';

  elements.btnLeft.classList.toggle('disabled', leftDisabled);
  elements.btnRight.classList.toggle('disabled', rightDisabled);
}

function updateLivesDisplay(): void {
  elements.livesCount.textContent = state.lives.toString();
  elements.livesCount.classList.toggle('lives-full', state.lives === INITIAL_LIVES);
  elements.livesCount.classList.toggle('lives-low', state.lives === 1);
}

function showGameOver(): void {
  state.phase = 'GAME_OVER';
  
  // Stop current game
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  elements.minigameRoot.innerHTML = '';
  
  // Play game over music
  audio.playMusic('gameover_music');
  
  // Show overlay
  elements.gameOverOverlay.classList.remove('hidden');
  
  console.log('[Main] Game Over!');
}

function hideGameOver(): void {
  elements.gameOverOverlay.classList.add('hidden');
}

function restartRun(): void {
  console.log('[Main] Restarting run...');
  
  // Hide game over screen
  hideGameOver();
  
  // Reset state
  state = createInitialState();
  
  // Reset UI
  updateStageDisplay();
  updateLivesDisplay();
  updateDebugButtons();
  elements.debugPin.textContent = state.runPlan.pinDigits.join('');
  
  // Start first game
  startCurrentStageGame();
}

function goToMainMenu(): void {
  hideGameOver();
  showMainMenu(); // [audio] crossfades the game over music into the menu track
}

function updateStageDisplay(): void {
  const stageIndex = STAGES.indexOf(state.currentStage);

  // Update background based on stage
  elements.sceneBg.classList.remove('stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-pin');
  if (state.phase === 'PIN_ENTRY') {
    elements.sceneBg.classList.add('stage-pin');
  } else {
    elements.sceneBg.classList.add(`stage-${state.currentStage.toLowerCase()}`);
  }

  elements.stages.forEach((el, i) => {
    const stageId = STAGES[i];
    const digitEl = el.querySelector('.stage-digit') as HTMLSpanElement;

    digitEl.textContent = state.digits[stageId];

    el.classList.remove('active', 'completed');
    if (state.phase === 'STAGES' && i === stageIndex) {
      el.classList.add('active');
    }
    if (state.completed[stageId]) {
      el.classList.add('completed');
    }
  });
}

function updateDebugButtons(): void {
  const currentGameId = getCurrentGameId();
  elements.debugGames.querySelectorAll<HTMLButtonElement>('.debug-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.gameId === currentGameId);
  });
}

function getCurrentGameId(): string {
  return state.currentGameId;
}

/** Build one debug button per registered game (every game, pool or special, ready or not). */
function buildDebugButtons(): void {
  elements.debugGames.innerHTML = '';
  for (const game of getAllGames()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'debug-btn';
    btn.dataset.gameId = game.id;
    btn.textContent = game.id;
    btn.title = `${game.name} (${game.inputCount} button${game.inputCount === 1 ? '' : 's'})${game.ready ? '' : ' - not ready'}`;
    if (!game.ready) btn.classList.add('not-ready');
    btn.addEventListener('click', () => {
      if (inMainMenu) {
        // Debug shortcut from the menu: begin a run, then jump to the chosen game.
        leaveMainMenu();
        beginRun();
      }
      if (getCurrentGameId() !== game.id) {
        console.log(`[Main] Switching to ${game.id}`);
        startGame(game.id);
      }
    });
    elements.debugGames.appendChild(btn);
  }
  
  // Add BOSS button (not in registry, called directly)
  const bossBtn = document.createElement('button');
  bossBtn.type = 'button';
  bossBtn.className = 'debug-btn';
  bossBtn.dataset.gameId = 'BOSS';
  bossBtn.textContent = 'BOSS';
  bossBtn.title = 'Tunnel Escape (2 buttons) - Boss fight';
  bossBtn.addEventListener('click', () => {
    if (inMainMenu) {
      leaveMainMenu();
      beginRun();
    }
    if (getCurrentGameId() !== 'BOSS') {
      console.log('[Main] Switching to BOSS');
      startBoss();
    }
  });
  elements.debugGames.appendChild(bossBtn);
}

// ---- Main Menu ----

/** Show the main menu (the entry scene) with the menu music; Start begins a new run. */
function showMainMenu(): void {
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  elements.minigameRoot.innerHTML = '';
  hideGameOver();
  inMainMenu = true;
  document.getElementById('app')?.classList.add('in-menu');
  elements.sceneBg.classList.remove('stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-pin', 'stage-e1', 'stage-e2');
  elements.sceneBg.classList.add('scene-menu');
  currentInputCount = 2;
  elements.controls.classList.remove('single-button-mode');

  // [audio] Menu music from the moment the menu opens; unlock() succeeds straight away if
  // the page has had a gesture. If the browser blocks it, the first press (which also
  // calls unlock()) gets it going without being swallowed: RIGHT starts the run, LEFT
  // turns the music on. LEFT is the global music toggle (music bus only, saved).
  audio.playMusic('menu');
  audio.unlock();

  const menu = createMainMenuScene();
  menu.start({
    container: elements.minigameRoot,
    setControlLabels: updateControlLabels,
    getAudioState: () => audio.outputState(),
    musicEnabled: audio.isMusicEnabled(),
    onToggleMusic: (enabled) => audio.setMusicEnabled(enabled),
    onStart: startNewRun,
    // A click/tap on the on-screen Start button behaves like pressing RIGHT.
    onPointerStart: () => {
      handleButtonPress('RIGHT', elements.btnRight);
      handleButtonRelease(elements.btnRight);
    },
  });
  currentAdapter = menu;
  console.log('[Main] Main menu');
}

function leaveMainMenu(): void {
  if (!inMainMenu) return;
  inMainMenu = false;
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  elements.minigameRoot.innerHTML = '';
  elements.sceneBg.classList.remove('scene-menu');
  document.getElementById('app')?.classList.remove('in-menu');
}

/** Fresh run plan (new seed, new shuffle) and reset stage and lives displays. */
function beginRun(): void {
  state = createInitialState();
  updateStageDisplay();
  updateLivesDisplay();
  updateDebugButtons();
  elements.debugPin.textContent = state.runPlan.pinDigits.join('');
}

/** Start a brand-new run from the menu. The menu logic already fires onStart only once. */
function startNewRun(): void {
  if (!inMainMenu) return; // guards a second call from a double press
  leaveMainMenu();
  beginRun();
  startCurrentStageGame(); // [audio] its playMusic crossfades out of the menu track
}

// ---- Game Management ----

function startCurrentStageGame(): void {
  const stageIndex = STAGES.indexOf(state.currentStage);
  const gameId = state.runPlan.games[stageIndex];
  startGame(gameId);
}

function startGame(gameId: string): void {
  // Clean up existing adapter
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }

  state.currentGameId = gameId;
  elements.minigameRoot.innerHTML = '';
  
  // If starting E1 or E2, switch to PIN_ENTRY phase
  if (gameId === 'E1' || gameId === 'E2') {
    state.phase = 'PIN_ENTRY';
    state.endingGame = gameId as 'E1' | 'E2';
    // Update background for the ending game
    elements.sceneBg.classList.remove('stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-pin', 'stage-e1', 'stage-e2');
    elements.sceneBg.classList.add(gameId === 'E1' ? 'stage-e1' : 'stage-e2');
  }
  
  updateDebugButtons();

  // [audio] Music follows the narrative stage, not the minigame; E-games use the end-stage track.
  // A game listed in MINIGAME_TRACKS (G4) overrides it with its own track while it runs.
  // Playing the same track again is a no-op, so retries and hub returns never restart it.
  audio.playMusic(trackForMinigame(gameId, gameId.startsWith('E') ? { kind: 'end' } : { kind: 'stage', stage: state.currentStage }, MINIGAME_TRACKS));
  audio.setMusicSuppressed(GAMES_WITH_OWN_AUDIO.has(gameId)); // [audio] games with audio outside the engine

  // Set input mode based on game's inputCount
  const inputCount = getInputCount(gameId);
  currentInputCount = inputCount;
  elements.controls.classList.toggle('single-button-mode', inputCount === 1);

  try {
    const adapter = createAdapter(gameId);
    currentAdapter = adapter;
    adapter.startMinigame({
      gameId,
      stageId: state.currentStage,
      runId: `run-${state.runPlan.seed}`,
      setControlLabels: updateControlLabels,
      onComplete: handleGameComplete,
      onFail: handleGameFail,
      container: elements.minigameRoot,
      targetPin: state.runPlan.pinDigits, // For E1/E2 ending games
    } as any);
    console.log(`[Main] Started ${gameId} for stage ${state.currentStage} (${inputCount}-button)`);
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
  const gameId = getCurrentGameId();
  console.log(`[Main] Game ${gameId} completed for stage ${state.currentStage}`);

  if (state.phase === 'STAGES') {
    // [audio] A game with its own track (G4) hands back to the stage's track for the reveal;
    // for every other game this is the track already playing, so nothing restarts.
    audio.playMusic(trackForScene({ kind: 'stage', stage: state.currentStage }));

    // Mark stage as completed
    state.completed[state.currentStage] = true;

    // Award the PIN digit for this stage
    const stageIndex = STAGES.indexOf(state.currentStage);
    state.digits[state.currentStage] = state.runPlan.pinDigits[stageIndex];

    updateStageDisplay();

    // Check if all stages are complete
    const allComplete = STAGES.every(s => state.completed[s]);
    if (allComplete) {
      console.log('[Main] All stages complete! PIN:', state.runPlan.pinDigits.join(''));
      setTimeout(() => {
        startPinEntryPhase();
      }, 1500);
    } else {
      // Advance to next stage
      setTimeout(() => {
        advanceToNextStage();
      }, 1500);
    }
  } else if (state.phase === 'PIN_ENTRY') {
    // PIN entry game completed successfully
    console.log('[Main] PIN entry successful! Opening door...');
    
    // Clean up the game
    if (currentAdapter) {
      currentAdapter.dispose();
      currentAdapter = null;
    }
    elements.minigameRoot.innerHTML = '';
    
    // Play door opening animation
    showDoorOpening();
  }
}

function handleGameFail(): void {
  const gameId = getCurrentGameId();
  const isEGame = gameId.startsWith('E');
  
  console.log(`[Main] Game ${gameId} failed for stage ${state.currentStage}`);
  
  // E-games are instant death (no lives)
  if (isEGame) {
    console.log('[Main] E-game failed - Game Over!');
    showGameOver();
    return;
  }
  
  // G-games use lives
  state.lives--;
  updateLivesDisplay();
  console.log(`[Main] Lives remaining: ${state.lives}`);
  
  if (state.lives <= 0) {
    console.log('[Main] No lives remaining - Game Over!');
    showGameOver();
    return;
  }
  
  // Still have lives - restart the current game
  console.log(`[Main] Restarting ${gameId}...`);
  startGame(gameId);
}

function advanceToNextStage(): void {
  const currentIndex = STAGES.indexOf(state.currentStage);

  if (currentIndex < STAGES.length - 1) {
    state.currentStage = STAGES[currentIndex + 1];
    updateStageDisplay();
    startCurrentStageGame();
  }
}

function startPinEntryPhase(): void {
  state.phase = 'PIN_ENTRY';
  state.endingGame = 'E2'; // Use morse pad for PIN entry
  console.log('[Main] Starting PIN entry phase with E2...');
  
  updateStageDisplay(); // Update background to PIN stage
  startGame('E2');
}

function showDoorOpening(): void {
  // Play door opening animation then start boss
  // Use vault frames for E1, pin door frames for E2
  const frames = state.endingGame === 'E1' 
    ? [
        '/assets/scenes/vault_door_open_frame_1.png',
        '/assets/scenes/vault_door_open_frame_2.png',
        '/assets/scenes/vault_door_open_frame_3.png',
      ]
    : [
        '/assets/scenes/pin_door_open_frame_1.png',
        '/assets/scenes/pin_door_open_frame_2.png',
        '/assets/scenes/pin_door_open_frame_3.png',
      ];
  
  let frameIndex = 0;
  elements.sceneBg.style.backgroundImage = `url('${frames[0]}')`;
  
  const interval = setInterval(() => {
    frameIndex++;
    if (frameIndex < frames.length) {
      elements.sceneBg.style.backgroundImage = `url('${frames[frameIndex]}')`;
    } else {
      clearInterval(interval);
      // After door opens, start the boss fight
      setTimeout(() => {
        startBoss();
      }, 500);
    }
  }, 400);
}

function startBoss(): void {
  console.log('[Main] Starting boss tunnel escape...');
  state.phase = 'BOSS';
  state.currentGameId = 'BOSS';
  
  // Clean up any existing adapter
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  elements.minigameRoot.innerHTML = '';
  
  // Set dark background for tunnel
  elements.sceneBg.style.backgroundImage = 'none';
  elements.sceneBg.classList.remove('stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-pin', 'stage-e1', 'stage-e2');
  elements.sceneBg.style.backgroundColor = '#050505';
  
  // [audio] Play boss music
  audio.playMusic(trackForScene({ kind: 'boss' }));
  
  // Create and start boss adapter
  const bossAdapter = createBossAdapter();
  currentAdapter = bossAdapter;
  currentInputCount = 2; // Boss uses both buttons
  
  bossAdapter.startMinigame({
    gameId: 'BOSS',
    stageId: 'C4', // Not really used, but required by interface
    runId: state.runPlan.seed.toString(),
    container: elements.minigameRoot,
    setControlLabels: updateControlLabels,
    onComplete: handleBossComplete,
    onFail: handleBossFail,
  });
  
  updateDebugButtons();
}

function handleBossComplete(): void {
  console.log('[Main] Boss completed! Escaping...');
  
  // Clean up boss
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  elements.minigameRoot.innerHTML = '';
  
  // Transition to ending with white flash
  showEscapeTransition();
}

function handleBossFail(): void {
  console.log('[Main] Boss failed - Game Over!');
  // Boss is instant death
  showGameOver();
}

function showEscapeTransition(): void {
  // Create white flash overlay
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: white;
    opacity: 0;
    transition: opacity 0.5s ease-in;
    z-index: 1000;
    pointer-events: none;
  `;
  document.body.appendChild(flash);
  
  // Fade to white
  requestAnimationFrame(() => {
    flash.style.opacity = '1';
  });
  
  // After white flash, show sunrise and fade out
  setTimeout(() => {
    // Set sunrise background
    elements.sceneBg.style.backgroundColor = '';
    elements.sceneBg.style.backgroundImage = `url('/assets/scenes/sunrise_frame_1.png')`;
    
    // Fade from white
    flash.style.transition = 'opacity 1s ease-out';
    flash.style.opacity = '0';
    
    // Cycle through sunrise frames
    setTimeout(() => {
      elements.sceneBg.style.backgroundImage = `url('/assets/scenes/sunrise_frame_2.png')`;
    }, 400);
    setTimeout(() => {
      elements.sceneBg.style.backgroundImage = `url('/assets/scenes/sunrise_frame_3.png')`;
    }, 800);
    
    // Show ending after transition
    setTimeout(() => {
      flash.remove();
      showEnding();
    }, 1500);
  }, 600);
}

function showEnding(): void {
  state.phase = 'ENDING';

  // [audio] Silence after the win: fade out and stop every music track and ambience,
  // cancelling anything scheduled (a pending loop handoff or crossfade), then play the
  // victory sound once. Nothing starts music again until Replay returns to the menu.
  audio.stopMusic();
  audio.playSfx('victory');
  
  // Show sunrise ending
  elements.sceneBg.style.backgroundImage = `url('/assets/scenes/sunrise_frame_3.png')`;
  
  elements.minigameRoot.innerHTML = `
    <div style="color: #5cff9d; padding: 40px; text-align: center; font-family: monospace;">
      <h2 style="color: #5cff9d; margin-bottom: 20px;">ESCAPED!</h2>
      <p style="color: #8fa89a;">You made it out of the bunker.</p>
      <p style="color: #5a6a62; margin-top: 20px; font-size: 12px;">
        The signal is dead. You are free.
      </p>
    </div>
  `;
  
  updateControlLabels({ left: '—', right: '—' });

  // Ending scene input: after the victory sound, either button replays (back to the menu).
  if (currentAdapter) {
    currentAdapter.dispose();
    currentAdapter = null;
  }
  let replayReady = false;
  const replayTimer = window.setTimeout(() => {
    replayReady = true;
    updateControlLabels({ left: 'Replay', right: 'Replay' });
  }, ENDING_REPLAY_DELAY_MS);
  currentAdapter = {
    handleInput: () => {
      if (!replayReady) return;
      console.log('[Main] Replay: back to the main menu');
      showMainMenu(); // [audio] plays the menu track again
    },
    dispose: () => window.clearTimeout(replayTimer),
  };
}

// ---- Input Handling ----

function sendInput(button: Button): void {
  if (!currentAdapter) return;

  const btnEl = button === 'LEFT' ? elements.btnLeft : elements.btnRight;
  if (btnEl.classList.contains('disabled')) return;

  currentAdapter.handleInput(button);
}

function handleButtonPress(button: Button, btnEl: HTMLButtonElement): void {
  audio.unlock(); // [audio] browsers only allow sound after a user gesture
  if (btnEl.classList.contains('disabled')) return;

  btnEl.classList.add('pressed');
  sendInput(button);
}

function handleButtonRelease(btnEl: HTMLButtonElement): void {
  btnEl.classList.remove('pressed');
}

// ---- Event Listeners ----

// Game over buttons
elements.btnRestart.addEventListener('click', restartRun);
elements.btnMenu.addEventListener('click', goToMainMenu);

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

// Single button (sends LEFT for one-button games)
elements.btnSingle.addEventListener('mousedown', () => handleButtonPress('LEFT', elements.btnSingle));
elements.btnSingle.addEventListener('mouseup', () => handleButtonRelease(elements.btnSingle));
elements.btnSingle.addEventListener('mouseleave', () => handleButtonRelease(elements.btnSingle));
elements.btnSingle.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleButtonPress('LEFT', elements.btnSingle);
});
elements.btnSingle.addEventListener('touchend', () => handleButtonRelease(elements.btnSingle));

// Keyboard input
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  const key = e.key.toLowerCase();
  
  // Handle game over screen with A/D keys (there is no run state while the menu is open)
  if (!inMainMenu && state.phase === 'GAME_OVER') {
    if (key === 'arrowleft' || key === 'a') {
      e.preventDefault();
      restartRun();
    } else if (key === 'arrowright' || key === 'd') {
      e.preventDefault();
      goToMainMenu();
    }
    return;
  }
  
  if (key === 'arrowleft' || key === 'a') {
    e.preventDefault();
    handleButtonPress('LEFT', elements.btnLeft);
  } else if (key === 'arrowright' || key === 'd') {
    e.preventDefault();
    handleButtonPress('RIGHT', elements.btnRight);
  } else if (key === 's') {
    // S key for single-button games (sends LEFT)
    e.preventDefault();
    if (currentInputCount === 1) {
      handleButtonPress('LEFT', elements.btnSingle);
    }
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') {
    handleButtonRelease(elements.btnLeft);
  } else if (key === 'arrowright' || key === 'd') {
    handleButtonRelease(elements.btnRight);
  } else if (key === 's') {
    handleButtonRelease(elements.btnSingle);
  }
});

// Debug game selection buttons are built from the registry in init().

// ---- Initialization ----

function init(): void {
  console.log('[Main] Initializing Please Hold...');

  // Log available games
  const allGames = getReadyGames();
  const oneBtn = getOneButtonGames();
  const twoBtn = getTwoButtonGames();

  console.log('[Main] Ready games:', allGames.map(g => `${g.id} (${g.inputCount}btn)`).join(', '));
  console.log(`[Main] One-button games: ${oneBtn.map(g => g.id).join(', ') || '(none)'}`);
  console.log(`[Main] Two-button games: ${twoBtn.map(g => g.id).join(', ') || '(none)'}`);

  if (allGames.length === 0) {
    console.error('[Main] No ready games available!');
    elements.minigameRoot.innerHTML = `
      <div style="color: #ff6b57; padding: 20px; text-align: center; font-family: monospace;">
        No games available.<br>Check console for errors.
      </div>
    `;
    return;
  }

  if (oneBtn.length === 0) {
    console.error('[Main] No one-button games for C1!');
    elements.minigameRoot.innerHTML = `
      <div style="color: #ff6b57; padding: 20px; text-align: center; font-family: monospace;">
        Error: Need at least one one-button game for C1.<br>
        Available: ${allGames.map(g => `${g.id}(${g.inputCount}btn)`).join(', ')}
      </div>
    `;
    return;
  }

  // Initialize UI (stage and lives displays are set up per run in beginRun)
  buildDebugButtons();

  void audio.preload(); // [audio] decode every track now so transitions are instant

  // The main menu is the entry scene; Start creates the run and starts its first game.
  showMainMenu();

  // Show the app (hidden until ready to prevent flash)
  document.getElementById('app')?.classList.add('ready');
}

// Start the app
init();
