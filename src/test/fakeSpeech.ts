// Fake speechSynthesis: an Arabic voice when `speech.arabic` is on; every spoken line is kept, and it "ends" after
// 50 ms per word.

export const speech = {
  arabic: true,
  spoken: [] as string[],
  cancelled: 0,
  reset() {
    this.arabic = true;
    this.spoken = [];
    this.cancelled = 0;
  },
};

class FakeUtterance {
  voice: unknown = null;
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

export function installFakeSpeech() {
  Object.assign(globalThis, {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      getVoices: () => (speech.arabic ? [{ lang: 'ar-EG', name: 'Arabic' }] : [{ lang: 'en-US', name: 'English' }]),
      speak(u: FakeUtterance) {
        speech.spoken.push(u.text);
        setTimeout(() => u.onend?.(), 50 * u.text.split(/\s+/).length);
      },
      cancel() {
        speech.cancelled++;
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
}
