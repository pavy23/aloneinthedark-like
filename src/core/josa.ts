// Korean particles depend on whether the previous syllable ends in a consonant (받침).
// josa('도끼', '을/를') -> '도끼를', josa('열쇠', '을/를') -> '열쇠를', josa('핸들', '을/를') -> '핸들을'.

export function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // Non-Hangul endings (digits, latin): treat like how they are usually read.
  return /[013678LMNR]$/i.test(ch);
}

/** For '으로/로' the ㄹ batchim takes '로'. */
function endsWithRieul(word: string): boolean {
  const code = word.trim().slice(-1).charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
}

export function josa(word: string, pair: '을/를' | '이/가' | '은/는' | '과/와' | '으로/로'): string {
  const [withB, withoutB] = pair.split('/');
  if (pair === '으로/로') return word + (hasBatchim(word) && !endsWithRieul(word) ? withB : withoutB);
  return word + (hasBatchim(word) ? withB : withoutB);
}
