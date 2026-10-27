import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getContentLabProfile } from '@/app/actions/content-lab-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { useContentLabSettingsPage } from './_hooks/use-content-lab-settings-page';
import { ContentLabSettings } from './_components/ContentLabSettings';

/** Own accounts, default country and language, and the Gemini key drafts run on. */
async function ContentLabSettingsPage() {
    const [profileResponse, keyResponse] = await Promise.all([getContentLabProfile(), getGeminiKeyStatus()]);
    if (!profileResponse.data) notFound();

    return (
        <PageLayout title="Content Lab settings" className="p-1">
            <PageProvider
                data={{ profile: profileResponse.data, geminiKey: keyResponse.data ?? NO_GEMINI_KEY }}
                usePageHook={useContentLabSettingsPage}
            >
                <ContentLabSettings />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabSettingsPage);
