// node --test helpers/voice-web-phone.test.mjs  (Node 22.18+ strips the .ts types itself)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeCallEnd, dialTwiml, toE164 } from './voice-web-phone.ts';

test('toE164 keeps full international numbers only', () => {
    assert.equal(toE164('+1 (415) 555-0123'), '+14155550123');
    assert.equal(toE164('0091 98765 43210'), '+919876543210');
    assert.equal(toE164('4155550123'), null);
    assert.equal(toE164('+0123456789'), null);
    assert.equal(toE164('+1415"/><Hangup/>'), null);
});

test('dialTwiml rings the number from the owner number', () => {
    assert.match(
        dialTwiml('+14155550100', '+919876543210'),
        /<Dial callerId="\+14155550100" answerOnBridge="true"><Number>\+919876543210<\/Number><\/Dial>/,
    );
});

test('describeCallEnd', () => {
    assert.equal(describeCallEnd({ providerLabel: 'Telnyx', answered: true, cause: 'NORMAL_CLEARING' }), null);
    assert.equal(
        describeCallEnd({ providerLabel: 'Telnyx', answered: false, cause: 'USER_BUSY' }),
        'The line is busy. Try again later.',
    );
    assert.equal(
        describeCallEnd({ providerLabel: 'Telnyx', answered: false, sipCode: 404 }),
        'That number does not exist. Check it, with its country code.',
    );
    assert.match(describeCallEnd({ providerLabel: 'Twilio', answered: false }), /Twilio trial account/);
    assert.match(
        describeCallEnd({ providerLabel: 'Telnyx', answered: false, sipCode: 403, cause: 'CALL_REJECTED' }),
        /verified in Telnyx/,
    );
});
