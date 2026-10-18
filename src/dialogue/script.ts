// Loads and validates assets/Dialogue/dialogue.json. The JSON is imported as is (bundler
// import) and checked at load: a malformed section or line logs a warning and is skipped,
// so a mistake in the script can never crash the game. Nothing here knows the PIN.

export const SPEAKERS = ['ENGINEER', 'SUPERVISOR', 'COLLEAGUE_RECORDING', 'SYSTEM'] as const;
export type Speaker = (typeof SPEAKERS)[number];

export interface Line {
  id: string;
  speaker: Speaker;
  text: string;
  /** Tunnel lines only: the gameplay event that shows them. */
  trigger?: string;
}

export interface DialogueScript {
  title: string;
  /** Display names per speaker (from meta.speakers when present). */
  speakers: Record<string, string>;
  /** Sections by id, in the JSON's listed order. */
  stages: Record<string, Line[]>;
  /** Completion reactions by game id (G1..G8). */
  reactions: Record<string, Line[]>;
}

/** The tunnel events the boss fight emits, in the order the script lists them. */
export const TUNNEL_TRIGGERS = [
  'tunnel_enter',
  'monster_first_detected',
  'monster_reacts_to_flashlight',
  'light_mechanic_revealed',
] as const;
export type TunnelTrigger = (typeof TUNNEL_TRIGGERS)[number];

export type Warn = (message: string) => void;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isSpeaker = (v: unknown): v is Speaker =>
  typeof v === 'string' && (SPEAKERS as readonly string[]).includes(v);

function parseLines(raw: unknown, where: string, warn: Warn): Line[] {
  if (!Array.isArray(raw)) {
    warn(`[dialogue] ${where}: "lines" is missing or not a list; section skipped`);
    return [];
  }
  const lines: Line[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.text !== 'string' || !isSpeaker(entry.speaker)) {
      warn(
        `[dialogue] ${where}: line ${index} is malformed (needs text and a known speaker); skipped`,
      );
      return;
    }
    const line: Line = {
      id: typeof entry.id === 'string' ? entry.id : `${where}-${index}`,
      speaker: entry.speaker,
      text: entry.text,
    };
    if (typeof entry.trigger === 'string') line.trigger = entry.trigger;
    lines.push(line);
  });
  return lines;
}

/** Validate the raw JSON into a script. Never throws. */
export function loadScript(raw: unknown, warn: Warn = (m) => console.warn(m)): DialogueScript {
  const script: DialogueScript = { title: '', speakers: {}, stages: {}, reactions: {} };
  if (!isRecord(raw)) {
    warn('[dialogue] dialogue.json is not an object; no dialogue will play');
    return script;
  }
  const meta = isRecord(raw.meta) ? raw.meta : {};
  if (typeof meta.title === 'string') script.title = meta.title;
  else warn('[dialogue] meta.title missing');
  if (isRecord(meta.speakers)) {
    for (const [k, v] of Object.entries(meta.speakers))
      if (typeof v === 'string') script.speakers[k] = v;
  }
  if (isRecord(raw.stages)) {
    for (const [id, section] of Object.entries(raw.stages)) {
      if (!isRecord(section)) {
        warn(`[dialogue] stages.${id} is not an object; section skipped`);
        continue;
      }
      script.stages[id] = parseLines(section.lines, `stages.${id}`, warn);
    }
  } else {
    warn('[dialogue] stages missing; no story will play');
  }
  if (isRecord(raw.minigame_reactions)) {
    for (const [id, entry] of Object.entries(raw.minigame_reactions)) {
      if (!isRecord(entry)) {
        warn(`[dialogue] minigame_reactions.${id} is not an object; skipped`);
        continue;
      }
      script.reactions[id] = parseLines(entry.lines, `minigame_reactions.${id}`, warn);
    }
  } else {
    warn('[dialogue] minigame_reactions missing; completions will go straight to the story');
  }
  return script;
}

/** A section's lines in order, or [] (with a warning) if it does not exist. */
export function getSection(
  script: DialogueScript,
  id: string,
  warn: Warn = (m) => console.warn(m),
): Line[] {
  const lines = script.stages[id];
  if (!lines) {
    warn(`[dialogue] section "${id}" not found; skipped`);
    return [];
  }
  return lines;
}

/** The tunnel line for a gameplay trigger, or null. */
export function tunnelLine(script: DialogueScript, trigger: string): Line | null {
  return script.stages.tunnel?.find((l) => l.trigger === trigger) ?? null;
}
