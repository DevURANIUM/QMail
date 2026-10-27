/**
 * Deterministic sender avatars: initials + a stable color per address.
 * Hues are deep enough for white text on both themes.
 */

const AVATAR_COLORS = [
  '#2a63c9', // blue
  '#6d4fc4', // violet
  '#0e8a6a', // teal
  '#c05621', // burnt orange
  '#b03274', // magenta
  '#5b7285', // slate
];

export function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitials(nameOrEmail: string): string {
  const cleaned = nameOrEmail.trim();
  if (!cleaned) return '?';

  // "Ada Lovelace" → AL ; "ada@x.com" → AD
  const namePart = cleaned.includes('@') ? cleaned.split('@')[0] : cleaned;
  const words = namePart.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return namePart.slice(0, 2).toUpperCase();
}
