// Public audio API for the controller. One shared engine instance for the app.
//
//   audio.preload()                  at startup (decodes every track)
//   audio.unlock()                   on the first LEFT/RIGHT input
//   audio.playMusic(trackForMinigame(gameId, scene, MINIGAME_TRACKS))  when a game starts
//   audio.playMusic(trackForScene(scene))                                when it completes
//   audio.getBeatClock()             beats since the current track's first downbeat
//   audio.playSfx("victory")
//   audio.setMusicEnabled(bool) / isMusicEnabled()   global music toggle, saved in localStorage
//   audio.duckMusic(factor) / setMusicSuppressed(bool) / stopMusic() / resetRun()

import { createAudioEngine, type AudioEngine } from './engine';
import { TRACKS } from './tracks';
import { createWebAudioBackend } from './webaudio-backend';

export type { AudioEngine, GameplayMusicStart, Scene, StageId } from './engine';
export {
  trackForHub,
  trackForMinigame,
  trackForScene,
  trackOnMinigameLoad,
  MUSIC_DUCK_FOR_VICTORY,
} from './engine';
export { GAMES_WITH_OWN_AUDIO, MINIGAME_TRACKS, TRACKS } from './tracks';

/** localStorage key for the music on/off setting ("on" / "off"). */
export const MUSIC_SETTING_KEY = 'pleasehold.music';

function loadMusicSetting(): boolean {
  try {
    return localStorage.getItem(MUSIC_SETTING_KEY) !== 'off';
  } catch {
    return true; // no storage (private mode, sandbox): music on
  }
}

function saveMusicSetting(enabled: boolean): void {
  try {
    localStorage.setItem(MUSIC_SETTING_KEY, enabled ? 'on' : 'off');
  } catch {
    // no storage: the setting just lasts for this session
  }
}

export const audio: AudioEngine = createAudioEngine(createWebAudioBackend(), TRACKS, {
  musicEnabled: loadMusicSetting(),
  onMusicEnabledChange: saveMusicSetting,
});
