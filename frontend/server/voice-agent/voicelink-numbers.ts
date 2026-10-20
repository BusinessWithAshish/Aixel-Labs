import 'server-only';

import {
    getCollection,
    MongoCollections,
    type VoiceLinkNumberState,
    type VoiceLinkRouting,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import { numberWebhookUrl, openSecret, voicelinkSocketUrl } from '@/server/voice-agent/engine';
import type { NumberProvider, OwnedNumberDoc, ProviderAccountNumber } from '@/server/voice-agent/number-provider';
import {
    createBot,
    createRouting,
    listBots,
    listDids,
    listRoutings,
    updateBot,
    updateRouting,
    VoiceLinkApiError,
    VoiceLinkInboundRoute,
    VoiceLinkOutboundRoute,
    type VoiceLinkAuth,
    type VoiceLinkBotInput,
    type VoiceLinkDid,
    type VoiceLinkRoutingRule,
    type VoiceLinkRoutingWrite,
} from '@/server/voice-agent/voicelink';

/**
 * VoiceLink (Indian numbers). Each DID has ONE routing rule covering both directions, so we
 * only ever change the half we need and resend the other half as it is:
 *
 * - AI answering on  = inbound half -> our WebSocket bot; off = inbound half put back.
 * - Outbound agent   = outbound half -> our bot (VoiceLink only dials from a number whose
 *   outbound half is an active WebSocket bot); cleared = outbound half put back.
 * - The rule as it was before our first change is saved in `voicelink.previousRouting`
 *   (null: the DID had no rule) and restored half by half; it is dropped once neither half
 *   is ours, so a later change saves whatever the customer has by then.
 * - The API has no delete for rules or bots: a rule we created is switched off (status 0) when
 *   neither half is ours any more, and the bot is switched off when the number is removed.
 * - A half with no handler is sent as `for_inbound_call: null` (not yet tried on the live API)
 *   or `for_outbound_call: 4` (only answer, what the VoiceLink SDK sets for a new rule).
 */

const OUR_ROUTE = VoiceLinkInboundRoute.WEBSOCKET_BOT;

type Half = { route: number | null; sipTrunkId: number | null; botId: number | null };
type Want = { inbound: boolean; outbound: boolean };

const NO_INBOUND: Half = { route: null, sipTrunkId: null, botId: null };
/** What VoiceLink's own tooling sets for a new rule with no outbound handler. */
const NO_OUTBOUND: Half = { route: VoiceLinkOutboundRoute.ONLY_ANSWER, sipTrunkId: null, botId: null };

function digits(value: string): string {
    return value.replace(/\D/g, '');
}

/** "919484950416" (country code "91") -> "+919484950416"; a bare national number gets the code in front. */
export function didToE164(did: VoiceLinkDid): string {
    const countryCode = digits(did.countryCode ?? '') || '91';
    const number = did.didNumber;
    return number.startsWith(countryCode) && number.length > 10 ? `+${number}` : `+${countryCode}${number}`;
}

function didStatus(did: VoiceLinkDid): string {
    if (did.isExpired) return 'expired';
    if (did.statusLabel) return did.statusLabel.toLowerCase();
    return did.status === 0 ? 'inactive' : 'active';
}

/** The account's DIDs. Also the token check. */
export async function listVoiceLinkAccountNumbers(auth: VoiceLinkAuth): Promise<ProviderAccountNumber[]> {
    const dids = await listDids(auth);
    return dids.map((did) => ({ providerNumberId: String(did.id), phoneNumber: didToE164(did), status: didStatus(did) }));
}

function authFor(doc: OwnedNumberDoc): VoiceLinkAuth {
    return { token: openSecret(doc.apiKeySealed), clientId: doc.voicelink?.clientId ?? null };
}

function botInput(doc: OwnedNumberDoc, status: 0 | 1): VoiceLinkBotInput {
    const numberId = doc._id.toString();
    return {
        botName: `Aixel Labs ${doc.phoneNumber}`,
        websocketUrl: voicelinkSocketUrl(numberId),
        webhookUrl: numberWebhookUrl('/voicelink-events', numberId),
        status,
    };
}

async function saveState(doc: OwnedNumberDoc, fields: Partial<VoiceLinkNumberState>): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(fields)) set[`voicelink.${key}`] = value;
    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    await numbers.updateOne({ _id: doc._id }, { $set: set });
    doc.voicelink = { ...doc.voicelink, ...fields };
}

async function forgetPreviousRouting(doc: OwnedNumberDoc): Promise<void> {
    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    await numbers.updateOne(
        { _id: doc._id },
        { $unset: { 'voicelink.previousRouting': '' }, $set: { updatedAt: new Date() } },
    );
    if (doc.voicelink) delete doc.voicelink.previousRouting;
}

