// node --test --conditions=react-server server/rate-limit.test.mjs  (react-server: lets 'server-only' load)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRateLimit, checkRateLimit } from './rate-limit.ts';

test('a key gets max requests per window, then waits; other keys are not affected', () => {
    for (let i = 0; i < 3; i++) assert.equal(checkRateLimit('a', 3, 60_000).allowed, true);
    const over = checkRateLimit('a', 3, 60_000);
    assert.equal(over.allowed, false);
    assert.ok(!over.allowed && over.retryAfterMs > 0 && over.retryAfterMs <= 60_000);
    assert.equal(checkRateLimit('b', 3, 60_000).allowed, true);
});

test('assertRateLimit throws a plain message once over the limit', () => {
    assertRateLimit('c', 1);
    assert.throws(() => assertRateLimit('c', 1), /Too many tries\. Try again in \d+ seconds\./);
});
