import { redirect } from 'next/navigation';
import { CONTENT_LAB_DEFAULT_COUNTRY, CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { CONTENT_LAB_PLATFORM_FILTERS, type ContentLabPlatformFilter } from '../../_constants';
import { detectQuery, smartQueryHref } from '../_utils/smart-box';
import { ExploreView } from './_components/ExploreView';
import { type ExplorePageData, useExplorePage } from './_hooks/use-explore-page';

type ExploreParams = Record<'q' | 'creator' | 'platform' | 'country', string | string[] | undefined>;
type ExplorePageProps = { searchParams: Promise<ExploreParams> };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '');
const asPlatform = (value: string): ContentLabPlatform | null =>
    (CONTENT_LAB_PLATFORMS as readonly string[]).includes(value) ? (value as ContentLabPlatform) : null;

/** What's working: cross-creator outliers for a topic (`?q=`), or one creator's (`?creator=`). */
export default async function ContentLabExplorePage({ searchParams }: ExplorePageProps) {
    const params = await searchParams;
    const detected = detectQuery(one(params.q));
    // The smart box's no-JS submit lands here with whatever was typed: a post link goes to its breakdown.
    if (detected?.kind === 'link') redirect(smartQueryHref(detected) ?? '');

    const platformParam = one(params.platform);
    const creatorParam = one(params.creator).replace(/^@/, '');
    const creator: ExplorePageData['creator'] = creatorParam
        ? { handle: creatorParam, platform: asPlatform(platformParam) }
        : detected?.kind === 'creator'
          ? { handle: detected.handle, platform: detected.platform }
          : null;
    const query = !creator && detected?.kind === 'topic' ? detected.query : null;
    const platform: ContentLabPlatformFilter =
        CONTENT_LAB_PLATFORM_FILTERS.find((filter) => filter.value === platformParam)?.value ?? creator?.platform ?? 'both';
    const country = /^[a-z]{2}$/i.test(one(params.country)) ? one(params.country).toUpperCase() : CONTENT_LAB_DEFAULT_COUNTRY;
    const data: ExplorePageData = { query, creator, platform, country, unsupported: detected?.kind === 'unsupported' };

    return (
        <PageLayout title={query ? `What's working: ${query}` : creator ? `@${creator.handle}` : "What's working"}>
            {/* A new search remounts the page state, which aborts the previous request. */}
            <PageProvider key={`${query}|${creator?.handle}`} data={data} usePageHook={useExplorePage}>
                <ExploreView />
            </PageProvider>
        </PageLayout>
    );
}
