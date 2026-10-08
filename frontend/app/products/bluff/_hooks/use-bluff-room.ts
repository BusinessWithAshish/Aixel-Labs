'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BLUFF_ERRORS } from '@aixellabs/backend/bluff/constants';
import type {
    BluffClientMessage,
    BluffCommand,
    BluffRoomConfig,
    BluffRoomSummary,
    BluffRoomView,
    BluffServerMessage,
} from '@aixellabs/backend/bluff/types';
import { useBusinessServerWsUrl } from '../../business/_components/BusinessConfig';
import { notify } from '../../business/_lib/toast';
import { bluffWsUrl, loadSeat, rememberRoom, saveSeat } from '../_lib/client';

export type BluffRoomStatus = 'connecting' | 'need-join' | 'ready' | 'missing' | 'kicked' | 'closed';

const RETRY_MS = 1500;
/** How often the delay to the server is measured. */
const PING_MS = 2000;

/** Owns the room socket: resumes the seat, keeps the latest snapshot, sends intents, reconnects. */
export function useBluffRoom(code: string) {
    const [room, setRoom] = useState<BluffRoomView | null>(null);
    const [status, setStatus] = useState<BluffRoomStatus>('connecting');
    const [online, setOnline] = useState(false);
    /** Round-trip time of the last ping in ms: the connection-strength meter. */
    const [rtt, setRtt] = useState<number | null>(null);
    /** Server clock minus local clock, so countdowns match the server. */
    const [clockOffset, setClockOffset] = useState(0);
    /** What an invitee sees before joining: whose room it is and how full. */
    const [invite, setInvite] = useState<BluffRoomSummary | null>(null);
    const serverUrl = useBusinessServerWsUrl();
    const wsRef = useRef<WebSocket | null>(null);
    const idRef = useRef(0);

    const post = useCallback((msg: BluffClientMessage) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        else notify('Reconnecting to the game. Try again in a moment.', 'error');
    }, []);

    useEffect(() => {
        let closed = false;
        let retry: number | undefined;
        let ping: number | undefined;
        let pingSentAt = 0;
        let pingWaiting = false;

        const connect = () => {
            const ws = new WebSocket(bluffWsUrl(serverUrl));
            wsRef.current = ws;
            const sendPing = () => {
                if (ws.readyState !== WebSocket.OPEN) return;
                // The last ping is still unanswered: the delay shown climbs with the wait.
                if (pingWaiting) return setRtt(Math.round(performance.now() - pingSentAt));
                pingWaiting = true;
                pingSentAt = performance.now();
                ws.send('{"t":"ping"}');
            };

            ws.onopen = () => {
                setOnline(true);
                const seat = loadSeat(code);
                if (seat) ws.send(JSON.stringify({ t: 'resume', code, token: seat.token }));
                else {
                    // A removed player stays on the "removed" screen after a reconnect.
                    setStatus((prev) => (prev === 'kicked' || prev === 'closed' ? prev : 'need-join'));
                    ws.send(JSON.stringify({ t: 'peek', code }));
                }
                pingWaiting = false;
                sendPing();
                ping = window.setInterval(sendPing, PING_MS);
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data as string) as BluffServerMessage;
                if (msg.t === 'pong') {
                    pingWaiting = false;
                    setRtt(Math.round(performance.now() - pingSentAt));
                } else if (msg.t === 'peek') {
                    setInvite(msg.room);
                } else if (msg.t === 'kicked') {
                    saveSeat(code, null);
                    setStatus('kicked');
                } else if (msg.t === 'closed') {
                    saveSeat(code, null);
                    setStatus('closed');
                } else if (msg.t === 'joined') {
                    saveSeat(code, { token: msg.token, seat: msg.seat });
                } else if (msg.t === 'room') {
                    setRoom(msg.room);
                    rememberRoom(code);
                    setClockOffset(msg.room.now - Date.now());
                    setStatus('ready');
                } else if (msg.t === 'late') {
                    // Someone else called first, or the cards were already covered: a plain notice, nothing went wrong.
                    notify(msg.message, 'info');
                } else if (msg.t === 'error') {
                    if (msg.message === BLUFF_ERRORS.ROOM_NOT_FOUND) {
                        saveSeat(code, null);
                        setStatus((prev) => (prev === 'closed' ? prev : 'missing'));
                    } else if (msg.message === BLUFF_ERRORS.BAD_TOKEN) {
                        saveSeat(code, null);
                        setStatus('need-join');
                        ws.send(JSON.stringify({ t: 'peek', code }));
                    } else {
                        notify(msg.message, 'error');
                    }
                }
            };

            ws.onclose = () => {
                setOnline(false);
                setRtt(null);
                window.clearInterval(ping);
                if (!closed) retry = window.setTimeout(connect, RETRY_MS);
            };
        };

        connect();
        return () => {
            closed = true;
            window.clearTimeout(retry);
            window.clearInterval(ping);
            wsRef.current?.close();
        };
    }, [code, serverUrl]);

    const send = useCallback((cmd: BluffCommand) => post({ t: 'cmd', id: ++idRef.current, cmd }), [post]);
    const join = useCallback((name: string) => post({ t: 'join', code, name }), [post, code]);
    const start = useCallback(() => post({ t: 'start' }), [post]);
    const configure = useCallback((patch: Partial<BluffRoomConfig>) => post({ t: 'config', ...patch }), [post]);
    const kick = useCallback((seat: number) => post({ t: 'kick', seat }), [post]);
    const move = useCallback((seat: number, to: number) => post({ t: 'move', seat, to }), [post]);
    const pause = useCallback((on: boolean) => post({ t: 'pause', on }), [post]);
    const close = useCallback(() => post({ t: 'close' }), [post]);
    const end = useCallback(() => post({ t: 'end' }), [post]);

    return { room, status, invite, online, rtt, clockOffset, send, join, start, configure, kick, move, pause, close, end };
}

export type BluffSend = (cmd: BluffCommand) => void;
