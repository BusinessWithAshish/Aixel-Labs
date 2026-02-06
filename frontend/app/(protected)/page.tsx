import PageLayout from '@/components/common/PageLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCurrentTenantFromHeaders } from '@/helpers/validate-tenant';
import { modulesIconMap } from '@/config/sidebar.config';
import { Modules } from '@aixellabs/shared/mongodb';
import { ModuleUrls } from '@/config/app-config';
import Link from 'next/link';

export default async function Home() {
    const currentTenant = await getCurrentTenantFromHeaders();
    
    const modules = [
        {
            title: Modules.LEAD_GENERATION,
            description: 'Generate and manage leads from multiple sources',
            url: ModuleUrls.LEAD_GENERATION,
            icon: modulesIconMap[Modules.LEAD_GENERATION],
        },
        {
            title: Modules.VOICE_AGENT,
            description: 'Automated voice interactions and dialer',
            url: ModuleUrls.VOICE_AGENT,
            icon: modulesIconMap[Modules.VOICE_AGENT],
        },
        {
            title: Modules.MESSAGING,
            description: 'WhatsApp and SMS messaging platform',
            url: ModuleUrls.MESSAGING,
            icon: modulesIconMap[Modules.MESSAGING],
        },
        {
            title: Modules.EMAIL,
            description: 'Email outreach and campaign management',
            url: ModuleUrls.EMAIL,
            icon: modulesIconMap[Modules.EMAIL],
        },
    ];

    return (
        <PageLayout className="p-6 space-y-6" title="Home">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Welcome to {currentTenant}</CardTitle>
                    <CardDescription>
                        Your all-in-one platform for lead generation, voice agents, messaging, and email campaigns
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {modules.map((module) => {
                    const Icon = module.icon;
                    return (
                        <Card key={module.title} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Icon className="h-6 w-6 text-primary" />
                                    </div>
                                    <CardTitle className="text-lg">{module.title}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <CardDescription>{module.description}</CardDescription>
                                <Link href={module.url}>
                                    <Button variant="outline" className="w-full">
                                        Open Module
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </PageLayout>
    );
}
