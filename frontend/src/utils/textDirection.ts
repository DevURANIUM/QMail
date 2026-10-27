/** Ignore mail reply prefixes; use the first actual letter, not punctuation or digits. */
export function textDirection(text: string): 'rtl' | 'ltr' {
  const content = text.replace(/^(?:(?:re|fw|fwd):\s*)+/gi, '');
  for (const character of content) {
    if (/\p{Letter}/u.test(character)) {
      return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(character) ? 'rtl' : 'ltr';
    }
  }
  return 'ltr';
}
