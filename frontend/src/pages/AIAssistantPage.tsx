import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneCall, PhoneOff, Radio, Settings,
  Clock, Sparkles, X, CheckCircle2, Headphones, Zap,
  Globe, Activity, Sliders, History, Trash2, RefreshCw, Square, AlertCircle,
  Shield, ShieldCheck,
} from 'lucide-react';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { playBrowserSpeech, stopSpeech, primeSpeechEngine } from '../utils/audioSpeech';

/* =========================================================================
   TYPES & AUDIO SESSION STATES
   ========================================================================= */

export type GeminiVoice = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
export type LanguageMode = 'hinglish' | 'hindi' | 'english';

export type CallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'gemini_speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'muted'
  | 'error';

export interface DialogueTurn {
  id: string;
  speaker: 'user' | 'gemini';
  text: string;
  timestamp: string;
}

export interface CallSessionRecord {
  id: string;
  startedAt: string;
  durationSeconds: number;
  voice: GeminiVoice;
  language: LanguageMode;
  turns: DialogueTurn[];
}

const VOICE_OPTIONS: Array<{ id: GeminiVoice; name: string; desc: string; tag: string }> = [
  { id: 'Zephyr', name: 'Zephyr', desc: 'Natural, crisp executive tone', tag: 'Recommended' },
  { id: 'Kore',   name: 'Kore (Aanya)', desc: 'Warm, expressive Indian female tone', tag: 'Lively' },
  { id: 'Puck',   name: 'Puck', desc: 'Dynamic, bright, enthusiastic cadence', tag: 'Energetic' },
  { id: 'Charon', name: 'Charon', desc: 'Deep, calm, authoritative advisory voice', tag: 'Calm' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Direct, focused, low-pitch voice', tag: 'Focused' },
];

/* =========================================================================
   BARGE-IN TRIGGER WORDS & ECHO REJECTION
   ========================================================================= */

const BARGE_IN_TRIGGER_WORDS = new Set([
  'stop', 'wait', 'ruko', 'suno', 'pause', 'hold', 'cancel',
  'chup', 'quiet', 'shant', 'listen', 'bas',
]);

function cleanWords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function hasBargeInTriggerWord(text: string): boolean {
  const words = cleanWords(text);
  for (const w of words) {
    if (BARGE_IN_TRIGGER_WORDS.has(w)) return true;
  }
  return false;
}

function isRecentGeminiEcho(
  incomingText: string,
  recentUtterances: Array<{ text: string; timestamp: number }>,
  maxAgeMs = 15000
): boolean {
  if (!incomingText || !incomingText.trim()) return false;

  const cleanIncoming = incomingText.toLowerCase().replace(/[^\w\s\u0900-\u097F]/gi, ' ').trim();
  if (!cleanIncoming) return false;

  const incWords = cleanIncoming.split(/\s+/).filter((w) => w.length > 1);
  if (incWords.length === 0) return false;

  const now = Date.now();

  for (const item of recentUtterances) {
    if (now - item.timestamp > maxAgeMs) continue;

    const cleanGem = item.text.toLowerCase().replace(/[^\w\s\u0900-\u097F]/gi, ' ').trim();
    if (!cleanGem) continue;

    if (cleanIncoming.length > 4 && cleanGem.includes(cleanIncoming)) return true;

    const gemWords = new Set(cleanGem.split(/\s+/).filter((w) => w.length > 1));
    let matchCount = 0;
    for (const w of incWords) {
      if (gemWords.has(w)) matchCount++;
    }
    if ((matchCount / incWords.length) >= 0.35) return true;

    if (cleanIncoming.length > 12 && cleanGem.length > 12) {
      const chunks = cleanGem.split(/\s+/).slice(0, 4).join(' ');
      if (chunks.length > 8 && cleanIncoming.includes(chunks)) return true;
    }
  }

  return false;
}

/* =========================================================================
   LIVE AUDIO PLAYER
   ========================================================================= */

class LiveAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private pendingResolve: (() => void) | null = null;
  private onStateChange?: (isPlaying: boolean) => void;
  private isPlaying: boolean = false;

  constructor(onStateChange?: (isPlaying: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public async unlock(): Promise<void> {
    try {
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.8;
        this.analyser.connect(this.audioCtx.destination);
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('AudioContext unlock notice:', e);
    }
  }

  public async playWavBase64(base64Wav: string): Promise<void> {
    this.stop();

    if (!base64Wav || base64Wav.trim() === '') {
      return Promise.resolve();
    }

    await this.unlock();

    return new Promise(async (resolve) => {
      let resolved = false;
      const finalize = () => {
        if (!resolved) {
          resolved = true;
          this.isPlaying = false;
          this.currentSource = null;
          if (this.currentAudioElement) {
            try {
              this.currentAudioElement.pause();
              this.currentAudioElement.currentTime = 0;
              this.currentAudioElement.src = '';
            } catch {}
            this.currentAudioElement = null;
          }
          if (this.currentBlobUrl) {
            try { URL.revokeObjectURL(this.currentBlobUrl); } catch {}
            this.currentBlobUrl = null;
          }
          this.pendingResolve = null;
          this.onStateChange?.(false);
          resolve();
        }
      };

      this.pendingResolve = finalize;
      this.isPlaying = true;
      this.onStateChange?.(true);

      try {
        if (this.audioCtx && this.analyser) {
          const binaryString = atob(base64Wav);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

          const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
          if (!this.isPlaying) { finalize(); return; }

          const source = this.audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.analyser);
          this.currentSource = source;
          source.onended = () => finalize();
          source.start(0);
          return;
        }
      } catch (decodeErr) {
        console.warn('WebAudio decode failed, falling back to Blob HTML5 Audio:', decodeErr);
      }

      try {
        const binaryString = atob(base64Wav);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

        const blob = new Blob([bytes], { type: 'audio/wav' });
        const objectUrl = URL.createObjectURL(blob);
        this.currentBlobUrl = objectUrl;
        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        this.currentAudioElement = audio;
        audio.onended = () => finalize();
        audio.onerror = () => finalize();
        await audio.play();
      } catch (playErr) {
        console.error('Audio playback error:', playErr);
        finalize();
      }
    });
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.currentSource) {
      try { this.currentSource.stop(); this.currentSource.disconnect(); } catch {}
      this.currentSource = null;
    }
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement.src = '';
      } catch {}
      this.currentAudioElement = null;
    }
    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch {}
      this.currentBlobUrl = null;
    }
    const r = this.pendingResolve;
    this.pendingResolve = null;
    if (r) r();
    this.onStateChange?.(false);
  }

  public close(): void {
    this.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
  }
}

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

