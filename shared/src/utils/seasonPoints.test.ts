import { describe, expect, it } from 'vitest';
import { seasonPointsFromInput } from './seasonPoints';

describe('seasonPointsFromInput', () => {
  it('keeps a typed 0', () => {
    expect(seasonPointsFromInput({ win: '0', draw: '0', loss: '0' })).toEqual({ ok: true, points: { pointsPerWin: 0, pointsPerDraw: 0, pointsPerLoss: 0 } });
  });
  it('takes the default for a blank field', () => {
    expect(seasonPointsFromInput({ win: ' ', draw: '', loss: '' })).toEqual({ ok: true, points: { pointsPerWin: 4, pointsPerDraw: 2, pointsPerLoss: 0 } });
  });
  it('reads whole numbers', () => {
    expect(seasonPointsFromInput({ win: '3', draw: ' 1 ', loss: '0' })).toEqual({ ok: true, points: { pointsPerWin: 3, pointsPerDraw: 1, pointsPerLoss: 0 } });
  });
  it('refuses anything else', () => {
    for (const bad of ['-1', '1.5', 'two', '3a']) {
      expect(seasonPointsFromInput({ win: bad, draw: '2', loss: '0' }).ok).toBe(false);
    }
  });
});
