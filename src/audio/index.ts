// Public audio API for the controller. One shared engine instance for the app.
//
//   audio.preload()                  at startup (decodes every track)
//   audio.unlock()                   on the first LEFT/RIGHT input
//   audio.playMusic(trackForMinigame(gameId, scene, MINIGAME_TRACKS))  when a game starts
//   audio.playMusic(trackForScene(scene))                                when it completes
//   audio.getBeatClock()             beats since the current track's first downbeat
//   audio.playSfx("victory")
//   audio.duckMusic(factor) / setMusicSuppressed(bool) / stopMusic() / resetRun()

import { createAudioEngine, type AudioEngine } from "./engine";
import { TRACKS } from "./tracks";
import { createWebAudioBackend } from "./webaudio-backend";

export type { AudioEngine, Scene, StageId } from "./engine";
export { trackForHub, trackForMinigame, trackForScene, MUSIC_DUCK_FOR_VICTORY } from "./engine";
export { GAMES_WITH_OWN_AUDIO, MINIGAME_TRACKS, TRACKS } from "./tracks";

export const audio: AudioEngine = createAudioEngine(createWebAudioBackend(), TRACKS);
