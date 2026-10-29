import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { getCurrentUserObjectId } from '@/server/auth';
import { hasContentLabAiKey } from '@/server/content-lab/ai-key';
import { CheckView } from './_components/CheckView';
import { type CheckPageData, useCheckPage } from './_hooks/use-check-page';

type CheckPageProps = { searchParams: Promise<Record<'platform' | 'q' | 'text' | 'country', string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '');

/** Score a draft title or hook against the niche's winners; 3 stronger versions on the owner's Gemini key. */
export default async function ContentLabCheckPage({ searchParams }: CheckPageProps) {
    const [params, userId] = await Promise.all([searchParams, getCurrentUserObjectId()]);
    const country = one(params.country);
    const data: CheckPageData = {
        platform: one(params.platform) === 'instagram' ? 'instagram' : 'youtube',
        query: one(params.q),
        text: one(params.text),
        country: /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : CONTENT_LAB_DEFAULT_COUNTRY,
        hasGeminiKey: userId ? await hasContentLabAiKey(userId) : false,
    };

    return (
        <PageLayout title="Check my idea">
            <PageProvider data={data} usePageHook={useCheckPage}>
                <CheckView />
            </PageProvider>
        </PageLayout>
    );
}
