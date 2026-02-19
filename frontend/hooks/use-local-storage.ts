import { useState, useEffect } from 'react';

type Serializer<T> = (value: T) => string;
type Deserializer<T> = (value: string) => T;

type UseLocalStorageOptions<T> = {
    serializer?: Serializer<T>;
    deserializer?: Deserializer<T>;
};

export function useLocalStorage<T>(
    key: string,
    defaultValue: T,
    options: UseLocalStorageOptions<T> = {},
): [T, (value: T | ((prev: T) => T)) => void] {
    const { serializer = JSON.stringify, deserializer = JSON.parse } = options;

    const [value, setValue] = useState<T>(() => {
        if (typeof window === 'undefined') {
            return defaultValue;
        }

        try {
            const storedValue = window.localStorage.getItem(key);
            if (storedValue === null) {
                return defaultValue;
            }
            return deserializer(storedValue);
        } catch {
            return defaultValue;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            const serialized = serializer(value);
            window.localStorage.setItem(key, serialized);
        } catch {
            // ignore write errors
        }
    }, [key, value, serializer]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== key) return;

            try {
                if (event.newValue === null) {
                    setValue(defaultValue);
                } else {
                    setValue(deserializer(event.newValue));
                }
            } catch {
                // ignore parse errors from external changes
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [key, defaultValue, deserializer]);

    const updateValue = (next: T | ((prev: T) => T)) => {
        setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
    };

    return [value, updateValue];
}

