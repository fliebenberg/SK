import { describe, expect, it } from 'vitest';
import { reseedDecision } from './liveForm';

type Draft = { name: string; sportId: string };
const same = (a: Draft, b: Draft) => a.name === b.name && a.sportId === b.sportId;
const decide = (baseline: Draft | null, drafts: Draft, incoming: Draft) =>
  reseedDecision({ baseline, drafts, incoming, same });

const RUGBY: Draft = { name: 'Rugby', sportId: 'rugby' };
const RENAMED: Draft = { name: 'Rugby A', sportId: 'rugby' };
const TYPING: Draft = { name: 'Rugb', sportId: 'rugby' };

describe('a live record changing under an open form', () => {
  it('adopts on first load, when there is nothing to protect', () => {
    expect(decide(null, RUGBY, RUGBY)).toBe('adopt');
  });

  it('does nothing when the record has not moved — an effect that writes anyway feeds itself', () => {
    expect(decide(RUGBY, RUGBY, RUGBY)).toBe('unchanged');
  });

  it('adopts another device\'s change when nothing has been typed here', () => {
    expect(decide(RUGBY, RUGBY, RENAMED)).toBe('adopt');
  });

  it('adopts this device\'s own save landing back, which is what lowers the Save row', () => {
    // Typed RENAMED, saved it, and the record has come back as RENAMED.
    expect(decide(RUGBY, RENAMED, RENAMED)).toBe('adopt');
  });

  it('keeps an edit in progress when the change is somebody else\'s', () => {
    expect(decide(RUGBY, TYPING, RENAMED)).toBe('keep');
  });

  it('says "unchanged" rather than "keep" while typing against a still record', () => {
    // The dirty state is the form's business; this only answers whether to re-seed, and there is
    // nothing to re-seed from.
    expect(decide(RUGBY, TYPING, RUGBY)).toBe('unchanged');
  });

  it('adopts for a different subject, because a new baseline arrives as null', () => {
    expect(decide(null, TYPING, RENAMED)).toBe('adopt');
  });
});
