// The audio manifest. Files are referenced exactly as they are named in assets/ (spaces
// and brackets included); Vite hashes them into the build and handles the URLs.

import menuUrl from '../../assets/main menu music.mp3';
import c1Url from '../../assets/c1.mp3';
import c1NoDrumsUrl from '../../assets/c1(no drums).mp3';
import c2Url from '../../assets/c2.mp3';
import c3Url from '../../assets/c3.mp3';
import c4Url from '../../assets/c4.mp3';
import creepyUrl from '../../assets/creepy sounds.mp3';
import victoryUrl from '../../assets/victory sound.mp3';
import gameOverMusicUrl from '../../assets/game over music.mp3';
import {
  C1_BARS,
  C1_BPM,
  C1_LOOP_END_OFFSET_MS,
  C1_LOOP_START_OFFSET_MS,
  type TrackManifest,
} from './engine';

export const TRACKS: TrackManifest = {
  // Music (all loop). "menu" has no scene yet; see README.
  menu: { url: menuUrl, kind: 'music', loop: true },
  // Stage C1: the drums track, just looped on whole bars (no intro, no handoff).
  c1: {
    url: c1Url,
    kind: 'music',
    loop: true,
    bpm: C1_BPM,
    bars: C1_BARS,
    loopStartOffsetMs: C1_LOOP_START_OFFSET_MS,
    loopEndOffsetMs: C1_LOOP_END_OFFSET_MS,
  },
  // G4 (whichever stage it is in): the drums track once as an intro, then it hands off to
  // the no-drums loop on the exact end sample. Same file as c1, decoded once.
  g4: {
    url: c1Url,
    kind: 'music',
    loop: false,
    intro: true,
    handoffTo: 'c1_loop',
    bpm: C1_BPM,
    bars: C1_BARS,
    loopStartOffsetMs: C1_LOOP_START_OFFSET_MS,
    loopEndOffsetMs: C1_LOOP_END_OFFSET_MS,
  },
  c1_loop: {
    url: c1NoDrumsUrl,
    kind: 'music',
    loop: true,
    bpm: C1_BPM,
    bars: C1_BARS,
    loopStartOffsetMs: C1_LOOP_START_OFFSET_MS,
    loopEndOffsetMs: C1_LOOP_END_OFFSET_MS,
  },
  c2: { url: c2Url, kind: 'music', loop: true },
  c3: { url: c3Url, kind: 'music', loop: true },
  c4: { url: c4Url, kind: 'music', loop: true },
  // Boss fight ambience: 26 s continuous creepy texture, looped. No separate stinger file exists.
  boss: { url: creepyUrl, kind: 'music', loop: true },

  // One-shots.
  victory: { url: victoryUrl, kind: 'sfx', loop: false },
  // Game over music plays when a minigame fails.
  gameover_music: { url: gameOverMusicUrl, kind: 'music', loop: true },
};

/**
 * Minigames whose music overrides the stage track while they run (key = track key). The
 * controller crossfades into it when the game starts and back when the game completes.
 */
export const MINIGAME_TRACKS: Readonly<Record<string, string>> = { G4: 'g4' };

/**
 * Minigames that play their own audio outside this engine; the music bus is silenced while
 * they run. Empty today: G4's music now comes from the engine (see MINIGAME_TRACKS).
 */
export const GAMES_WITH_OWN_AUDIO: ReadonlySet<string> = new Set<string>();
