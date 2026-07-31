import { MAX_LEAD_NAME_LENGTH, sanitizeLeadName } from './lead-name.util';

describe('sanitizeLeadName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeLeadName('  Juan Perez  ')).toBe('Juan Perez');
  });

  it('collapses internal whitespace and control characters', () => {
    expect(sanitizeLeadName('Juan\t\n  Perez')).toBe('Juan Perez');
  });

  it('preserves accents and ñ', () => {
    expect(sanitizeLeadName('María Núñez')).toBe('María Núñez');
  });

  it('accepts a single first name', () => {
    expect(sanitizeLeadName('Alex')).toBe('Alex');
  });

  it('truncates to the maximum length', () => {
    const long = 'A'.repeat(MAX_LEAD_NAME_LENGTH + 50);
    const result = sanitizeLeadName(long);
    expect(result).toHaveLength(MAX_LEAD_NAME_LENGTH);
  });

  it('rejects undefined', () => {
    expect(sanitizeLeadName(undefined)).toBeUndefined();
  });

  it('rejects null', () => {
    expect(sanitizeLeadName(null)).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(sanitizeLeadName('')).toBeUndefined();
  });

  it('rejects whitespace only', () => {
    expect(sanitizeLeadName('   ')).toBeUndefined();
  });

  it('rejects punctuation only', () => {
    expect(sanitizeLeadName('-')).toBeUndefined();
  });

  it('rejects digits only', () => {
    expect(sanitizeLeadName('123')).toBeUndefined();
  });

  it('rejects emoji only', () => {
    expect(sanitizeLeadName('👍')).toBeUndefined();
  });

  it('rejects a single letter (below the minimum length)', () => {
    expect(sanitizeLeadName('A')).toBeUndefined();
  });
});
