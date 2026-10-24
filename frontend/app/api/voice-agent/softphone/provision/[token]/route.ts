import { linphoneProvisioningXml } from '@/helpers/linphone-provisioning';
import { takeSoftphoneProvisioning } from '@/server/voice-agent/softphone';

/**
 * Linphone's one-time setup link ("Fetch remote configuration", or its QR code): the owner's softphone account as
 * Linphone's XML config. No session (Linphone has none): the random token in the path is the key, it works once and
 * for 10 minutes, and the answer is never cached. The token and the password are never logged.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    const login = await takeSoftphoneProvisioning((await params).token);
    if (!login) {
        return new Response('This setup link was already used or has expired. Make a new one in Aixel Labs.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain', ...NO_STORE },
        });
    }
    const xml = linphoneProvisioningXml({ ...login, displayName: 'Aixel Labs test line' });
    return new Response(xml, { headers: { 'Content-Type': 'application/xml', ...NO_STORE } });
}
