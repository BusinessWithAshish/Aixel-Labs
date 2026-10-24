/**
 * Linphone's remote provisioning file: its config (linphonerc) as XML, fetched once from a link or a QR code. It
 * sets up the owner's Telnyx softphone the way it works on every network (Ashish's tests, 2026-10-24): sign-in and
 * calls over TLS through sip.telnyx.com (`reg_proxy` + `reg_route`, the outbound proxy: Telnyx's subdomains have no
 * SRV records, so without the route an INVITE goes out on UDP 5060, which mobile carriers block), IPv6 off, no video,
 * no media encryption, and this account as the default one. Keys: liblinphone's linphonerc ([sip], [video],
 * [proxy_N], [auth_info_N], [misc] transient_provisioning = apply once, do not fetch again on the next start).
 * Import-free, so `linphone-provisioning.test.mjs` runs it with plain `node --test`.
 */

export const SOFTPHONE_SIP_DOMAIN = 'sip.telnyx.com';
/** Where Linphone signs in and sends every call: TLS on 5061. */
export const SOFTPHONE_TLS_PROXY = `<sip:${SOFTPHONE_SIP_DOMAIN};transport=tls>`;

const escapeXml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Sections = Record<string, Record<string, string | number>>;

export function linphoneProvisioningXml(login: { userName: string; password: string; displayName: string }): string {
    const identity = `"${login.displayName.replace(/["\\]/g, '')}" <sip:${login.userName}@${SOFTPHONE_SIP_DOMAIN}>`;
    const sections: Sections = {
        sip: { default_proxy: 0, use_ipv6: 0, media_encryption: 'none' },
        video: { capture: 0, display: 0, automatically_initiate: 0, automatically_accept: 0 },
        proxy_0: {
            reg_identity: identity,
            reg_proxy: SOFTPHONE_TLS_PROXY,
            reg_route: SOFTPHONE_TLS_PROXY,
            reg_expires: 3600,
            reg_sendregister: 1,
            publish: 0,
            avpf: 0,
        },
        auth_info_0: { username: login.userName, passwd: login.password, domain: SOFTPHONE_SIP_DOMAIN },
        misc: { transient_provisioning: 1 },
    };
    const body = Object.entries(sections)
        .map(
            ([name, entries]) =>
                `  <section name="${name}">\n${Object.entries(entries)
                    .map(([key, value]) => `    <entry name="${key}" overwrite="true">${escapeXml(String(value))}</entry>`)
                    .join('\n')}\n  </section>`,
        )
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<config xmlns="http://www.linphone.org/xsds/lpconfig.xsd">\n${body}\n</config>\n`;
}
