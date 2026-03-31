'use client';

export type Listener<T = never> = (data: T) => void | Promise<void>;

type EventMap = {
    'navigation:loading': boolean;
};

class EventBusImpl {
    private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};

    subscribe<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }

        const listeners = this.listeners[event] as Set<Listener<EventMap[K]>>;
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                delete this.listeners[event];
            }
        };
    }

    async publish<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
        const listeners = this.listeners[event];
        if (!listeners) return;

        const errors: Error[] = [];

        await Promise.all(
            Array.from(listeners).map(async (listener) => {
                try {
                    await (listener as Listener<EventMap[K]>)(data);
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
        this.listeners = {};
    }

    getListenerCount(event: keyof EventMap): number {
        return this.listeners[event]?.size ?? 0;
    }
}

export const eventBus = new EventBusImpl();
