// node --test helpers/user-avatar.test.mjs  (Node 22.18+ strips the .ts types itself)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVATAR_MAX_BYTES, avatarColor, avatarInitial, parseUserAvatar } from './user-avatar.ts';

const jpeg = (bytes) => 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64');

test('parseUserAvatar keeps a real JPEG', () => {
    const avatar = jpeg([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    assert.equal(parseUserAvatar(avatar), avatar);
});

test('parseUserAvatar rejects other types, fakes, junk and oversize', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    assert.throws(() => parseUserAvatar('data:image/png;base64,' + png), /JPEG/);
    assert.throws(() => parseUserAvatar('data:image/svg+xml;base64,PHN2Zz4='), /JPEG/);
    assert.throws(() => parseUserAvatar('https://evil.example/x.jpg'), /JPEG/);
    assert.throws(() => parseUserAvatar(jpeg([0x4d, 0x5a, 0x90, 0x00])), /valid/); // an .exe renamed
    assert.throws(() => parseUserAvatar(jpeg([0xff, 0xd8, 0xff, 0xe0, 1, 2])), /valid/); // truncated
    assert.throws(() => parseUserAvatar('data:image/jpeg;base64,<script>'), /valid/);
    assert.throws(() => parseUserAvatar(jpeg(new Array(AVATAR_MAX_BYTES + 10).fill(0xff))), /too large/);
});

test('avatarColor is stable per seed and avatarInitial takes the first letter', () => {
    assert.equal(avatarColor('a@b.com'), avatarColor('a@b.com'));
    assert.match(avatarColor(''), /^#[0-9a-f]{6}$/);
    assert.equal(avatarInitial(' ashish kumar'), 'A');
    assert.equal(avatarInitial(''), '?');
});