export function AIAssistantPage() {
  const { showError, showSuccess } = useNotification();

  // Settings
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoice>('Zephyr');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('hinglish');
  const [vadSensitivity, setVadSensitivity] = useState<number>(55);
  const [echoIsolationMode, setEchoIsolationMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gemini_live_echo_isolation') !== 'false';
    } catch {
      return true;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Call lifecycle
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  // Transcripts
  const [currentTurn, setCurrentTurn] = useState<{ speaker: 'user' | 'gemini'; text: string } | null>(null);
  const [dialogueHistory, setDialogueHistory] = useState<DialogueTurn[]>([]);
  const [recentSessions, setRecentSessions] = useState<CallSessionRecord[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_live_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Visualization
  const [micVolume, setMicVolume] = useState(0);
  const [geminiVolume, setGeminiVolume] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState<number[]>(new Array(24).fill(6));

  // Refs — always current
  const callStateRef = useRef<CallState>(callState);
  const isMicMutedRef = useRef(isMicMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const dialogueHistoryRef = useRef(dialogueHistory);
  const selectedVoiceRef = useRef(selectedVoice);
  const languageModeRef = useRef(languageMode);
  const vadSensitivityRef = useRef(vadSensitivity);
  const echoIsolationModeRef = useRef(echoIsolationMode);

  callStateRef.current = callState;
  isMicMutedRef.current = isMicMuted;
  isSpeakerMutedRef.current = isSpeakerMuted;
  dialogueHistoryRef.current = dialogueHistory;
  selectedVoiceRef.current = selectedVoice;
  languageModeRef.current = languageMode;
  vadSensitivityRef.current = vadSensitivity;
  echoIsolationModeRef.current = echoIsolationMode;

  // Echo cancellation + turn tracking
  const recentGeminiUtterancesRef = useRef<Array<{ text: string; timestamp: number }>>([]);
  const speechCooldownUntilRef = useRef<number>(0);
  const isGeminiSpeakingRef = useRef<boolean>(false);
  const currentGeminiReplyTextRef = useRef<string>('');
  const activeTurnIdRef = useRef<string>('');
  const lastSentTranscriptRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);

  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const startSpeechRecognitionRef = useRef<() => void>(() => {});
  const startSpeechRecognition = useCallback(() => {
    startSpeechRecognitionRef.current();
  }, []);

  const recognitionRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionStartTimeRef = useRef<number>(0);
  const pendingTranscriptRef = useRef<string>('');
  const isProcessingRef = useRef<boolean>(false);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const lastMicVolRef = useRef<number>(0);
  const lastGeminiVolRef = useRef<number>(0);
  const isBarsRestingRef = useRef<boolean>(false);

  const updateCallState = useCallback((newState: CallState) => {
    callStateRef.current = newState;
    if (mountedRef.current) setCallState(newState);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* -----------------------------------------------------------------------
     Player init / teardown
     ----------------------------------------------------------------------- */
  useEffect(() => {
    playerRef.current = new LiveAudioPlayer((isPlaying) => {
      if (isPlaying) {
        updateCallState('gemini_speaking');
      } else if (callStateRef.current === 'gemini_speaking') {
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      }
    });

    return () => {
      playerRef.current?.close();
      stopSpeech();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      if (micAudioContextRef.current) { try { micAudioContextRef.current.close(); } catch {} }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (recognitionRestartTimerRef.current) clearTimeout(recognitionRestartTimerRef.current);
    };
  }, [updateCallState]);

  /* -----------------------------------------------------------------------
     Device hotplug & tab visibility recovery
     ----------------------------------------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleDeviceChange = async () => {
      if (callStateRef.current === 'idle') return;
      updateCallState('reconnecting');
      try {
        if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: { ideal: 16000 },
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
          } as any,
        });
        micStreamRef.current = stream;
        stream.getAudioTracks().forEach((t) => { t.enabled = !isMicMutedRef.current; });

        if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
          const source = micAudioContextRef.current.createMediaStreamSource(stream);
          const analyser = micAudioContextRef.current.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          micAnalyserRef.current = analyser;
        }
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      } catch (e) {
        console.warn('Device reconnect notice:', e);
        updateCallState('error');
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && callStateRef.current !== 'idle') {
        playerRef.current?.unlock().catch(() => {});
        if (recognitionRef.current && !isRecognitionRunningRef.current && !isMicMutedRef.current) {
          try {
            recognitionRef.current.start();
            isRecognitionRunningRef.current = true;
          } catch {}
        }
      }
    };

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateCallState]);

  /* -----------------------------------------------------------------------
     Session persistence
     ----------------------------------------------------------------------- */
  const saveSession = useCallback(() => {
    if (dialogueHistoryRef.current.length === 0 || sessionStartTimeRef.current === 0) return;
    const duration = Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000));
    const newRecord: CallSessionRecord = {
      id: 'call-' + Date.now(),
      startedAt: new Date(sessionStartTimeRef.current).toLocaleString(),
      durationSeconds: duration,
      voice: selectedVoiceRef.current,
      language: languageModeRef.current,
      turns: dialogueHistoryRef.current,
    };
    if (mountedRef.current) {
      setRecentSessions((prev) => {
        const updated = [newRecord, ...prev].slice(0, 20);
        try { localStorage.setItem('gemini_live_sessions', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  }, []);

  /* -----------------------------------------------------------------------
     Audio visualizer
     ----------------------------------------------------------------------- */
  useEffect(() => {
    const updateSpectrum = () => {
      if (!mountedRef.current) return;
      let activeVolume = 0;
      const bars = new Array(24).fill(6);

      if (
        micAnalyserRef.current &&
        (callStateRef.current === 'listening' || callStateRef.current === 'user_speaking') &&
        !isMicMutedRef.current
      ) {
        const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        activeVolume = sum / (data.length * 255);
        if (activeVolume > 0.01 || lastMicVolRef.current > 0.01) {
          lastMicVolRef.current = activeVolume;
          setMicVolume(activeVolume);
        }
        for (let i = 0; i < 24; i++) {
          const val = data[i % data.length] || 0;
          bars[i] = Math.max(6, Math.min(100, Math.round((val / 255) * 85)));
        }
      } else if (lastMicVolRef.current > 0.01) {
        lastMicVolRef.current = 0;
        setMicVolume(0);
      }

      const playerAnalyser = playerRef.current?.getAnalyser();
      if (playerAnalyser && callStateRef.current === 'gemini_speaking' && !isSpeakerMutedRef.current) {
        const data = new Uint8Array(playerAnalyser.frequencyBinCount);
        playerAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const speakerVol = sum / (data.length * 255);
        activeVolume = Math.max(activeVolume, speakerVol);
        if (speakerVol > 0.01 || lastGeminiVolRef.current > 0.01) {
          lastGeminiVolRef.current = speakerVol;
          setGeminiVolume(speakerVol);
        }
        for (let i = 0; i < 24; i++) {
          const val = data[i % data.length] || 0;
          bars[i] = Math.max(8, Math.min(100, Math.round((val / 255) * 95)));
        }
      } else if (lastGeminiVolRef.current > 0.01) {
        lastGeminiVolRef.current = 0;
        setGeminiVolume(0);
      }

      if (callStateRef.current === 'idle') {
        if (!isBarsRestingRef.current) {
          isBarsRestingRef.current = true;
          setFrequencyBars(new Array(24).fill(4));
        }
      } else {
        isBarsRestingRef.current = false;
        if (activeVolume < 0.05) {
          const now = Date.now() / 400;
          for (let i = 0; i < 24; i++) {
            const wave = Math.sin(now + i * 0.4);
            bars[i] = Math.max(6, Math.round(14 + wave * 8));
          }
        }
        setFrequencyBars(bars);
      }

      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    };

    animFrameRef.current = requestAnimationFrame(updateSpectrum);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  /* -----------------------------------------------------------------------
     SPEAK RESPONSE (High-fidelity WAV -> Browser fallback)
     ----------------------------------------------------------------------- */
  const speakResponse = async (replyText: string, wavBase64?: string | null): Promise<void> => {
    if (isSpeakerMutedRef.current) {
      updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      return;
    }

    isGeminiSpeakingRef.current = true;
    currentGeminiReplyTextRef.current = replyText;

    recentGeminiUtterancesRef.current.push({ text: replyText, timestamp: Date.now() });
    if (recentGeminiUtterancesRef.current.length > 20) {
      recentGeminiUtterancesRef.current.shift();
    }

    pendingTranscriptRef.current = '';
    updateCallState('gemini_speaking');

    // Echo Isolation: isolate microphone tracks & abort STT session during speaker playback
    if (echoIsolationModeRef.current) {
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = false; });
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        isRecognitionRunningRef.current = false;
      }
    }

    try {
      if (wavBase64 && wavBase64.length > 100) {
        await playerRef.current?.playWavBase64(wavBase64);
      } else {
        const lang =
          languageModeRef.current === 'hindi' ? 'hi-IN' :
          languageModeRef.current === 'english' ? 'en-US' : 'hi-IN';
        await playBrowserSpeech(replyText, {
          lang,
          rate: 1.05,
          pitch: 1.0,
          voiceName: selectedVoiceRef.current,
        });
      }
    } catch (err) {
      console.warn('Speech playback notice:', err);
    } finally {
      speechCooldownUntilRef.current = Date.now() + 1000;
      pendingTranscriptRef.current = '';
      isGeminiSpeakingRef.current = false;
      currentGeminiReplyTextRef.current = '';

      // Resume microphone listening safely
      if (echoIsolationModeRef.current && callStateRef.current !== 'idle') {
        if (micStreamRef.current) {
          micStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !isMicMutedRef.current; });
        }
        if (!isMicMutedRef.current) {
          startSpeechRecognition();
        }
      }

      if (mountedRef.current && (callStateRef.current as string) === 'gemini_speaking') {
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      }
    }
  };

  /* -----------------------------------------------------------------------
     BARGE-IN (Instant User Interruption)
     ----------------------------------------------------------------------- */
  const handleUserBargeIn = (userSpeech?: string) => {
    playerRef.current?.stop();
    stopSpeech();

    isGeminiSpeakingRef.current = false;
    currentGeminiReplyTextRef.current = '';
    pendingTranscriptRef.current = '';
    speechCooldownUntilRef.current = Date.now() + 400;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const newTurnId = 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    activeTurnIdRef.current = newTurnId;
    isProcessingRef.current = false;

    // Immediately re-enable microphone
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !isMicMutedRef.current; });
    }
    if (!isMicMutedRef.current) {
      startSpeechRecognition();
    }

    if (userSpeech && userSpeech.trim()) {
      updateCallState('user_speaking');
    } else {
      updateCallState('interrupted');
      setTimeout(() => {
        if (mountedRef.current && callStateRef.current === 'interrupted') {
          updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
        }
      }, 200);
    }
  };

  /* -----------------------------------------------------------------------
     PROCESS USER UTTERANCE
     ----------------------------------------------------------------------- */
  const processTranscript = useCallback(async () => {
    if (isProcessingRef.current || !mountedRef.current) return;
    const text = pendingTranscriptRef.current.trim();
    if (!text || text.length < 2) return;
    pendingTranscriptRef.current = '';

    if (callStateRef.current === 'idle') return;

    // Acoustic echo guard
    if (isRecentGeminiEcho(text, recentGeminiUtterancesRef.current)) {
      updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      return;
    }

    // Deduplicate
    const now = Date.now();
    if (
      text.toLowerCase() === lastSentTranscriptRef.current.toLowerCase() &&
      now - lastSentTimeRef.current < 3000
    ) {
      updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      return;
    }

    lastSentTranscriptRef.current = text;
    lastSentTimeRef.current = now;
    isProcessingRef.current = true;

    const currentTurnId = 'turn-' + now + '-' + Math.random().toString(36).slice(2, 7);
    activeTurnIdRef.current = currentTurnId;

    const userTurn: DialogueTurn = {
      id: currentTurnId,
      speaker: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (mountedRef.current) {
      setDialogueHistory((prev) => [...prev, userTurn]);
      setCurrentTurn({ speaker: 'user', text });
      updateCallState('thinking');
    }

    try {
      const historyPayload = dialogueHistoryRef.current.slice(-6).map((t) => ({
        role: t.speaker === 'gemini' ? 'model' : 'user',
        text: t.text,
      }));

      const res: any = await apiClient.liveConverse({
        transcript: text,
        voice: selectedVoiceRef.current,
        language: languageModeRef.current,
        history: historyPayload,
        turn_id: currentTurnId,
      });

      if (!mountedRef.current) return;

      if (activeTurnIdRef.current !== currentTurnId) return; // stale → discard

      if (res?.reply_text) {
        const geminiTurn: DialogueTurn = {
          id: 'gemini-' + Date.now(),
          speaker: 'gemini',
          text: res.reply_text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        if (mountedRef.current) {
          setDialogueHistory((prev) => [...prev, geminiTurn]);
          setCurrentTurn({ speaker: 'gemini', text: res.reply_text });
        }
        await speakResponse(res.reply_text, res.audio_wav_base64);
      } else {
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      }
    } catch (err: any) {
      console.error('Gemini Live turn error:', err);
      if (mountedRef.current) {
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
        showError('Call Notice', err?.message || 'Could not reach Gemini Live engine.');
      }
    } finally {
      // Guard: only clear flag if THIS turn still owns it
      if (activeTurnIdRef.current === currentTurnId) {
        isProcessingRef.current = false;
        if (mountedRef.current && pendingTranscriptRef.current.trim() && (callStateRef.current as string) !== 'idle') {
          setTimeout(() => {
            if (mountedRef.current) processTranscript();
          }, 50);
        }
      }
    }
  }, [updateCallState, showError]);

  /* -----------------------------------------------------------------------
     SPEECH RECOGNITION INSTANTIATION & EVENT LOOP
     ----------------------------------------------------------------------- */
  startSpeechRecognitionRef.current = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (callStateRef.current === 'idle' || isMicMutedRef.current) return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
      isRecognitionRunningRef.current = false;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        languageModeRef.current === 'english' ? 'en-US' :
        languageModeRef.current === 'hindi' ? 'hi-IN' : 'hi-IN';

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
      };

      recognition.onresult = (event: any) => {
        if (isMicMutedRef.current || callStateRef.current === 'idle') return;

        // Discard post-speech reverberation / delayed packets
        if (Date.now() < speechCooldownUntilRef.current) {
          return;
        }

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const tr = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += tr;
          else interim += tr;
        }

        const rawUtterance = (final.trim() || interim.trim());
        if (!rawUtterance) return;

        // While Gemini is speaking:
        if (callStateRef.current === 'gemini_speaking' || isGeminiSpeakingRef.current) {
          if (echoIsolationModeRef.current) {
            // Echo isolation: drop all speaker sound completely
            return;
          }
          const curGemini = (currentGeminiReplyTextRef.current || '').toLowerCase();
          const isOwnEcho = curGemini.length > 3 && curGemini.includes(rawUtterance.toLowerCase());
          if (!isOwnEcho && hasBargeInTriggerWord(rawUtterance)) {
            handleUserBargeIn(rawUtterance);
          }
          return;
        }

        // Post-speech echo guard
        if (isRecentGeminiEcho(rawUtterance, recentGeminiUtterancesRef.current)) {
          return;
        }

        // Transition to user_speaking from listening OR thinking
        if (
          callStateRef.current === 'listening' ||
          callStateRef.current === 'thinking'
        ) {
          updateCallState('user_speaking');
        }

        if (interim.trim()) {
          setCurrentTurn({ speaker: 'user', text: interim });
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        if (final.trim()) {
          pendingTranscriptRef.current = (pendingTranscriptRef.current + ' ' + final).trim();
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

          const debounceMs = Math.max(180, 700 - vadSensitivityRef.current * 5.5);
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (isMicMutedRef.current) {
              pendingTranscriptRef.current = '';
              return;
            }
            processTranscript();
          }, debounceMs);
        }
      };

      recognition.onerror = (e: any) => {
        const code = e?.error;
        if (code !== 'no-speech' && code !== 'aborted') {
          console.warn('Speech recognition notice:', code);
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        if (callStateRef.current === 'idle' || isMicMutedRef.current) return;
        if (callStateRef.current === 'gemini_speaking' && echoIsolationModeRef.current) return;
        if (recognitionRef.current !== recognition) return;

        if (recognitionRestartTimerRef.current) clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = setTimeout(() => {
          if (callStateRef.current === 'idle' || isMicMutedRef.current) return;
          if (callStateRef.current === 'gemini_speaking' && echoIsolationModeRef.current) return;
          startSpeechRecognition();
        }, 80);
      };

      recognition.start();
      isRecognitionRunningRef.current = true;
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('startSpeechRecognition failed:', e);
    }
  }, [updateCallState, processTranscript]);

  /* -----------------------------------------------------------------------
     START CALL
     ----------------------------------------------------------------------- */
  const startLiveCall = async () => {
    if (callStateRef.current !== 'idle') return;

    try {
      updateCallState('connecting');
      primeSpeechEngine();
      await playerRef.current?.unlock();

      sessionStartTimeRef.current = Date.now();
      setCallDuration(0);
      setDialogueHistory([]);
      setCurrentTurn(null);
      pendingTranscriptRef.current = '';
      recentGeminiUtterancesRef.current = [];
      speechCooldownUntilRef.current = 0;
      isProcessingRef.current = false;
      isGeminiSpeakingRef.current = false;
      currentGeminiReplyTextRef.current = '';

      // 1. Mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
        } as any,
      });
      micStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => { t.enabled = !isMicMutedRef.current; });

      // 2. Analyser
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const micCtx = new AudioCtxClass();
      micAudioContextRef.current = micCtx;
      const source = micCtx.createMediaStreamSource(stream);
      const analyser = micCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      // 3. Speech recognition
      startSpeechRecognition();

      // 4. Timer
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => {
        if (mountedRef.current) setCallDuration((d) => d + 1);
      }, 1000);

      updateCallState('listening');

      // 5. Greeting
      const greetingPrompt =
        languageModeRef.current === 'hindi' ? 'Namaste!' :
        languageModeRef.current === 'hinglish' ? 'Hi, let\'s talk!' : 'Hello Gemini!';

      isProcessingRef.current = true;
      updateCallState('thinking');
      const greetingTurnId = 'turn-greeting-' + Date.now();
      activeTurnIdRef.current = greetingTurnId;

      try {
        const res: any = await apiClient.liveConverse({
          transcript: greetingPrompt,
          voice: selectedVoiceRef.current,
          language: languageModeRef.current,
          history: [],
          turn_id: greetingTurnId,
        });

        if (!mountedRef.current || activeTurnIdRef.current !== greetingTurnId) return;

        if (res?.reply_text) {
          const geminiTurn: DialogueTurn = {
            id: 'gemini-' + Date.now(),
            speaker: 'gemini',
            text: res.reply_text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          if (mountedRef.current) {
            setDialogueHistory([geminiTurn]);
            setCurrentTurn({ speaker: 'gemini', text: res.reply_text });
          }
          await speakResponse(res.reply_text, res.audio_wav_base64);
        } else {
          updateCallState('listening');
        }
      } catch (err: any) {
        console.warn('Greeting notice:', err);
        updateCallState('listening');
      } finally {
        isProcessingRef.current = false;
      }
    } catch (err: any) {
      console.error('Call initialization error:', err);
      updateCallState('error');
      if (mountedRef.current) {
        showError('Microphone Access Required', 'Please enable microphone access in your browser to start the Gemini Live call.');
      }
    }
  };

  /* -----------------------------------------------------------------------
     END CALL
     ----------------------------------------------------------------------- */
  const endLiveCall = () => {
    saveSession();

    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (recognitionRestartTimerRef.current) { clearTimeout(recognitionRestartTimerRef.current); recognitionRestartTimerRef.current = null; }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
      isRecognitionRunningRef.current = false;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (micAudioContextRef.current) {
      try { micAudioContextRef.current.close(); } catch {}
      micAudioContextRef.current = null;
    }
    micAnalyserRef.current = null;

    playerRef.current?.stop();
    stopSpeech();
    pendingTranscriptRef.current = '';
    recentGeminiUtterancesRef.current = [];
    isProcessingRef.current = false;
    isGeminiSpeakingRef.current = false;
    currentGeminiReplyTextRef.current = '';

    const finalDuration = callDuration;
    updateCallState('idle');
    if (mountedRef.current) {
      setMicVolume(0);
      setGeminiVolume(0);
      showSuccess('Call Ended', `Session duration: ${formatDuration(finalDuration)}`);
    }
  };

  /* -----------------------------------------------------------------------
     MIC TOGGLE (Unmute restarts fresh recognition reliably)
     ----------------------------------------------------------------------- */
  const toggleMic = () => {
    const nextMuted = !isMicMutedRef.current;
    if (mountedRef.current) setIsMicMuted(nextMuted);
    isMicMutedRef.current = nextMuted;

    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !nextMuted; });
    }

    if (nextMuted) {
      pendingTranscriptRef.current = '';
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (mountedRef.current && currentTurn?.speaker === 'user') setCurrentTurn(null);

      // Abort recognizer so browser mic indicator turns off
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        isRecognitionRunningRef.current = false;
      }

      if (callStateRef.current === 'listening' || callStateRef.current === 'user_speaking') {
        updateCallState('muted');
      }
    } else {
      // Unmuting: construct fresh recognition instance to prevent Chrome InvalidStateError
      startSpeechRecognition();
      if (callStateRef.current === 'muted') {
        updateCallState('listening');
      }
    }
  };

  /* -----------------------------------------------------------------------
     SPEAKER TOGGLE
     ----------------------------------------------------------------------- */
  const toggleSpeaker = () => {
    const nextMuted = !isSpeakerMutedRef.current;
    if (mountedRef.current) setIsSpeakerMuted(nextMuted);
    isSpeakerMutedRef.current = nextMuted;
    if (nextMuted) {
      playerRef.current?.stop();
      stopSpeech();
      if (callStateRef.current === 'gemini_speaking') {
        updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      }
    }
  };

  /* -----------------------------------------------------------------------
     MANUAL RECONNECT
     ----------------------------------------------------------------------- */
  const reconnectAudio = async () => {
    updateCallState('reconnecting');
    try {
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
        } as any,
      });
      micStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => { t.enabled = !isMicMutedRef.current; });

      if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
        const source = micAudioContextRef.current.createMediaStreamSource(stream);
        const analyser = micAudioContextRef.current.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
      }
      await playerRef.current?.unlock();
      updateCallState(isMicMutedRef.current ? 'muted' : 'listening');
      showSuccess('Audio Reconnected', 'Microphone and speaker pipeline reinitialized.');
    } catch (e: any) {
      console.warn('Manual reconnect failed:', e);
      updateCallState('error');
      showError('Audio Reconnect Failed', e?.message || 'Could not access audio device.');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isCallActive = callState !== 'idle';
  const activeVolume = callState === 'gemini_speaking' ? geminiVolume : micVolume;
  const orbScale = 1 + activeVolume * 0.45;

  /* ======================================================================
     RENDER
     ====================================================================== */
  return (
    <div className="relative flex h-[calc(100vh-4.5rem)] w-full flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 font-sans text-slate-100 select-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.25),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(168,85,247,0.18),transparent_50%)]" />

      {/* TOP BAR */}
      <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/25">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Sparkles className="h-4 w-4 text-cyan-300 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-white">GEMINI LIVE</span>
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-ping" />
            </div>
            <p className="text-[11px] font-medium text-slate-400">Full-Duplex Voice Engine • Zero Echo • Smart Barge-In</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isCallActive ? (
            <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 shadow-inner backdrop-blur-md">
              <span className={`h-2.5 w-2.5 rounded-full ${
                callState === 'gemini_speaking' ? 'bg-purple-400 shadow-[0_0_12px_#c084fc] animate-pulse'
                : callState === 'user_speaking' ? 'bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-bounce'
                : callState === 'thinking' ? 'bg-amber-400 shadow-[0_0_12px_#fbbf24] animate-spin'
                : callState === 'interrupted' ? 'bg-rose-500 shadow-[0_0_14px_#f43f5e] animate-ping'
                : callState === 'reconnecting' ? 'bg-blue-400 shadow-[0_0_12px_#60a5fa] animate-pulse'
                : callState === 'error' ? 'bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse'
                : callState === 'muted' ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'
                : 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse'}`} />
              <span className="font-mono text-xs font-semibold tracking-wider text-white">{formatDuration(callDuration)}</span>
              <span className="text-white/30">•</span>
              <span className="text-xs font-medium text-slate-200">
                {callState === 'gemini_speaking' ? 'Gemini Speaking...'
                  : callState === 'user_speaking' ? 'You are Speaking...'
                  : callState === 'thinking' ? 'Gemini is Thinking...'
                  : callState === 'interrupted' ? 'Interrupted!'
                  : callState === 'reconnecting' ? 'Reconnecting Audio...'
                  : callState === 'error' ? 'Audio Error'
                  : callState === 'muted' ? 'Microphone Muted'
                  : callState === 'connecting' ? 'Connecting...'
                  : 'Listening...'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs text-slate-400">
              <Radio className="h-3.5 w-3.5 text-slate-500" />
              <span>Ready for Live Call</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {callState === 'error' && (
            <button onClick={reconnectAudio}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30 transition">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Reconnect</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"
            title={echoIsolationMode ? 'Smart Anti-Echo Isolation is protecting microphone' : 'Headset Mode (Barge-in enabled)'}>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>{echoIsolationMode ? 'Anti-Echo On' : 'Headset Mode'}</span>
          </div>

          <button onClick={() => !isCallActive && setIsSettingsOpen(true)}
            disabled={isCallActive}
            title={isCallActive ? 'Voice settings locked during call' : 'Voice settings'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed">
            <Headphones className="h-3.5 w-3.5 text-indigo-400" /><span>{selectedVoice}</span>
          </button>
          <button onClick={() => !isCallActive && setLanguageMode(
            languageMode === 'hinglish' ? 'hindi' : languageMode === 'hindi' ? 'english' : 'hinglish')}
            disabled={isCallActive}
            title={isCallActive ? 'Language locked during call' : 'Change language'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition capitalize disabled:opacity-40 disabled:cursor-not-allowed">
            <Globe className="h-3.5 w-3.5 text-cyan-400" /><span>{languageMode}</span>
          </button>
          <button onClick={() => setIsHistoryOpen(true)}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition">
            <History className="h-4 w-4" />
          </button>
          <button onClick={() => !isCallActive && setIsSettingsOpen(true)}
            disabled={isCallActive}
            title={isCallActive ? 'Settings locked during call' : 'Settings'}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* CENTER ORB */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-6">
        <div className="relative flex items-center justify-center my-auto">
          <div style={{ transform: `scale(${orbScale * 1.35})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.35 : 0.2) : 0.08 }}
            className="pointer-events-none absolute h-72 w-72 sm:h-96 sm:w-96 rounded-full border border-indigo-400/30 bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-cyan-500/10 transition-transform duration-100 ease-out" />
          <div style={{ transform: `scale(${orbScale * 1.18})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.5 : 0.3) : 0.12 }}
            className="pointer-events-none absolute h-60 w-60 sm:h-80 sm:w-80 rounded-full border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 via-indigo-500/20 to-purple-600/15 transition-transform duration-100 ease-out" />
          <div style={{ transform: `scale(${orbScale * 1.06})`, opacity: isCallActive ? (callState === 'gemini_speaking' ? 0.75 : 0.45) : 0.18 }}
            className="pointer-events-none absolute h-48 w-48 sm:h-64 sm:w-64 rounded-full border border-purple-400/60 shadow-[0_0_50px_rgba(168,85,247,0.35)] transition-transform duration-75 ease-out" />
          <div style={{ transform: `scale(${orbScale})` }}
            className={`relative flex h-36 w-36 sm:h-48 sm:w-48 items-center justify-center rounded-full shadow-2xl transition-all duration-75 ease-out ${
              isCallActive
                ? callState === 'gemini_speaking' ? 'bg-gradient-to-br from-purple-500 via-indigo-600 to-cyan-400 shadow-[0_0_80px_rgba(168,85,247,0.65)]'
                : callState === 'user_speaking' ? 'bg-gradient-to-br from-cyan-400 via-teal-500 to-blue-600 shadow-[0_0_80px_rgba(34,211,238,0.7)] animate-pulse'
                : callState === 'thinking' ? 'bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-700 shadow-[0_0_80px_rgba(245,158,11,0.55)]'
                : callState === 'interrupted' ? 'bg-gradient-to-br from-rose-500 via-pink-600 to-amber-500 shadow-[0_0_80px_rgba(244,63,94,0.7)]'
                : callState === 'reconnecting' ? 'bg-gradient-to-br from-blue-500 via-indigo-600 to-slate-700 shadow-[0_0_60px_rgba(59,130,246,0.5)]'
                : callState === 'error' ? 'bg-gradient-to-br from-red-600 via-rose-700 to-slate-900 shadow-[0_0_60px_rgba(239,68,68,0.5)]'
                : callState === 'muted' ? 'bg-gradient-to-br from-rose-600 to-slate-800 shadow-[0_0_60px_rgba(244,63,94,0.4)]'
                : 'bg-gradient-to-br from-cyan-400 via-indigo-600 to-blue-700 shadow-[0_0_70px_rgba(34,211,238,0.55)]'
                : 'bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)]'}`}>
            <div className="flex flex-col items-center justify-center gap-1.5 text-white">
              {isCallActive ? (
                callState === 'gemini_speaking' ? <Volume2 className="h-10 w-10 sm:h-12 sm:w-12 animate-pulse text-purple-200" />
                : callState === 'user_speaking' ? <Mic className="h-10 w-10 sm:h-12 sm:w-12 animate-bounce text-cyan-200" />
                : callState === 'thinking' ? <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-amber-200" />
                : callState === 'interrupted' ? <Zap className="h-10 w-10 sm:h-12 sm:w-12 text-rose-200 animate-pulse" />
                : callState === 'reconnecting' ? <RefreshCw className="h-10 w-10 sm:h-12 sm:w-12 text-blue-200 animate-spin" />
                : callState === 'error' ? <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-200 animate-pulse" />
                : callState === 'muted' ? <MicOff className="h-10 w-10 sm:h-12 sm:w-12 text-rose-200" />
                : <Activity className="h-10 w-10 sm:h-12 sm:w-12 animate-pulse text-emerald-300" />
              ) : (
                <PhoneCall className="h-10 w-10 sm:h-12 sm:w-12 text-slate-400" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex h-14 items-center justify-center gap-1.5">
          {frequencyBars.map((height, idx) => (
            <div key={idx} style={{ height: `${height}%` }}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isCallActive
                  ? callState === 'gemini_speaking' ? 'bg-gradient-to-t from-purple-500 to-cyan-300'
                  : callState === 'user_speaking' ? 'bg-gradient-to-t from-cyan-400 to-emerald-300'
                  : 'bg-gradient-to-t from-cyan-500 to-indigo-300'
                  : 'bg-white/10'}`} />
          ))}
        </div>

        {callState === 'gemini_speaking' && (
          <div className="mt-4 flex items-center justify-center">
            <button
              onClick={() => handleUserBargeIn()}
              className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.35)] hover:bg-rose-500/30 hover:scale-105 active:scale-95 transition-all">
              <Square className="h-3.5 w-3.5 fill-rose-300" />
              <span>Tap to Interrupt / Stop Speaking</span>
            </button>
          </div>
        )}

        <div className="mt-5 w-full max-w-2xl px-4">
          {currentTurn ? (
            <div className="rounded-2xl border border-white/15 bg-black/40 p-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${currentTurn.speaker === 'gemini' ? 'text-cyan-400' : 'text-indigo-300'}`}>
                  {currentTurn.speaker === 'gemini' ? 'Gemini Live' : 'You (Live Speech)'}
                </span>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="text-[10px] text-slate-400 font-mono">Live Sync</span>
              </div>
              <p className="text-base sm:text-lg font-medium leading-relaxed text-slate-100">"{currentTurn.text}"</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-center text-sm text-slate-400">
              {isCallActive
                ? 'Speak naturally in Hindi, Hinglish, or English. Say "Stop" or "Wait" anytime to interrupt.'
                : 'Click "Start Live Call" below to begin real-time conversational call with Gemini Live.'}
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-20 flex items-center justify-center border-t border-white/10 bg-black/40 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-6 sm:gap-8">
          <button onClick={toggleMic} disabled={!isCallActive}
            className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-lg ${
              !isCallActive ? 'border-white/10 bg-white/5 text-slate-600 cursor-not-allowed'
              : isMicMuted ? 'border-rose-500/60 bg-rose-500/20 text-rose-400 shadow-rose-500/20 hover:bg-rose-500/30'
              : 'border-white/20 bg-white/10 text-white hover:bg-white/20'}`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}>
            {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          {!isCallActive ? (
            <button onClick={startLiveCall}
              className="group relative flex items-center gap-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(16,185,129,0.45)] hover:shadow-[0_0_50px_rgba(16,185,129,0.7)] hover:scale-105 active:scale-95 transition-all duration-200">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <PhoneCall className="h-4 w-4 text-white group-hover:rotate-12 transition-transform" />
              </div>
              <span>Start Live Call</span>
            </button>
          ) : (
            <button onClick={endLiveCall}
              className="group relative flex items-center gap-3.5 rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(244,63,94,0.55)] hover:shadow-[0_0_50px_rgba(244,63,94,0.8)] hover:scale-105 active:scale-95 transition-all duration-200">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <PhoneOff className="h-4 w-4 text-white group-hover:-rotate-12 transition-transform" />
              </div>
              <span>End Call</span>
            </button>
          )}

          <button onClick={toggleSpeaker} disabled={!isCallActive}
            className={`flex h-13 w-13 items-center justify-center rounded-full border transition-all shadow-lg ${
              !isCallActive ? 'border-white/10 bg-white/5 text-slate-600 cursor-not-allowed'
              : isSpeakerMuted ? 'border-amber-500/60 bg-amber-500/20 text-amber-400 shadow-amber-500/20 hover:bg-amber-500/30'
              : 'border-white/20 bg-white/10 text-white hover:bg-white/20'}`}
            title={isSpeakerMuted ? 'Unmute Audio Speaker' : 'Mute Audio Speaker'}>
            {isSpeakerMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </button>
        </div>
      </footer>

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Gemini Live Settings</h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 pt-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Select Gemini Voice</label>
                <div className="grid grid-cols-1 gap-2.5 mt-2.5">
                  {VOICE_OPTIONS.map((v) => (
                    <button key={v.id} onClick={() => setSelectedVoice(v.id)} disabled={isCallActive}
                      className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition disabled:opacity-50 ${
                        selectedVoice === v.id ? 'border-indigo-500 bg-indigo-500/20 text-white'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{v.name}</span>
                          <span className="rounded bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">{v.tag}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{v.desc}</p>
                      </div>
                      {selectedVoice === v.id && <CheckCircle2 className="h-5 w-5 text-indigo-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Spoken Language Mode</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {(['hinglish', 'hindi', 'english'] as LanguageMode[]).map((lang) => (
                    <button key={lang} onClick={() => setLanguageMode(lang)} disabled={isCallActive}
                      className={`rounded-xl border py-2.5 text-xs font-bold capitalize transition disabled:opacity-50 ${
                        languageMode === lang ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Voice Activity Detection (VAD)</label>
                  <span className="font-mono text-xs text-indigo-400 font-bold">{vadSensitivity}%</span>
                </div>
                <input type="range" min="10" max="90" value={vadSensitivity} disabled={isCallActive}
                  onChange={(e) => setVadSensitivity(parseInt(e.target.value, 10))}
                  className="mt-2.5 w-full accent-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isCallActive ? 'VAD sensitivity is locked during active call.' : 'Higher = faster response after you pause. Recommended: 55%.'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-white">Smart Echo Isolation</span>
                      <p className="text-[11px] text-slate-400">Prevents microphone feedback loop on laptop and phone speakers</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isCallActive}
                    onClick={() => {
                      const next = !echoIsolationMode;
                      setEchoIsolationMode(next);
                      try { localStorage.setItem('gemini_live_echo_isolation', String(next)); } catch {}
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50 ${
                      echoIsolationMode ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        echoIsolationMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsSettingsOpen(false)}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative flex h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/15 bg-slate-900 shadow-2xl text-slate-100 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <History className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Call Transcript History</h3>
              </div>
              <div className="flex items-center gap-2">
                {recentSessions.length > 0 && (
                  <button onClick={() => {
                    setRecentSessions([]);
                    localStorage.removeItem('gemini_live_sessions');
                    showSuccess('History Cleared', 'All stored call transcripts have been deleted.');
                  }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/20 transition">
                    <Trash2 className="h-3.5 w-3.5" /> Clear History
                  </button>
                )}
                <button onClick={() => setIsHistoryOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {recentSessions.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <Headphones className="h-10 w-10 text-slate-600 mb-2" />
                  <p className="text-sm font-semibold">No recorded call sessions yet.</p>
                  <p className="text-xs mt-1">Start a Gemini Live Call to create your first transcript.</p>
                </div>
              ) : (
                recentSessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-white/10 bg-white/5 p-4.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-white">{session.startedAt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono text-indigo-300">{formatDuration(session.durationSeconds)}</span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{session.voice}</span>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {session.turns.map((turn, tIdx) => (
                        <div key={tIdx} className="text-xs">
                          <span className={`font-bold mr-1.5 ${turn.speaker === 'gemini' ? 'text-cyan-400' : 'text-indigo-300'}`}>
                            {turn.speaker === 'gemini' ? 'Gemini:' : 'You:'}
                          </span>
                          <span className="text-slate-200">{turn.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIAssistantPage;