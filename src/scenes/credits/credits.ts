// The credits content. Edit the team here and nowhere else: the scene, the navigation and
// the tests all read this constant. People are listed in alphabetical order by surname.

export interface Person {
  name: string;
  /** Public LinkedIn profile; must start with LINKEDIN_PREFIX or it is never opened. */
  url: string;
}

export const CREDITS_TITLE = 'PLEASE HOLD';
export const CREDITS_SUBTITLE = 'Made by Team 50';
export const CREDITS_OUTRO = 'Thanks for playing.';
/** The event, as the repository already names it (README, package name). */
export const CREDITS_EVENT = 'GUTS Hackathon · University of Glasgow';

export const LINKEDIN_PREFIX = 'https://www.linkedin.com/';

export const CREDITS: readonly Person[] = [
  { name: 'Mohammed Alkhulaifi', url: 'https://www.linkedin.com/in/mohammed-alkhulaifi/' },
  { name: 'Hirad Fakouri', url: 'https://www.linkedin.com/in/hirad-fakouri-78ba032b2/' },
  { name: 'Ramy Ghasemyani', url: 'https://www.linkedin.com/in/ramyar-ghasemyani-14bb97208/' },
  { name: 'Amir Pirzadeh', url: 'https://www.linkedin.com/in/ampirzadeh/' },
  { name: 'Parisan Vazirinejad', url: 'https://www.linkedin.com/in/parisan-vazirinejad/' },
];

/** The last word of a name, used for the alphabetical order check. */
export function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** Only LinkedIn profile URLs may ever be opened from the credits. */
export function isAllowedUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith(LINKEDIN_PREFIX);
}
