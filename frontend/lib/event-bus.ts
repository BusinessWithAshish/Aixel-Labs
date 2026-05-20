'use client';

import type { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

export type Listener<T = never> = (data: T) => void | Promise<void>;

export type LeadGenLoadingEvent = {
    scope: LEAD_GENERATION_SUB_MODULES;
    loading: boolean;
};

type EventMap = {
    'navigation:loading': boolean;
    'lead-gen:loading': LeadGenLoadingEvent;
};

class EventBusImpl {
    private listeners = new Map<keyof EventMap, Set<Listener<EventMap[keyof EventMap]>>>();

    /** Last payload per channel (lost if the module is re-evaluated). */
    private lastEmitted = new Map<keyof EventMap, EventMap[keyof EventMap]>();

    subscribe<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
        let listeners = this.listeners.get(event) as Set<Listener<EventMap[K]>> | undefined;
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(event, listeners as Set<Listener<EventMap[keyof EventMap]>>);
        }

        listeners.add(listener);

        const last = this.lastEmitted.get(event) as EventMap[K] | undefined;
        if (last !== undefined) {
            void listener(last);
        }

        return () => {
            listeners!.delete(listener);
            if (listeners!.size === 0) {
                this.listeners.delete(event);
            }
        };
    }

    async publish<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
        this.lastEmitted.set(event, data);

        const listeners = this.listeners.get(event) as Set<Listener<EventMap[K]>> | undefined;
        if (!listeners || listeners.size === 0) return;

        const errors: Error[] = [];

        await Promise.all(
            Array.from(listeners).map(async (listener) => {
                try {
                    await listener(data);
                } catch (error) {
                    errors.push(error as Error);
                    console.error(`Error executing listener for ${String(event)}:`, error);
                }
            }),
        );

        if (errors.length > 0) {
            throw new AggregateError(errors, `Failed to execute all listeners for ${String(event)}`);
        }
    }

    clearAllListeners(): void {
        this.listeners.clear();
        this.lastEmitted.clear();
    }

    getListenerCount(event: keyof EventMap): number {
        return this.listeners.get(event)?.size ?? 0;
    }
}

export const eventBus = new EventBusImpl();
