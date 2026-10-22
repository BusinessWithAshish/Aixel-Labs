import PageLayout from '@/components/common/PageLayout';
import { LegalAgreementNotice } from '@/components/common/LegalAgreementNotice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAppSession } from '@/server/auth';
import { redirect } from 'next/navigation';
import { ProfileNameForm } from './_components/ProfileNameForm';
import { ProfilePhotoForm } from './_components/ProfilePhotoForm';
import { AppearanceSettings } from './_components/AppearanceSettings';
import { CreditsBalanceCard } from './_components/CreditsBalanceCard';

export default async function AccountSettingsPage() {
    const session = await getAppSession();
    if (!session?.user) {
        redirect('/sign-in');
    }

    const initialName = session.user.name?.trim() ?? '';
    const email = session.user.email ?? '';

    return (
        <PageLayout title="Account Settings">
            <div className="flex flex-col gap-4 sm:gap-6">
                <CreditsBalanceCard />

                <ProfilePhotoForm name={initialName || email} email={email} avatar={session.user.avatar} />

                <ProfileNameForm initialName={initialName} email={email} />

                <Card>
                    <CardHeader>
                        <CardTitle>Your account settings & application preferences</CardTitle>
                        <CardDescription>Change and manage your settings for your account.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AppearanceSettings />
                    </CardContent>
                </Card>

                <LegalAgreementNotice variant="account" />
            </div>
        </PageLayout>
    );
}