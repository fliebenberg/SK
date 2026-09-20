import { describe, expect, it } from 'vitest';
import { ORG_SHORT_CODE_MAX_LENGTH, deriveOrgShortCode, normalizeOrgShortCode } from './orgShortCode';

describe('deriving a code from an organisation name', () => {
  it('takes the initials of a multi-word name', () => {
    expect(deriveOrgShortCode('Springfield High School')).toBe('SHS');
    expect(deriveOrgShortCode('Northcliff High')).toBe('NH');
  });

  it('skips the connectors, which is the whole point', () => {
    expect(deriveOrgShortCode('University of Cape Town')).toBe('UCT');
    expect(deriveOrgShortCode('The Ridge School')).toBe('RS');
  });

  it('keeps a possessive as one word', () => {
    expect(deriveOrgShortCode("St John's College")).toBe('SJC');
  });

  it('gives a single-word name its first three letters, not one', () => {
    expect(deriveOrgShortCode('Northcliff')).toBe('NOR');
    expect(deriveOrgShortCode('Hoërskool')).toBe('HOË');
  });

  it('splits on hyphens and slashes as well as spaces', () => {
    expect(deriveOrgShortCode('Pretoria-Noord Primary')).toBe('PNP');
    expect(deriveOrgShortCode('Boys / Girls High')).toBe('BGH');
  });

  it('never exceeds the field', () => {
    const code = deriveOrgShortCode("St Mary's Diocesan School for Girls in Pretoria East");
    expect(code.length).toBeLessThanOrEqual(ORG_SHORT_CODE_MAX_LENGTH);
    expect(code).toBe('SMDSGP');
  });

  it('falls back to the connectors when a name is nothing else', () => {
    expect(deriveOrgShortCode('The')).toBe('THE');
  });

  it('derives nothing from nothing, rather than a placeholder', () => {
    expect(deriveOrgShortCode('')).toBe('');
    expect(deriveOrgShortCode('   ')).toBe('');
    expect(deriveOrgShortCode(null)).toBe('');
    expect(deriveOrgShortCode(undefined)).toBe('');
  });
});

describe('normalising a code somebody typed', () => {
  it('upper-cases and removes whitespace', () => {
    expect(normalizeOrgShortCode(' s j c ')).toBe('SJC');
  });

  it('caps it at the field length', () => {
    expect(normalizeOrgShortCode('ABCDEFGH')).toBe('ABCDEF');
  });

  it('keeps digits and accents, which are the typist\'s business', () => {
    expect(normalizeOrgShortCode('u13b')).toBe('U13B');
    expect(normalizeOrgShortCode('hoë')).toBe('HOË');
  });

  it('is empty for nothing', () => {
    expect(normalizeOrgShortCode(null)).toBe('');
    expect(normalizeOrgShortCode(undefined)).toBe('');
  });
});
