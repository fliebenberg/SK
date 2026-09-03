import { describe, expect, it } from 'vitest';
import { isCollapsed, stageSublabel, structureAnnouncement } from './collapseRule';
import { resolveEventType, tournamentFormatLabel, unknownEventTypeMessage } from './eventType';
import { stagePlanForFormat } from '../models/event/Tournament';

/**
 * Three rules from Phase 5 that have to keep holding, all of them cheap to break by accident:
 *
 * - **U15** — a level with exactly one child renders inline and shows no picker.
 * - **U39 / `FIX-1`** — an event type we cannot name is an error, never a Tournament by default.
 * - **D11** — a division always has at least one stage, whatever format it was created under.
 */

describe('the collapse rule (U15)', () => {
  it('collapses nothing, and one', () => {
    // Zero matters as much as one: a tournament with no divisions yet must not render a picker
    // over an empty list.
    expect(isCollapsed(0)).toBe(true);
    expect(isCollapsed(1)).toBe(true);
  });

  it('stops collapsing the moment a second child exists', () => {
    expect(isCollapsed(2)).toBe(false);
    expect(isCollapsed(15)).toBe(false);
  });
});

describe('announcing a structural change (U15)', () => {
  it('says what will happen before it happens', () => {
    const announcement = structureAnnouncement({ level: 'division', existingName: 'u14 Rugby' });
    expect(announcement.title).toMatch(/restructure/i);
    expect(announcement.description).toContain('u14 Rugby');
  });

  it('leaves the name out when there is nothing named to mention', () => {
    const announcement = structureAnnouncement({ level: 'stage' });
    expect(announcement.description).not.toContain('is called');
  });
});

describe('stage sublabels (U14)', () => {
  it('reads as state rather than as arithmetic', () => {
    expect(stageSublabel({ played: 7, total: 7 })).toBe('complete');
    expect(stageSublabel({ played: 4, total: 7 })).toBe('4 of 7 played');
    expect(stageSublabel({ played: 0, total: 7 })).toBe('7 to play');
    expect(stageSublabel({ played: 0, total: 0 })).toBe('no fixtures');
  });

  it('calls an empty stage complete only when it says it is', () => {
    expect(stageSublabel({ status: 'Complete', played: 0, total: 0 })).toBe('complete');
  });
});

describe('resolving an event type (U39 / FIX-1)', () => {
  it('names the two types that exist', () => {
    expect(resolveEventType({ type: 'SingleMatch' }).kind).toBe('SingleMatch');
    expect(resolveEventType({ type: 'Tournament' }).kind).toBe('Tournament');
  });

  it('does not fall through to Tournament', () => {
    // The whole of FIX-1 in one assertion. An untyped row used to render as a Tournament, get
    // Tournament navigation and the wrong actions, and say nothing about it.
    expect(resolveEventType({}).kind).toBe('Unknown');
    expect(resolveEventType(null).kind).toBe('Unknown');
    expect(resolveEventType({ type: 'SportsDay' } as any).kind).toBe('Unknown');
  });

  it('carries the value it met so the error state can name it', () => {
    const resolved = resolveEventType({ type: 'SportsDay' } as any);
    expect(unknownEventTypeMessage(resolved)).toContain('SportsDay');
    expect(unknownEventTypeMessage(resolveEventType({}))).toContain('no type');
  });
});

describe('format labels (U34)', () => {
  it('labels a format with its stored value, so "Sports Day" cannot come back', () => {
    expect(tournamentFormatLabel({ format: 'Festival' })).toBe('Festival');
    expect(tournamentFormatLabel({ format: 'PoolsKnockout' })).toBe('Pools & Knockout');
    expect(tournamentFormatLabel({})).toBe('Festival');
  });
});

describe('the stages a division is created with (D11)', () => {
  it('gives every format at least one stage', () => {
    for (const format of ['Festival', 'RoundRobin', 'Knockout', 'PoolsKnockout'] as const) {
      expect(stagePlanForFormat(format).length).toBeGreaterThan(0);
    }
  });

  it('gives an unset format a Festival stage rather than none', () => {
    expect(stagePlanForFormat(undefined)).toEqual([
      { name: 'Fixtures', format: 'Festival', sequence: 1 },
    ]);
  });

  it('is the one format that is genuinely two stages', () => {
    const plan = stagePlanForFormat('PoolsKnockout');
    expect(plan.map(s => s.name)).toEqual(['Pools', 'Knockout']);
    expect(plan.map(s => s.format)).toEqual(['RoundRobin', 'Knockout']);
    expect(plan.map(s => s.sequence)).toEqual([1, 2]);
  });

  it('names stages for the organiser rather than for the format', () => {
    // A PoolsKnockout division shows "Pools", not "RoundRobin". The word an organiser uses.
    expect(stagePlanForFormat('PoolsKnockout')[0].name).not.toBe('RoundRobin');
  });
});
