import { type NextRequest } from 'next/server';
import { MongoObjectId, VoiceProvider } from '@aixellabs/backend/db';
import { isValidObjectId } from '@/helpers/object-id';
import { dialTwiml, toE164 } from '@/helpers/voice-web-phone';
import { findItem } from '@/server/voice-agent/accounts';
import { verifyWebPhoneToken } from '@/server/voice-agent/web-phone';

/**
 * The Voice URL of the "Aixel Labs web phone" TwiML app (see `server/voice-agent/web-phone.ts`).
 * Twilio posts here when the owner calls from the browser: `To`, plus the number id `n` and the
 * signed `t` the browser got with its token. The answer rings `To` from that number. A request
 * without a valid `t` hangs up, so this cannot be used to dial out from anyone's number.
 */

export const dynamic = 'force-dynamic';

const HANG_UP = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

function twiml(body: string) {
    return new Response(body, { headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
    const form = await request.formData();
    const field = (name: string) => String(form.get(name) ?? '');
    const numberId = field('n');
    const to = toE164(field('To'));
    if (!to || !isValidObjectId(numberId) || !verifyWebPhoneToken(numberId, field('t'))) return twiml(HANG_UP);

    const number = await findItem('numbers', { _id: new MongoObjectId(numberId) });
    // The call must come from the account the number is in.
    if (number?.provider !== VoiceProvider.TWILIO || number.twilio?.accountSid !== field('AccountSid')) {
        return twiml(HANG_UP);
    }
    return twiml(dialTwiml(number.phoneNumber, to));
}
