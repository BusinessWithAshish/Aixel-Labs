'use client';

import { FormProvider } from 'react-hook-form';
import { Tabs, TabsTrigger, TabsList, TabsContent } from '@/components/ui/tabs';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { UseInstagramFormReturn } from '../_hooks/use-instagram-form';
import { InstagramQueryForm } from './InstagramQueryForm';
import { InstagramUsernamesForm } from './InstagramUsernamesForm';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';

enum InstagramFormInputMode {
    QUERY = 'Query',
    USERNAMES = 'Usernames',
}

export const INSTAGRAM_SEARCH_FORM_NAME = 'instagram-search-form';

export const InstagramSearchFormWrapper = () => {
    const { form, onSubmit } = usePage<UseInstagramFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Instagram Search Form',
                    description: 'Enter search parameters to find leads on Instagram',
                    icon: { src: '/instagram-logo.svg', alt: 'Instagram' },
                }}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH}
                        onSubmit={onSubmit}
                    />
                }
            >
                <Tabs defaultValue={InstagramFormInputMode.QUERY}>
                    <TabsList className="w-full">
                        <TabsTrigger value={InstagramFormInputMode.QUERY}>
                            {InstagramFormInputMode.QUERY}
                        </TabsTrigger>
                        <TabsTrigger value={InstagramFormInputMode.USERNAMES}>
                            {InstagramFormInputMode.USERNAMES}
                        </TabsTrigger>
                    </TabsList>
                    <form
                        className="h-full w-full"
                        id={INSTAGRAM_SEARCH_FORM_NAME}
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <TabsContent className="space-y-3" value={InstagramFormInputMode.QUERY}>
                            <InstagramQueryForm />
                        </TabsContent>
                        <TabsContent className="space-y-3" value={InstagramFormInputMode.USERNAMES}>
                            <InstagramUsernamesForm />
                        </TabsContent>
                    </form>
                </Tabs>
            </LeadFormWrapper>
        </FormProvider>
    );
};