/**
 * Our bot for this number, made on first need. A bot with our name left from an earlier import
 * of the same number is re-pointed at this one (the update is a full replace, sent active:
 * VoiceLink's list reports bots in use as inactive, so its status is never echoed back).
 */
async function ensureBot(doc: OwnedNumberDoc, auth: VoiceLinkAuth): Promise<number> {
    const saved = doc.voicelink?.botId;
    if (saved) return saved;
    const input = botInput(doc, 1);
    const wanted = input.botName.trim().toLowerCase();
    const existing = (await listBots(auth)).find((bot) => bot.botName.trim().toLowerCase() === wanted);
    let botId: number;
    if (existing) {
        await updateBot(auth, existing.id, input);
        botId = existing.id;
    } else {
        botId = (await createBot(auth, input)).id;
    }
    await saveState(doc, { botId });
    return botId;
}

async function findRule(auth: VoiceLinkAuth, doc: OwnedNumberDoc): Promise<VoiceLinkRoutingRule | null> {
    const didId = Number(doc.providerNumberId);
    const didNumber = digits(doc.phoneNumber);
    const rules = await listRoutings(auth);
    return rules.find((rule) => rule.didId === didId || rule.didNumber === didNumber) ?? null;
}

/**
 * The rule as saved before our first change. A half already on our bot (left from an earlier
 * setup of this number) is saved as "no handler", so it is never put back as the customer's.
 */
function storedRouting(rule: VoiceLinkRoutingRule, botId: number | null): VoiceLinkRouting {
    const ours = (route: number | null, bot: number | null) => botId !== null && route === OUR_ROUTE && bot === botId;
    const inboundOurs = ours(rule.forInboundCall, rule.inboundWebsocketBotId);
    const outboundOurs = ours(rule.forOutboundCall, rule.outboundWebsocketBotId);
    return {
        forInboundCall: inboundOurs ? NO_INBOUND.route : rule.forInboundCall,
        inboundSipTrunkId: inboundOurs ? null : rule.inboundSipTrunkId,
        inboundWebsocketBotId: inboundOurs ? null : rule.inboundWebsocketBotId,
        forOutboundCall: outboundOurs ? NO_OUTBOUND.route : rule.forOutboundCall,
        outboundSipTrunkId: outboundOurs ? null : rule.outboundSipTrunkId,
        outboundWebsocketBotId: outboundOurs ? null : rule.outboundWebsocketBotId,
        status: rule.status,
    };
}

function inboundOf(rule: VoiceLinkRouting): Half {
    return { route: rule.forInboundCall, sipTrunkId: rule.inboundSipTrunkId, botId: rule.inboundWebsocketBotId };
}

function outboundOf(rule: VoiceLinkRouting): Half {
    return { route: rule.forOutboundCall, sipTrunkId: rule.outboundSipTrunkId, botId: rule.outboundWebsocketBotId };
}

function compose(inbound: Half, outbound: Half, status: number | null): VoiceLinkRoutingWrite {
    return {
        forInboundCall: inbound.route,
        inboundSipTrunkId: inbound.sipTrunkId,
        inboundWebsocketBotId: inbound.botId,
        forOutboundCall: outbound.route,
        outboundSipTrunkId: outbound.sipTrunkId,
        outboundWebsocketBotId: outbound.botId,
        status,
    };
}

/** Same handler: the same route, and the same bot or trunk for the routes that name one. */
function sameHalf(a: Half, b: Half): boolean {
    if ((a.route || null) !== (b.route || null)) return false;
    if (a.route === OUR_ROUTE) return a.botId === b.botId;
    if (a.route === VoiceLinkInboundRoute.SIP_TRUNK) return a.sipTrunkId === b.sipTrunkId;
    return true;
}

function isNoHandler(inbound: Half, outbound: Half): boolean {
    return !inbound.route && (!outbound.route || outbound.route === VoiceLinkOutboundRoute.ONLY_ANSWER);
}

/**
 * Brings the DID's rule to `want` (which halves go to our bot). Saves the rule on the first
 * change, takes the wanted halves, puts back the halves that are ours but no longer wanted, and
 * leaves every other half exactly as VoiceLink has it now.
 */
