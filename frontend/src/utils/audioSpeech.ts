/**
 * Robust Speech & Audio Engine for NixaERP / RaptorERP
 *
 * 1. Hybrid Audio Architecture: Calls Backend Cloud TTS (ElevenLabs or Native Gemini TTS)
 *    first, returning real MP3/WAV audio that plays natively via HTML5 Audio and Web Audio.
 * 2. Automatic Fallback: Falls back to browser SpeechSynthesis if offline.
 * 3. Chromium & Windows SAPI5 Bug Workarounds:
 *    - Memory GC protection via window references.
 *    - Chrome queue lock avoidance.
 *    - User interaction priming for autoplay permission unlock.
 */

export interface PlaySpeechOptions {
  voiceName?: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  genderPreference?: 'female' | 'male';
  apiClient?: any;
  voiceProvider?: 'browser' | 'cloud' | 'auto';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

declare global {
  interface Window {
    __activeSpeechUtterance?: SpeechSynthesisUtterance | null;
    __activeAudioElement?: HTMLAudioElement | null;
  }
}

/** Check if browser speech synthesis is supported. */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Prime speech synthesis engine on user click / touch gesture to ensure permission unlock. */
export function primeSpeechEngine(): void {
  if (typeof window === 'undefined') return;
  try {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {
    // Ignore browser security sandboxing
  }
}

/** Retrieve all available voices from the browser. */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

/**
 * Select the best voice based on preferred persona name, language, and gender.
 * Prioritizes local (localService: true) Windows voices like David / Zira for rock-solid stability.
 */
export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
  options?: {
    voiceName?: string;
    lang?: string;
    genderPreference?: 'female' | 'male';
  }
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const targetLang = (options?.lang || 'en').toLowerCase().split('-')[0];
  const reqVoiceName = (options?.voiceName || '').toLowerCase();
  const isFemale = options?.genderPreference === 'female' || /aoede|kore|female|zira|samantha/i.test(reqVoiceName);
  const isMale = options?.genderPreference === 'male' || /fenrir|puck|male|david|george/i.test(reqVoiceName);

  // 1. Direct name match if specified
  if (reqVoiceName) {
    const directMatch = voices.find((v) => v.name.toLowerCase().includes(reqVoiceName));
    if (directMatch) return directMatch;
  }

  // 1b. If Indian locale specified (e.g. en-IN or hi-IN), look for Indian regional voices first
  const fullLang = (options?.lang || '').toLowerCase();
  if (fullLang.includes('-in') || fullLang.startsWith('hi')) {
    const indianVoice = voices.find((v) => 
      v.lang.toLowerCase().includes('-in') || 
      v.lang.toLowerCase().startsWith('hi') ||
      /india|hindi|heera|kalpana|neerja/i.test(v.name)
    );
    if (indianVoice) return indianVoice;
  }

  // 2. Local service matching language + gender preference (Windows SAPI5 offline voices)
  const localLangVoices = voices.filter(
    (v) => v.localService && v.lang.toLowerCase().startsWith(targetLang)
  );

  if (localLangVoices.length > 0) {
    const genderMatch = localLangVoices.find((v) => {
      const n = v.name.toLowerCase();
      return isFemale
        ? /zira|samantha|aria|susan|jenny|female/i.test(n)
        : isMale
        ? /david|george|mark|male/i.test(n)
        : true;
    });
    if (genderMatch) return genderMatch;
    return localLangVoices[0];
  }

  // 3. Any matching language + gender
  const allLangVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(targetLang));
  if (allLangVoices.length > 0) {
    const genderMatch = allLangVoices.find((v) => {
      const n = v.name.toLowerCase();
      return isFemale
        ? /zira|samantha|aria|susan|jenny|female/i.test(n)
        : isMale
        ? /david|george|mark|male/i.test(n)
        : true;
    });
    if (genderMatch) return genderMatch;
    return allLangVoices[0];
  }

  // 4. Fallback to default or first available voice
  return voices.find((v) => v.default) || voices[0] || null;
}

/** Immediately stop any ongoing browser speech or active audio playback. */
export function stopSpeech(): void {
  // Stop SpeechSynthesis
  if (isSpeechSynthesisSupported()) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore
    }
  }
  window.__activeSpeechUtterance = null;

  // Stop active HTML5 audio element
  if (typeof window !== 'undefined' && window.__activeAudioElement) {
    try {
      window.__activeAudioElement.pause();
      window.__activeAudioElement.currentTime = 0;
    } catch {
      // Ignore
    }
    window.__activeAudioElement = null;
  }
}

