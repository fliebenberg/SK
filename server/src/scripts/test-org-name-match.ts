import { orgNameMatchScore, orgSearchScore } from '../utils/orgNameMatch';

/**
 * What counts as a possible duplicate of an organisation already on ScoreKeeper (`orgNameMatch`):
 * close names are asked about, and names sharing only the words for a kind of organisation are not.
 * No database or server.
 *
 * Run: `npx ts-node src/scripts/test-org-name-match.ts`
 */

const failures: string[] = [];
let checks = 0;

function asked(typed: string, name: string, shortName?: string) {
  checks++;
  if (orgNameMatchScore(typed, name, shortName) <= 0) failures.push(`"${typed}" should be asked about "${name}"`);
}

function notAsked(typed: string, name: string, shortName?: string) {
  checks++;
  if (orgNameMatchScore(typed, name, shortName) !== 0) failures.push(`"${typed}" should not be asked about "${name}"`);
}

function ranksAbove(typed: string, closer: string, further: string) {
  checks++;
  if (orgNameMatchScore(typed, closer) <= orgNameMatchScore(typed, further)) failures.push(`"${closer}" should rank above "${further}" for "${typed}"`);
}

// The same name, however it is written.
asked('Springvale High', 'springvale high');
asked('  Springvale   High ', 'Springvale High');
asked("St. John's College", 'St Johns College');
asked('Hoërskool Doringkloof', 'Hoerskool Doringkloof');

// With or without the s, however short the word.
asked('Fred Club', "Fred's Club");
asked("Fred's Club", 'Fred Club');
asked('Freds', "Fred's Other Club");
asked('St John', "St John's College");

// More or fewer words.
asked('Springvale High School', 'Springvale High');
asked('Springvale', 'Springvale High School');
asked('Hoërskool Waterkloof', 'Waterkloof High');
asked('Rondebosch', 'Rondebosch Boys High School');
asked('Water Kloof', 'Waterkloof');

// Typing slips.
asked('Springvail High', 'Springvale High');
asked('Rondebosh', 'Rondebosch Boys High');

// Its short code.
asked('KES', 'King Edward VII School', 'KES');

// The words for a kind of organisation do not make two the same.
notAsked('Greenfield High', 'Springvale High');
notAsked('Greenfield College', 'Springvale College');
notAsked('Test Added Club', 'Test Unclaimed Cricket Club');
notAsked('High School', 'Springvale High School');

// The words that tell them apart do.
notAsked('Rondebosch Boys', 'Rondebosch Girls');
notAsked('Springvale Rugby Club', 'Springvale Cricket Club');
notAsked('Team 1', 'Team 2');
notAsked('King', 'Ring');

// Too little typed to say.
notAsked('St', 'St Johns College');
notAsked('', 'Springvale High');

ranksAbove('Springvale High', 'Springvale High', 'Springvale High School');
ranksAbove('Springvale', 'Springvale High', 'Springvale Cricket Club');

// A picker's search finds more, from less.
function finds(search: string, name: string, shortName?: string) {
  checks++;
  if (orgSearchScore(search, name, shortName) <= 0) failures.push(`searching "${search}" should find "${name}"`);
}
function missed(search: string, name: string) {
  checks++;
  if (orgSearchScore(search, name) !== 0) failures.push(`searching "${search}" should not find "${name}"`);
}
finds('Fred Club', "Fred's Club");
finds('Springvale High School', 'Springvale High');
finds('Springvail', 'Springvale High');
finds('Spring', 'Springvale High');
finds('vale', 'Springvale High');
finds('High', 'Springvale High');
finds('SVH', 'Springvale High', 'SVH');
missed('Greenfield High', 'Springvale High');
missed('Zzyzx', 'Springvale High');

if (failures.length) {
  console.error(`${failures.length} of ${checks} checks failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed.`);
