'use client';

import { registerPlugin, Capacitor } from '@capacitor/core';

// Synthèse vocale FR, natif d'abord : `speechSynthesis` N'EXISTE PAS dans la
// WebView Android (Capacitor) — seule l'app Chrome l'a. Sur natif on passe
// par le moteur TTS Android via @capacitor-community/text-to-speech ;
// sur web (Chrome/PWA) repli speechSynthesis. Tolérant aux vieux APK sans
// le plugin (try/catch → repli web silencieux).

type TextToSpeechPlugin = {
  speak(options: {
    text: string;
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  }): Promise<void>;
};

const TextToSpeech = registerPlugin<TextToSpeechPlugin>('TextToSpeech');

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function speak(text: string): Promise<void> {
  if (!text) return;
  if (isNative()) {
    try {
      await TextToSpeech.speak({ text, lang: 'fr-FR', rate: 1.0, volume: 1.0 });
      return;
    } catch {
      // Plugin absent (vieil APK) → tentative repli web ci-dessous.
    }
  }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}