async function syncRouting(doc: OwnedNumberDoc, want: Want): Promise<void> {
    const auth = authFor(doc);
    const wantsAny = want.inbound || want.outbound;
    const saved = doc.voicelink?.previousRouting !== undefined;
    // Never touched its routing, and nothing to take: leave it alone.
    if (!saved && !wantsAny) return;

    const botId = wantsAny ? await ensureBot(doc, auth) : (doc.voicelink?.botId ?? null);
    const current = await findRule(auth, doc);

    let previous: VoiceLinkRouting | null;
    if (saved) {
        previous = doc.voicelink?.previousRouting ?? null;
    } else {
        previous = current ? storedRouting(current, botId) : null;
        // Saved before anything changes, so a failure half-way still knows what to put back.
        await saveState(doc, { previousRouting: previous, routingId: current?.id ?? null });
    }

    const ourHalf: Half = { route: OUR_ROUTE, sipTrunkId: null, botId };
    const isOurs = (half: Half) => botId !== null && half.route === OUR_ROUTE && half.botId === botId;

    if (!current) {
        if (wantsAny) {
            const rule = compose(want.inbound ? ourHalf : NO_INBOUND, want.outbound ? ourHalf : NO_OUTBOUND, 1);
            const { id } = await createRouting(
                auth,
                { id: Number(doc.providerNumberId), didNumber: digits(doc.phoneNumber) },
                rule,
            );
            await saveState(doc, { routingId: id });
        }
    } else {
        const currentIn = inboundOf(current);
        const currentOut = outboundOf(current);
        const putBackIn = previous ? inboundOf(previous) : NO_INBOUND;
        const putBackOut = previous ? outboundOf(previous) : NO_OUTBOUND;
        let inbound = want.inbound ? ourHalf : isOurs(currentIn) ? putBackIn : currentIn;
        let outbound = want.outbound ? ourHalf : isOurs(currentOut) ? putBackOut : currentOut;
        const touchesOurs = wantsAny || isOurs(currentIn) || isOurs(currentOut);

        let status = 1;
        if (!wantsAny) {
            if (previous) {
                status = previous.status ?? 1;
            } else if (isNoHandler(inbound, outbound)) {
                // We made this rule and nothing else uses it. The API cannot delete a rule, so it is
                // switched off as it stands (values VoiceLink already accepted).
                inbound = currentIn;
                outbound = currentOut;
                status = 0;
            } else {
                status = current.status ?? 1;
            }
        }

        const changed = !sameHalf(inbound, currentIn) || !sameHalf(outbound, currentOut) || status !== (current.status ?? 1);
        if (touchesOurs && changed) await updateRouting(auth, current.id, compose(inbound, outbound, status));
        if (doc.voicelink?.routingId !== current.id) await saveState(doc, { routingId: current.id });
    }

    if (!wantsAny) await forgetPreviousRouting(doc);
}

function isTokenRejected(error: unknown): boolean {
    return error instanceof VoiceLinkApiError && (error.status === 401 || error.status === 403);
}

export const voicelinkNumbers: NumberProvider = {
    label: 'VoiceLink',

    startAnswering(doc) {
        return syncRouting(doc, { inbound: true, outbound: !!doc.outboundAgentId });
    },

    stopAnswering(doc) {
        return syncRouting(doc, { inbound: false, outbound: !!doc.outboundAgentId });
    },

    startPlacingCalls(doc) {
        return syncRouting(doc, { inbound: !!doc.inboundAgentId, outbound: true });
    },

    stopPlacingCalls(doc) {
        return syncRouting(doc, { inbound: !!doc.inboundAgentId, outbound: false });
    },

    /** VoiceLink refuses to dial unless the outbound half is our bot, which the outbound agent sets up. */
    async prepareCall(doc) {
        if (!doc.outboundAgentId) {
            throw new Error(
                'Pick an agent under "Places calls as" for this number first. VoiceLink only dials from a number whose outgoing calls go to the AI.',
            );
        }
    },

    /** Restores the DID's rule, then switches our bot off (best effort). */
    async release(doc) {
        let auth: VoiceLinkAuth;
        try {
            auth = authFor(doc);
        } catch (error) {
            console.error('[voice] removeNumber: could not open the stored token', error);
            return;
        }
        try {
            await syncRouting(doc, { inbound: false, outbound: false });
        } catch (error) {
            // A token VoiceLink no longer accepts cannot fix anything; anything else would leave
            // the number pointing at our bot, so keep it.
            if (!isTokenRejected(error)) throw error;
            console.error('[voice] removeNumber: VoiceLink rejected the stored token', error);
            return;
        }
        const botId = doc.voicelink?.botId;
        if (!botId) return;
        try {
            await updateBot(auth, botId, botInput(doc, 0));
        } catch (error) {
            console.error('[voice] removeNumber: could not switch the VoiceLink bot off', error);
        }
    },
};