/**
 * Clean text for natural speech synthesis (remove markdown syntax, URLs, internal tags).
 */
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[*#_`~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/FOLLOW_UP:.+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Play Base64 encoded audio (MP3 or WAV from ElevenLabs or Gemini TTS) through device speakers.
 * Uses native Uint8Array Blob and URL.createObjectURL for 100% cross-browser reliability.
 */
export function playAudioBase64(base64: string, mimeType = 'audio/mpeg'): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      stopSpeech();

      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.preload = 'auto';
      window.__activeAudioElement = audio;

      let isCleanedUp = false;
      const cleanup = () => {
        if (!isCleanedUp) {
          isCleanedUp = true;
          if (window.__activeAudioElement === audio) {
            window.__activeAudioElement = null;
          }
          URL.revokeObjectURL(objectUrl);
        }
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };

      audio.onerror = (e) => {
        cleanup();
        reject(e);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          cleanup();
          reject(err);
        });
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Play speech text through browser's SpeechSynthesis engine (local fallback).
 */
export function playSpeech(text: string, options?: PlaySpeechOptions): void {
  if (!isSpeechSynthesisSupported()) {
    options?.onEnd?.();
    return;
  }

  const clean = cleanTextForSpeech(text);
  if (!clean) {
    options?.onEnd?.();
    return;
  }

  const doSpeak = () => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = Math.max(0.6, Math.min(1.8, options?.rate ?? 1.0));
      utterance.pitch = Math.max(0.6, Math.min(1.8, options?.pitch ?? 1.0));
      utterance.volume = Math.max(0.1, Math.min(1.0, options?.volume ?? 1.0));
      utterance.lang = options?.lang || 'en-US';

      const voices = getAvailableVoices();
      const bestVoice = selectBestVoice(voices, {
        voiceName: options?.voiceName,
        lang: options?.lang,
        genderPreference: options?.genderPreference,
      });

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang || utterance.lang;
      }

      let resumeInterval: any = null;
      let watchdogTimer: any = null;

      const cleanup = () => {
        if (resumeInterval) {
          clearInterval(resumeInterval);
          resumeInterval = null;
        }
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        window.__activeSpeechUtterance = null;
      };

      utterance.onstart = () => {
        options?.onStart?.();
        // Keepalive for Chromium bug where speech pauses after ~15s
        resumeInterval = setInterval(() => {
          if (!window.__activeSpeechUtterance) {
            clearInterval(resumeInterval);
            return;
          }
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }, 3000);
      };

      utterance.onend = () => {
        cleanup();
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        cleanup();
        if ((e as any)?.error !== 'interrupted' && (e as any)?.error !== 'canceled') {
          console.warn('Speech synthesis error:', (e as any)?.error || e);
        }
        options?.onError?.(e);
        options?.onEnd?.();
      };

      // Watchdog timeout to prevent voice lock if browser fails to fire onend
      const maxDurationMs = Math.max(5000, clean.length * 160);
      watchdogTimer = setTimeout(() => {
        if (window.__activeSpeechUtterance === utterance) {
          cleanup();
          try { window.speechSynthesis.cancel(); } catch {}
          options?.onEnd?.();
        }
      }, maxDurationMs);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech execution error:', err);
      window.__activeSpeechUtterance = null;
      options?.onError?.(err);
      options?.onEnd?.();
    }
  };

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
    window.setTimeout(doSpeak, 50);
  } else {
    doSpeak();
  }
}

/**
 * High-Level Hybrid Speech Engine:
 * 1. Requests natural Cloud Audio from backend (ElevenLabs or Native Gemini TTS).
 * 2. Plays the high-definition WAV/MP3 audio through device speakers via HTML5 audio.
 * 3. Gracefully falls back to browser SpeechSynthesis if offline.
 */
export async function speakWithAiAudio(
  text: string,
  options?: PlaySpeechOptions
): Promise<void> {
  const clean = cleanTextForSpeech(text);
  if (!clean) {
    options?.onEnd?.();
    return;
  }

  primeSpeechEngine();

  // Try backend Cloud Audio first (ElevenLabs or Google Gemini Native TTS)
  if (options?.apiClient && options.voiceProvider !== 'browser') {
    try {
      const res = await options.apiClient.generateAiSpeech(
        clean,
        options.voiceProvider || 'auto',
        options.lang || 'en-US',
        options.voiceName
      );
      const payload = res?.data ?? res;
      if (payload?.audio_base64) {
        options?.onStart?.();
        await playAudioBase64(payload.audio_base64, payload.mime_type || 'audio/mpeg');
        options?.onEnd?.();
        return;
      }
    } catch (cloudErr) {
      console.warn('Cloud audio playback unavailable, falling back to local TTS:', cloudErr);
    }
  }

  // Local browser speech synthesis fallback
  playSpeech(clean, options);
}

/**
 * Promise-based browser speech synthesis with error handling and completion resolution.
 */
export function playBrowserSpeech(text: string, options?: PlaySpeechOptions): Promise<void> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      options?.onEnd?.();
      resolve();
      return;
    }
    const clean = cleanTextForSpeech(text);
    if (!clean) {
      options?.onEnd?.();
      resolve();
      return;
    }
    playSpeech(clean, {
      ...options,
      onEnd: () => {
        options?.onEnd?.();
        resolve();
      },
      onError: (err) => {
        options?.onError?.(err);
        resolve();
      },
    });
  });
}

