import { describe, expect, it } from 'vitest';
import { plainText } from './plainText';

describe('plain body text', () => {
  it('takes emoji out of body text and keeps the marks that mean something', () => {
    expect(plainText('🎧 البسي سماعات')).toBe('البسي سماعات');
    expect(plainText('⚠️ النغمة دي عالية')).toBe('النغمة دي عالية');
    expect(plainText('✔ اتحفظ')).toBe('✔ اتحفظ');
    expect(plainText('F♯ و B♭ و ♩ ♪')).toBe('F♯ و B♭ و ♩ ♪');
    expect(plainText('بدون أي حاجة')).toBe('بدون أي حاجة');
  });
});
