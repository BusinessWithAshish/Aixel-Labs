import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalSection, LegalShell } from '../_components/legal-shell';
import { LEGAL } from '../_constants';

export const metadata: Metadata = {
    title: `Privacy Policy | ${LEGAL.companyName}`,
    description: `Privacy Policy for ${LEGAL.companyName} — how we collect, use, and protect personal data.`,
};

export default function PrivacyPolicyPage() {
    return (
        <LegalShell
            title="Privacy Policy"
            description={`This Policy explains how ${LEGAL.companyName} collects, uses, stores, and shares information when you use our websites and products.`}
        >
            <LegalSection title="1. Who we are">
                <p>
                    {LEGAL.companyName} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates lead
                    generation and automation products available at {LEGAL.appUrl} and related domains. For
                    privacy questions, contact{' '}
                    <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary underline-offset-4 hover:underline">
                        {LEGAL.contactEmail}
                    </a>
                    .
                </p>
            </LegalSection>

            <LegalSection title="2. Information we collect">
                <p>We may collect:</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>
                        <span className="text-foreground font-medium">Account data</span> — name, email, phone
                        number, authentication identifiers, organization/tenant details
                    </li>
                    <li>
                        <span className="text-foreground font-medium">Usage data</span> — searches run, modules
                        used, feature interactions, credit consumption, device/browser info, IP address, and
                        approximate location
                    </li>
                    <li>
                        <span className="text-foreground font-medium">Customer content</span> — lead lists,
                        notes, form presets, uploaded inputs, and other data you store in the product
                    </li>
                    <li>
                        <span className="text-foreground font-medium">Communications</span> — support emails,
                        contact or audit booking forms, and related correspondence
                    </li>
                    <li>
                        <span className="text-foreground font-medium">Cookies and similar tech</span> — session,
                        preference, and security cookies needed to run the app
                    </li>
                </ul>
            </LegalSection>

            <LegalSection title="3. How we use information">
                <p>We use information to:</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Provide, operate, secure, and improve the Services</li>
                    <li>Authenticate users and manage multi-tenant access</li>
                    <li>Process credits, plans, and service requests</li>
                    <li>Respond to support and sales inquiries</li>
                    <li>Detect abuse, prevent fraud, and enforce our Terms</li>
                    <li>Comply with legal obligations and protect our rights</li>
                    <li>Send product or service communications (you can opt out of non-essential marketing)</li>
                </ul>
            </LegalSection>

            <LegalSection title="4. Lead and source data">
                <p>
                    Our tools help you discover publicly available or user-provided business and contact
                    information from third-party sources. When you run searches, we process query parameters
                    and returned results on your behalf. You determine the purpose of that processing and are
                    responsible for using lead data lawfully, including outreach consent requirements in your
                    region.
                </p>
            </LegalSection>

            <LegalSection title="5. Sharing">
                <p>We may share information with:</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Service providers who help us host, authenticate, email, monitor, or support the product</li>
                    <li>Your organization administrators, within your tenant</li>
                    <li>Professional advisors or authorities when required by law or to protect rights and safety</li>
                    <li>A successor entity in connection with a merger, acquisition, or asset sale</li>
                </ul>
                <p>We do not sell your personal information.</p>
            </LegalSection>

            <LegalSection title="6. International transfers">
                <p>
                    We may process data in India and other countries where we or our providers operate.
                    Where required, we use appropriate safeguards for cross-border transfers.
                </p>
            </LegalSection>

            <LegalSection title="7. Retention">
                <p>
                    We retain account and usage data for as long as your account is active and as needed to
                    provide the Services, resolve disputes, enforce agreements, and meet legal requirements.
                    You may request deletion of account data subject to legitimate retention needs.
                </p>
            </LegalSection>

            <LegalSection title="8. Security">
                <p>
                    We use administrative, technical, and organizational measures designed to protect personal
                    data. No method of transmission or storage is completely secure; please use strong
                    credentials and notify us of suspected incidents.
                </p>
            </LegalSection>

            <LegalSection title="9. Your choices and rights">
                <p>
                    Depending on your location, you may have rights to access, correct, delete, or export
                    personal data, or to object to or restrict certain processing. To exercise these rights,
                    email {LEGAL.contactEmail}. You may also update profile details in account settings where
                    available.
                </p>
            </LegalSection>

            <LegalSection title="10. Children">
                <p>
                    The Services are not directed to children under 16 (or the minimum age required in your
                    jurisdiction). We do not knowingly collect personal data from children.
                </p>
            </LegalSection>

            <LegalSection title="11. Third-party links">
                <p>
                    The Services may link to external sites or platforms. Their privacy practices are governed
                    by their own policies. Please also review our{' '}
                    <Link href="/terms" className="text-primary underline-offset-4 hover:underline">
                        Terms of Service
                    </Link>
                    .
                </p>
            </LegalSection>

            <LegalSection title="12. Changes">
                <p>
                    We may update this Policy from time to time. The &quot;Last updated&quot; date at the top
                    of this page will change when we do. Continued use of the Services after an update means
                    you acknowledge the revised Policy.
                </p>
            </LegalSection>

            <LegalSection title="13. Contact">
                <p>
                    {LEGAL.companyName}
                    <br />
                    {LEGAL.contactAddress}
                    <br />
                    <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary underline-offset-4 hover:underline">
                        {LEGAL.contactEmail}
                    </a>
                </p>
            </LegalSection>
        </LegalShell>
    );
}
