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
  it('never leaves empty brackets or quotes, or a space before punctuation, behind', () => {
    expect(plainText('جوه نسخة البيانات (💾) زي باقي النتايج.')).toBe('جوه نسخة البيانات زي باقي النتايج.');
    expect(plainText('و«❓» فيها الشرح')).toBe('و فيها الشرح');
    expect(plainText('فيه تحسّن 👏.')).toBe('فيه تحسّن.');
    expect(plainText('(مثلاً ٨ من ١٠)')).toBe('(مثلاً ٨ من ١٠)');
  });
});
