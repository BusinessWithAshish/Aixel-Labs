import PageLayout from '@/components/common/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProfileNameForm } from './_components/ProfileNameForm';
import { AppearanceSettings } from './_components/AppearanceSettings';
import { CreditsBalanceCard } from './_components/CreditsBalanceCard';

export default async function AccountSettingsPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/sign-in');
    }

    const initialName = session.user.name?.trim() ?? '';
    const email = session.user.email ?? '';

    return (
        <PageLayout title="Account Settings">
            <div className="flex flex-col gap-4 sm:gap-6">
                <CreditsBalanceCard />

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
            </div>
        </PageLayout>
    );
}