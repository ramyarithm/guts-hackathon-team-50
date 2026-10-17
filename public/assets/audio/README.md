# G3 Rhythm Game Audio Files

## Required Files

Place these files in this directory (`public/assets/audio/`):

1. **rhythm-drums.mp3** - The full track WITH drums/beat audible
2. **rhythm-beatless.mp3** - The same track WITHOUT drums (just melody/bass/other instruments)

## Specifications

- **Tempo**: 129 BPM (beats per minute)
- **Format**: MP3 (recommended) or other web-compatible format
- **Duration**: At least 35 seconds (5s intro + 30s gameplay)
- **Important**: Both tracks must be the same length and perfectly synced so switching between them at any point is seamless

## How It Works

1. Game starts playing `rhythm-drums.mp3` for 5 seconds (intro phase)
2. At the 5-second mark, audio switches to `rhythm-beatless.mp3`
3. Player must continue tapping to the beat without the drums as a guide
4. Game ends after ~35 seconds total

## Creating the Audio

If you have a DAW (Digital Audio Workstation):
1. Create/find a track at 103 BPM
2. Export two versions:
   - Full mix with drums
   - Same mix with drum track muted
3. Ensure both exports start at exactly the same point

## Placeholder Mode

If audio files are not present, the game will still work visually - it just won't play sound. The beat timing is calculated mathematically based on BPM, not detected from audio.
