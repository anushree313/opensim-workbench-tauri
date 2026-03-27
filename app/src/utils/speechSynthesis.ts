/**
 * Simple wrapper around the browser SpeechSynthesis API.
 */

export function speak(text: string): void {
  if (!window.speechSynthesis) return;
  stop();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function stop(): void {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
