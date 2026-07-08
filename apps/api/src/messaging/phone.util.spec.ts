import { normalizeWhatsAppRecipient } from './phone.util';

describe('normalizeWhatsAppRecipient', () => {
  it('strips the 9 from an Argentine mobile wa_id', () => {
    expect(normalizeWhatsAppRecipient('5493484381803')).toBe('543484381803');
  });

  it('strips the 9 for another Argentine mobile (different area code)', () => {
    expect(normalizeWhatsAppRecipient('5491135551234')).toBe('541135551234');
  });

  it('leaves an already-normalized Argentine number unchanged', () => {
    expect(normalizeWhatsAppRecipient('543484381803')).toBe('543484381803');
  });

  it('leaves a non-Argentine number unchanged', () => {
    expect(normalizeWhatsAppRecipient('16315551181')).toBe('16315551181');
  });

  it('does not strip when the 549 prefix is not a full AR mobile length', () => {
    // 549 followed by fewer than 10 digits is not a valid AR mobile — leave it.
    expect(normalizeWhatsAppRecipient('549123')).toBe('549123');
  });
});
