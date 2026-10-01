import { describe, expect, it } from 'vitest';
import { cellphoneKey, cellphoneSearchDigits, parseCellphone } from './phone';

const read = (text: string) => {
  const parsed = parseCellphone(text);
  return parsed?.ok ? parsed.value : parsed ? 'refused' : null;
};

describe('reading a cellphone number', () => {
  it('reads the ways a South African number is typed as one value', () => {
    for (const typed of ['082 555 0100', '0825550100', '082-555-0100', '(082) 555 0100', '082.555.0100',
      '+27 82 555 0100', '+27825550100', '0027 82 555 0100', '27825550100', '+27 082 555 0100']) {
      expect(read(typed), typed).toBe('+27825550100');
    }
  });

  it('puts back the 0 Excel drops from a number stored as a number', () => {
    expect(read('825550100')).toBe('+27825550100');
  });

  it('keeps an international number as it is', () => {
    expect(read('+44 7700 900123')).toBe('+447700900123');
    expect(read('0044 7700 900123')).toBe('+447700900123');
    expect(read('+1 (415) 555-0100')).toBe('+14155550100');
  });

  it('refuses what is not a number, or has the wrong number of digits', () => {
    for (const typed of ['082 555 010', '082 555 01000', '82555010', '0800', 'call me', '082 555 0100 x2',
      '+27 82 555 010', '+123', '+1234567890123456', '08+25550100']) {
      expect(read(typed), typed).toBe('refused');
    }
  });

  it('says what it wants, with examples', () => {
    const parsed = parseCellphone('0800');
    expect(parsed?.ok).toBe(false);
    expect(parsed && !parsed.ok && parsed.problem).toBe('"0800" is not a cellphone number we can read. Use a South African number or an international one starting with +, such as 082 555 0100, +27 82 555 0100 or +44 7700 900123.');
  });

  it('treats blank as nothing to store', () => {
    expect(parseCellphone('  ')).toBeNull();
    expect(parseCellphone(null)).toBeNull();
  });
});

describe('comparing stored numbers', () => {
  it('matches a number saved as typed with the same number in international form', () => {
    expect(cellphoneKey('082 555 0100')).toBe(cellphoneKey('+27825550100'));
  });

  it('still compares a number it cannot read, by its digits', () => {
    expect(cellphoneKey('0800-FLOWERS')).toBe('0800');
  });
});

describe('searching for a number', () => {
  it('drops the leading 0, which is not stored', () => {
    expect(cellphoneSearchDigits('082 555')).toBe('82555');
    expect(cellphoneSearchDigits('+27 82')).toBe('2782');
  });

  it('is not a number search for a name, or for too few digits', () => {
    expect(cellphoneSearchDigits('Anika')).toBeNull();
    expect(cellphoneSearchDigits('08')).toBeNull();
  });
});
