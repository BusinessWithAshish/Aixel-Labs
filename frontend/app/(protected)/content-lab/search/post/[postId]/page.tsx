import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { urlFromPostId } from '../../_utils/smart-box';
import { BreakdownView } from './_components/BreakdownView';
import { type BreakdownPageData, useBreakdownPage } from './_hooks/use-breakdown-page';

type PostPageProps = {
    params: Promise<{ postId: string }>;
    searchParams: Promise<Record<'url' | 'country', string | string[] | undefined>>;
};

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '');

/** Breakdown of one post; the layout adapts to the format (long video, Reel/Short, carousel). */
export default async function ContentLabPostPage({ params, searchParams }: PostPageProps) {
    const [{ postId }, query] = await Promise.all([params, searchParams]);
    const id = decodeURIComponent(postId);
    const country = one(query.country);
    const data: BreakdownPageData = {
        postId: id,
        url: one(query.url) || urlFromPostId(id),
        country: /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : CONTENT_LAB_DEFAULT_COUNTRY,
    };

    return (
        <PageLayout title="Breakdown">
            <PageProvider key={`${data.url}`} data={data} usePageHook={useBreakdownPage}>
                <BreakdownView />
            </PageProvider>
        </PageLayout>
    );
}
