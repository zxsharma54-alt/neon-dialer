import { useRef, useCallback, useEffect } from 'react';

// Minimal type declarations for Web Speech API (not in standard TS lib)
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ||
    null
  );
}

interface UseVoiceRecognitionOptions {
  onResult: (transcript: string) => void;
}

export function useVoiceRecognition({ onResult }: UseVoiceRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const onResultRef = useRef(onResult);

  // Keep latest callback without restarting recognition
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return false;

    if (listeningRef.current) return true;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (transcript) {
          onResultRef.current(transcript);
        }
      }
    };

    recognition.onerror = () => {
      listeningRef.current = false;
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          listeningRef.current = false;
        }
      }
    };

    try {
      recognition.start();
      listeningRef.current = true;
      recognitionRef.current = recognition;
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { start, stop };
}
