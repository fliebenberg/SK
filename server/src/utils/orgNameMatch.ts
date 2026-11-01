import { levenshtein } from '@sk/shared';

/**
 * Could the name someone is typing for a new organisation be one already on ScoreKeeper?
 *
 * Stricter than `searchSimilarOrganizations`, which finds things to choose from and so may match on
 * any one word: asked of a new school, "Greenfield High" must not turn up every other "… High". So
 * the words that say what *kind* of organisation it is do not count, and every word left in the
 * shorter name has to be in the longer one, give or take a typing slip. "Boys" and "Girls" count on
 * purpose: Rondebosch Boys is not Rondebosch Girls.
 *
 * It is only ever a question to the person adding it, never a refusal: two schools may well share a
 * name. So it leans towards asking.
 */
const KIND_WORDS = new Set([
  'high', 'school', 'skool', 'hoerskool', 'laerskool', 'primary', 'secondary', 'preparatory', 'prep',
  'college', 'academy', 'club', 'sports', 'sport', 'society', 'association', 'union', 'league',
  'fc', 'afc', 'rfc', 'st', 'saint', 'the', 'of', 'and', 'for', 'die', 'de', 'van', 'der',
]);

/** Below this a name has not said enough to compare ("St", half a word still being typed). */
const MIN_LENGTH = 3;

/** Accents, case, apostrophes and punctuation are not what tells two organisations apart. */
export function normalizeOrgName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** One slip in a short word, two in a long one; none in a word too short to tell, or in a number. */
function slipsAllowed(word: string): number {
  if (word.length < 5 || /\d/.test(word)) return 0;
  return word.length < 8 ? 1 : 2;
}

/** "Fred" and "Fred's", "John" and "Johns": a trailing s is never what tells two names apart. */
function isSameWord(a: string, b: string): boolean {
  return a === b || a + 's' === b || b + 's' === a || levenshtein(a, b) <= Math.min(slipsAllowed(a), slipsAllowed(b));
}

/**
 * How well `typed` matches an existing organisation: 0 is no match, and higher is closer. An
 * identical name ranks first, then a typed name that is the other's short code, then names sharing
 * every telling word, the fewest words apart first.
 */
export function orgNameMatchScore(typed: string, name: string, shortName?: string | null): number {
  const a = normalizeOrgName(typed);
  if (a.length < MIN_LENGTH) return 0;
  const b = normalizeOrgName(name);
  if (a === b) return 100;
  if (shortName && a === normalizeOrgName(shortName)) return 90;

  const telling = (text: string) => text.split(' ').filter(word => !KIND_WORDS.has(word));
  const typedWords = telling(a);
  const nameWords = telling(b);
  if (!typedWords.length || !nameWords.length) return 0;

  // "Water Kloof" and "Waterkloof".
  const joined = typedWords.join('');
  if (isSameWord(joined, nameWords.join(''))) return 80;

  const [shorter, longer] = typedWords.length <= nameWords.length ? [typedWords, nameWords] : [nameWords, typedWords];
  if (!shorter.every(word => longer.some(other => isSameWord(word, other)))) return 0;
  return Math.max(1, 70 - (longer.length - shorter.length) * 5);
}

/**
 * Could a name given on an application be this person on an organisation's records? Every word of the
 * shorter name in the longer, give or take a slip: "Thabo Mokoena" and "Thabo M Mokoena". Only ever a
 * question to whoever decides. 0 is no match.
 */
export function personNameMatchScore(given: string, name: string): number {
  const words = (text: string) => normalizeOrgName(text).split(' ').filter(Boolean);
  const a = words(given);
  const b = words(name);
  if (!a.length || !b.length) return 0;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!shorter.every(word => longer.some(other => isSameWord(word, other)))) return 0;
  return Math.max(1, 70 - (longer.length - shorter.length) * 5);
}

/**
 * How well an organisation answers a search in a picker: 0 is not at all, and higher is better. Looser
 * than a possible duplicate, since half a word has to find it: any telling word will do, at the start
 * of a word or with a slip, or the whole text anywhere in the name. "Greenfield High" still does not
 * list every "… High", but "High" alone does.
 */
export function orgSearchScore(search: string, name: string, shortName?: string | null): number {
  const query = normalizeOrgName(search);
  if (!query) return 0;
  const orgName = normalizeOrgName(name);
  const code = normalizeOrgName(shortName || '');
  const orgWords = orgName.split(' ').concat(code ? [code] : []);

  const wordScore = (word: string) => {
    let best = 0;
    for (const other of orgWords) {
      if (other === word) return 10;
      if (other.startsWith(word)) best = Math.max(best, 5);
      if (word.length > 2 && other.length > 2 && levenshtein(word, other) <= (word.length > 5 ? 2 : 1)) best = Math.max(best, 3);
    }
    return best;
  };

  const words = query.split(' ');
  const tellingWords = words.filter(word => !KIND_WORDS.has(word));
  const found = (tellingWords.length ? tellingWords : words).some(word => wordScore(word) > 0);
  if (!found) return orgName.includes(query) || code.includes(query) ? 2 : 0;

  let score = words.reduce((total, word) => total + wordScore(word), 0);
  if (orgName === query) score += 100;
  else if (orgName.startsWith(query)) score += 20;
  if (code === query) score += 50;
  return score;
}
