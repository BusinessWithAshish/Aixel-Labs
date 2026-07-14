import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalSection, LegalShell } from '../_components/legal-shell';
import { LEGAL } from '../_constants';

export const metadata: Metadata = {
    title: `Terms of Service | ${LEGAL.companyName}`,
    description: `Terms of Service for ${LEGAL.companyName} lead generation and automation products.`,
};

export default function TermsOfServicePage() {
    return (
        <LegalShell
            title="Terms of Service"
            description={`These Terms govern your access to and use of ${LEGAL.companyName} websites, applications, and related services.`}
        >
            <LegalSection title="1. Agreement">
                <p>
                    By creating an account, accessing our platform, or using our services, you agree to these
                    Terms of Service and our{' '}
                    <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
                        Privacy Policy
                    </Link>
                    . If you are using the services on behalf of an organization, you represent that you have
                    authority to bind that organization.
                </p>
            </LegalSection>

            <LegalSection title="2. Services">
                <p>
                    {LEGAL.companyName} provides lead generation tools, data enrichment utilities, messaging
                    and voice-related modules, and related automation software (the &quot;Services&quot;).
                    Features may vary by plan, tenant, or module access. We may update, add, or remove features
                    from time to time.
                </p>
            </LegalSection>

            <LegalSection title="3. Accounts">
                <p>
                    You must provide accurate registration information and keep your credentials secure. You
                    are responsible for activity under your account. Notify us promptly at {LEGAL.contactEmail}{' '}
                    if you suspect unauthorized access. We may suspend or terminate accounts that violate these
                    Terms or pose a security risk.
                </p>
            </LegalSection>

            <LegalSection title="4. Acceptable use">
                <p>You agree not to:</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Use the Services for unlawful, fraudulent, or harmful purposes</li>
                    <li>Violate third-party terms, platform rules, or applicable laws when collecting or contacting leads</li>
                    <li>Scrape, probe, or attack our systems beyond permitted product features</li>
                    <li>Resell, sublicense, or redistribute the Services without our written consent</li>
                    <li>Upload malware, attempt to bypass access controls, or interfere with other users</li>
                    <li>Use automated means to create accounts or abuse credits, rate limits, or free tiers</li>
                </ul>
                <p>
                    You are solely responsible for how you use exported leads and for complying with spam,
                    telemarketing, privacy, and advertising laws in your jurisdiction.
                </p>
            </LegalSection>

            <LegalSection title="5. Credits, plans, and payments">
                <p>
                    Some features consume credits or require a paid plan. Credit balances, pricing, and plan
                    limits are shown in the product or communicated separately. Unused promotional credits may
                    expire. Fees are non-refundable except where required by law or expressly stated by us in
                    writing.
                </p>
            </LegalSection>

            <LegalSection title="6. Customer data and leads">
                <p>
                    You retain rights to data you submit and to lead lists you generate through the Services,
                    subject to third-party rights in public source data. You grant us a limited license to
                    process that data to operate, secure, and improve the Services. You represent that you have
                    a lawful basis to process contact and business data you collect or import.
                </p>
            </LegalSection>

            <LegalSection title="7. Intellectual property">
                <p>
                    The Services, including software, branding, UI, and documentation, are owned by{' '}
                    {LEGAL.companyName} or its licensors. These Terms do not transfer ownership. You may not
                    copy, reverse engineer, or create derivative works from our software except as allowed by
                    law.
                </p>
            </LegalSection>

            <LegalSection title="8. Third-party services">
                <p>
                    The Services may integrate with or rely on third parties (for example authentication,
                    hosting, maps, social platforms, or messaging providers). Those services are governed by
                    their own terms. We are not responsible for third-party availability, policies, or data
                    practices beyond our control.
                </p>
            </LegalSection>

            <LegalSection title="9. Disclaimers">
                <p>
                    The Services are provided &quot;as is&quot; and &quot;as available.&quot; To the fullest
                    extent permitted by law, we disclaim warranties of merchantability, fitness for a
                    particular purpose, and non-infringement. Lead data may be incomplete, outdated, or
                    inaccurate; verify critical information before relying on it.
                </p>
            </LegalSection>

            <LegalSection title="10. Limitation of liability">
                <p>
                    To the fullest extent permitted by law, {LEGAL.companyName} and its affiliates will not be
                    liable for indirect, incidental, special, consequential, or punitive damages, or for lost
                    profits, revenue, or data. Our aggregate liability arising from the Services will not
                    exceed the amounts you paid us for the Services in the twelve (12) months before the claim.
                </p>
            </LegalSection>

            <LegalSection title="11. Indemnity">
                <p>
                    You will defend and indemnify {LEGAL.companyName} against claims arising from your use of
                    the Services, your lead outreach, your content, or your violation of these Terms or
                    applicable law.
                </p>
            </LegalSection>

            <LegalSection title="12. Suspension and termination">
                <p>
                    You may stop using the Services at any time. We may suspend or terminate access for
                    violation of these Terms, non-payment, legal risk, or service misuse. Provisions that by
                    nature should survive (including IP, disclaimers, liability limits, and indemnity) will
                    survive termination.
                </p>
            </LegalSection>

            <LegalSection title="13. Changes">
                <p>
                    We may update these Terms. Material changes will be reflected by updating the &quot;Last
                    updated&quot; date on this page. Continued use after changes become effective constitutes
                    acceptance of the revised Terms.
                </p>
            </LegalSection>

            <LegalSection title="14. Governing law">
                <p>
                    These Terms are governed by the laws of India, without regard to conflict-of-law rules.
                    Courts in Pune, Maharashtra will have exclusive jurisdiction, subject to mandatory
                    consumer protections that may apply.
                </p>
            </LegalSection>

            <LegalSection title="15. Contact">
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
