import { describe, expect, it } from 'vitest';
import { organizerScopeFields, organizerScopeOf } from './organizerScope';

describe('which scope an appointment names (D33, widened 2026-09-20)', () => {
  it('reads each scope off the fields that express it', () => {
    expect(organizerScopeOf({ eventId: 'e1' })).toEqual({ kind: 'event', eventId: 'e1' });
    expect(organizerScopeOf({ eventId: 'e1', sportId: 's1' })).toEqual({
      kind: 'sport',
      eventId: 'e1',
      sportId: 's1',
    });
    expect(organizerScopeOf({ divisionId: 'd1' })).toEqual({ kind: 'division', divisionId: 'd1' });
  });

  it('lets the most specific field present win', () => {
    // The case the three-scope model introduced: an event id now travels with a sport grant, so it
    // no longer implies event scope on its own.
    expect(organizerScopeOf({ eventId: 'e1', sportId: 's1', divisionId: 'd1' })?.kind).toBe('division');
    expect(organizerScopeOf({ eventId: 'e1', divisionId: 'd1' })?.kind).toBe('division');
  });

  it('names nothing rather than guessing', () => {
    expect(organizerScopeOf(null)).toBeNull();
    expect(organizerScopeOf(undefined)).toBeNull();
    expect(organizerScopeOf({})).toBeNull();
    // A sport without its tournament is not a grant anybody can hold: the same sport in another
    // tournament is somebody else's job.
    expect(organizerScopeOf({ sportId: 's1' })).toBeNull();
    // Empty strings are absent fields, not scopes.
    expect(organizerScopeOf({ eventId: '', divisionId: '' })).toBeNull();
  });

  it('round-trips through the fields it would be sent as', () => {
    for (const scope of [
      { kind: 'event', eventId: 'e1' },
      { kind: 'sport', eventId: 'e1', sportId: 's1' },
      { kind: 'division', divisionId: 'd1' },
    ] as const) {
      expect(organizerScopeOf(organizerScopeFields(scope))).toEqual(scope);
    }
  });
});
