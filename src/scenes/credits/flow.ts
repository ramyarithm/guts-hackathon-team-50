// The audio rules around the credits, as the controller applies them. Kept here so they can
// be proved against the engine without the DOM: silence after the win (the victory sound
// once, then nothing), the credits never start or stop music, and returning to the menu
// asks for the menu track, which is a no-op when it is already playing.

export type CreditsEntry = 'win' | 'menu';

/** The subset of the audio engine the flow needs. */
export interface FlowAudio {
  stopMusic(): void;
  playSfx(key: string): void;
  playMusic(key: string): void;
}

/** The ending: fade out and stop every track, then play the victory sound once. */
export function enterEndingAudio(audio: FlowAudio): void {
  audio.stopMusic();
  audio.playSfx('victory');
}

/**
 * Entering the credits touches no audio: after a win that keeps the silence, and from the
 * menu it keeps the menu music running.
 */
export function enterCreditsAudio(_audio: FlowAudio, _entry: CreditsEntry): void {
  // intentionally nothing
}

/** Main menu from the credits: the menu track (ignored by the engine if already playing). */
export function leaveCreditsToMenuAudio(audio: FlowAudio): void {
  audio.playMusic('menu');
}
