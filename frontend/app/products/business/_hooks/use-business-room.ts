'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUSINESS_ERRORS } from '@aixellabs/backend/business/constants';
import type {
    BusinessClientMessage,
    BusinessCommand,
    BusinessRoomConfig,
    BusinessRoomSummary,
    BusinessRoomView,
    BusinessServerMessage,
} from '@aixellabs/backend/business/types';
import { useBusinessServerWsUrl } from '../_components/BusinessConfig';
import { businessWsUrl, loadSeat, saveSeat } from '../_lib/client';
import { notify } from '../_lib/toast';

export type BusinessRoomStatus = 'connecting' | 'need-join' | 'ready' | 'missing' | 'kicked' | 'closed';

const RETRY_MS = 1500;
const PING_MS = 4000;

/** Owns the room socket: resumes the seat, keeps the latest snapshot, sends intents, reconnects. */
export function useBusinessRoom(code: string) {
    const [room, setRoom] = useState<BusinessRoomView | null>(null);
    const [status, setStatus] = useState<BusinessRoomStatus>('connecting');
    const [online, setOnline] = useState(false);
    /** Round-trip time of the last ping in ms: the connection-strength meter. */
    const [rtt, setRtt] = useState<number | null>(null);
    /** Server clock minus local clock, so countdowns match the server. */
    const [clockOffset, setClockOffset] = useState(0);
    /** What an invitee sees before joining: whose room it is and how full. */
    const [invite, setInvite] = useState<BusinessRoomSummary | null>(null);
    const serverUrl = useBusinessServerWsUrl();
    const wsRef = useRef<WebSocket | null>(null);
    const idRef = useRef(0);

    const post = useCallback((msg: BusinessClientMessage) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        else notify('Reconnecting to the game. Try again in a moment.', 'error');
    }, []);

    useEffect(() => {
        let closed = false;
        let retry: number | undefined;
        let ping: number | undefined;
        let pingSentAt = 0;

        const connect = () => {
            const ws = new WebSocket(businessWsUrl(serverUrl));
            wsRef.current = ws;
            const sendPing = () => {
                if (ws.readyState !== WebSocket.OPEN) return;
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
                sendPing();
                ping = window.setInterval(sendPing, PING_MS);
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data as string) as BusinessServerMessage;
                if (msg.t === 'pong') {
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
                    setClockOffset(msg.room.now - Date.now());
                    setStatus('ready');
                } else if (msg.t === 'error') {
                    if (msg.message === BUSINESS_ERRORS.ROOM_NOT_FOUND) {
                        saveSeat(code, null);
                        setStatus((prev) => (prev === 'closed' ? prev : 'missing'));
                    } else if (msg.message === BUSINESS_ERRORS.BAD_TOKEN) {
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

    const send = useCallback((cmd: BusinessCommand) => post({ t: 'cmd', id: ++idRef.current, cmd }), [post]);
    const join = useCallback((name: string) => post({ t: 'join', code, name }), [post, code]);
    const start = useCallback(() => post({ t: 'start' }), [post]);
    const configure = useCallback((patch: Partial<BusinessRoomConfig>) => post({ t: 'config', ...patch }), [post]);
    const kick = useCallback((seat: number) => post({ t: 'kick', seat }), [post]);
    const setTeam = useCallback((seat: number, team: number) => post({ t: 'team', seat, team }), [post]);
    const pause = useCallback((on: boolean) => post({ t: 'pause', on }), [post]);
    const close = useCallback(() => post({ t: 'close' }), [post]);

    return { room, status, invite, online, rtt, clockOffset, send, join, start, configure, kick, setTeam, pause, close };
}

export type BusinessSend = (cmd: BusinessCommand) => void;
