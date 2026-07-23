'use client';

import { FormProvider } from 'react-hook-form';
import { Tabs, TabsTrigger, TabsList, TabsContent } from '@/components/ui/tabs';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { UseFacebookFormReturn } from '../_hooks/use-facebook-form';
import { FacebookQueryForm } from './FacebookQueryForm';
import { FacebookPagesForm } from './FacebookPagesForm';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';
import { FACEBOOK_FORM_NAME } from '../_constants';

enum FacebookFormInputMode {
    QUERY = 'Query',
    PAGES = 'Pages',
}

export const FacebookFormWrapper = () => {
    const { form, onSubmit } = usePage<UseFacebookFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Facebook Pages Form',
                    description: 'Enter search parameters to find leads from Facebook business Pages',
                    icon: { src: '/facebook-logo.svg', alt: 'Facebook' },
                }}
                creditModule={LEAD_GENERATION_SUB_MODULES.FACEBOOK}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.FACEBOOK}
                        onSubmit={onSubmit}
                    />
                }
            >
                <Tabs defaultValue={FacebookFormInputMode.QUERY}>
                    <TabsList className="w-full">
                        <TabsTrigger value={FacebookFormInputMode.QUERY}>
                            {FacebookFormInputMode.QUERY}
                        </TabsTrigger>
                        <TabsTrigger value={FacebookFormInputMode.PAGES}>
                            {FacebookFormInputMode.PAGES}
                        </TabsTrigger>
                    </TabsList>
                    <form
                        className="h-full w-full"
                        id={FACEBOOK_FORM_NAME}
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <TabsContent className="space-y-3" value={FacebookFormInputMode.QUERY}>
                            <FacebookQueryForm />
                        </TabsContent>
                        <TabsContent className="space-y-3" value={FacebookFormInputMode.PAGES}>
                            <FacebookPagesForm />
                        </TabsContent>
                    </form>
                </Tabs>
            </LeadFormWrapper>
        </FormProvider>
    );
};
