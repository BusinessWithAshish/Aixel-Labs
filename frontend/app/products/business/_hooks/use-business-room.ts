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
import { businessWsUrl, forgetRoom, loadSeat, rememberRoom, saveSeat } from '../_lib/client';
import { notify } from '../_lib/toast';

export type BusinessRoomStatus = 'connecting' | 'need-join' | 'ready' | 'missing' | 'kicked' | 'closed';

const RETRY_MS = 1500;
/** How often the delay to the server is measured. */
const PING_MS = 2000;

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
    /** Drops the socket and opens a fresh one at once: the whole room is sent again. */
    const resyncRef = useRef<() => void>(() => {});

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
        let pingWaiting = false;

        const connect = () => {
            const ws = new WebSocket(businessWsUrl(serverUrl));
            wsRef.current = ws;
            const sendPing = () => {
                if (ws.readyState !== WebSocket.OPEN) return;
                // The last ping is still unanswered: the delay shown climbs with the wait, so a network
                // that is breaking up shows at once instead of holding its last good number.
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
                const msg = JSON.parse(event.data as string) as BusinessServerMessage;
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
                    // A finished match is not one to come back to: the main screen stops offering it.
                    if (msg.room.state?.phase === 'over') forgetRoom(code);
                    else rememberRoom(code);
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
                // A socket replaced by a refresh closes quietly: the new one is already on its way.
                if (wsRef.current !== ws) return;
                setOnline(false);
                setRtt(null);
                window.clearInterval(ping);
                if (!closed) retry = window.setTimeout(connect, RETRY_MS);
            };
        };

        // Phones drop the connection while the game is in the background. The moment it is back in
        // front, or the network returns, reconnect at once instead of waiting for the next retry.
        const wake = () => {
            if (closed || document.visibilityState === 'hidden') return;
            const ws = wsRef.current;
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
            window.clearTimeout(retry);
            connect();
        };
        resyncRef.current = () => {
            if (closed) return;
            window.clearTimeout(retry);
            window.clearInterval(ping);
            const old = wsRef.current;
            connect();
            old?.close();
        };
        connect();
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('online', wake);
        window.addEventListener('pageshow', wake);
        return () => {
            closed = true;
            window.clearTimeout(retry);
            window.clearInterval(ping);
            document.removeEventListener('visibilitychange', wake);
            window.removeEventListener('online', wake);
            window.removeEventListener('pageshow', wake);
            wsRef.current?.close();
        };
    }, [code, serverUrl]);

    const send = useCallback((cmd: BusinessCommand) => post({ t: 'cmd', id: ++idRef.current, cmd }), [post]);
    const join = useCallback((name: string) => post({ t: 'join', code, name }), [post, code]);
    const start = useCallback(() => post({ t: 'start' }), [post]);
    const configure = useCallback((patch: Partial<BusinessRoomConfig>) => post({ t: 'config', ...patch }), [post]);
    const kick = useCallback((seat: number) => post({ t: 'kick', seat }), [post]);
    const move = useCallback((seat: number, to: number) => post({ t: 'move', seat, to }), [post]);
    const setTeam = useCallback((seat: number, team: number) => post({ t: 'team', seat, team }), [post]);
    const pause = useCallback((on: boolean) => post({ t: 'pause', on }), [post]);
    const close = useCallback(() => post({ t: 'close' }), [post]);
    const end = useCallback(() => post({ t: 'end' }), [post]);
    const resync = useCallback(() => resyncRef.current(), []);

    return { room, status, invite, online, rtt, clockOffset, send, join, start, configure, kick, move, setTeam, pause, close, end, resync };
}

export type BusinessSend = (cmd: BusinessCommand) => void;
