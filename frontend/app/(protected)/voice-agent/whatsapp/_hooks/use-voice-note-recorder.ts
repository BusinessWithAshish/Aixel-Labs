'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { VOICE_CHAT_LIMITS } from '@aixellabs/backend/db/types';

/** Opus in whatever container this browser records (Chrome/Firefox WebM, Safari MP4); the engine makes it WhatsApp's OGG. */
const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
const BITS_PER_SECOND = 32_000;

export type VoiceNoteRecorder = {
    recording: boolean;
    secs: number;
    start: () => Promise<void>;
    /** Ends the recording: `send` hands it to `onDone`, otherwise it is thrown away. */
    stop: (send: boolean) => void;
};

/** A voice note from the microphone, as WhatsApp records one: press, talk (up to VOICE_CHAT_LIMITS.voiceNoteSecs), send or bin it. */
export function useVoiceNoteRecorder(onDone: (audio: Blob) => void): VoiceNoteRecorder {
    const [recording, setRecording] = useState(false);
    const [secs, setSecs] = useState(0);
    const recorder = useRef<MediaRecorder | null>(null);
    const keep = useRef(false);
    const done = useRef(onDone);
    done.current = onDone;

    const stop = (send: boolean) => {
        keep.current = send;
        if (recorder.current?.state === 'recording') recorder.current.stop();
    };

    useEffect(() => {
        if (!recording) return;
        const started = Date.now();
        const tick = setInterval(() => {
            const elapsed = Math.floor((Date.now() - started) / 1000);
            setSecs(elapsed);
            if (elapsed >= VOICE_CHAT_LIMITS.voiceNoteSecs) stop(true);
        }, 250);
        return () => clearInterval(tick);
    }, [recording]);

    // Leaving the page mid-recording releases the microphone and sends nothing.
    useEffect(() => () => stop(false), []);

    const start = async () => {
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            toast.error('Allow the microphone in your browser to record a voice note');
            return;
        }
        const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
        const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITS_PER_SECOND });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            recorder.current = null;
            setRecording(false);
            setSecs(0);
            if (keep.current && chunks.length)
                done.current(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
        };
        recorder.current = rec;
        keep.current = false;
        rec.start();
        setRecording(true);
    };

    return { recording, secs, start, stop };
}
