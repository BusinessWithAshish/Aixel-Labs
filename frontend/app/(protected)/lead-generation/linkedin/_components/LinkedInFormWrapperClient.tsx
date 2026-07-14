'use client';

import { type ReactNode, useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { usePage } from '@/contexts/PageStore';
import { UseLinkedInFormReturn } from '../_hooks/use-linkedin-form';
import { LinkedInByCompanyForm } from './LinkedInByCompanyForm';

export const LINKEDIN_BY_COMPANY_FORM_ID = 'linkedin-by-company-form';

enum LinkedInFormMode {
    BY_PEOPLE = 'By People',
    BY_COMPANY = 'By Company',
}

type LinkedInFormWrapperClientProps = {
    children: ReactNode;
};

export const LinkedInFormWrapperClient = ({ children }: LinkedInFormWrapperClientProps) => {
    const { peopleForm, companyForm, onSubmitPeople, onSubmitCompany } = usePage<UseLinkedInFormReturn>();
    const [formMode, setFormMode] = useState<LinkedInFormMode>(LinkedInFormMode.BY_COMPANY);

    return (
        <LeadFormWrapper
            config={{
                title: 'LinkedIn search',
                description: 'Search linkedin leads by people or by company',
                icon: { src: '/linkedin-logo-svg.png', alt: 'LinkedIn' },
            }}
            creditModule={LEAD_GENERATION_SUB_MODULES.LINKEDIN}
            actions={
                formMode === LinkedInFormMode.BY_PEOPLE ? (
                    <FormProvider {...peopleForm}>
                        <FormPresetScraperActions
                            module={LEAD_GENERATION_SUB_MODULES.LINKEDIN}
                            moduleSegment="people"
                            onSubmit={onSubmitPeople}
                        />
                    </FormProvider>
                ) : (
                    <FormProvider {...companyForm}>
                        <FormPresetScraperActions
                            module={LEAD_GENERATION_SUB_MODULES.LINKEDIN}
                            moduleSegment="company"
                            onSubmit={onSubmitCompany}
                        />
                    </FormProvider>
                )
            }
        >
            <Tabs value={formMode} onValueChange={(v) => setFormMode(v as LinkedInFormMode)}>
                <TabsList className="w-full">
                    <TabsTrigger value={LinkedInFormMode.BY_COMPANY}>{LinkedInFormMode.BY_COMPANY}</TabsTrigger>
                    <TabsTrigger value={LinkedInFormMode.BY_PEOPLE}>{LinkedInFormMode.BY_PEOPLE}</TabsTrigger>
                </TabsList>

                <TabsContent className="mt-3 space-y-3 outline-none" value={LinkedInFormMode.BY_COMPANY}>
                    <FormProvider {...companyForm}>
                        <form
                            className="h-full w-full space-y-3"
                            id={LINKEDIN_BY_COMPANY_FORM_ID}
                            onSubmit={companyForm.handleSubmit(onSubmitCompany)}
                        >
                            <LinkedInByCompanyForm />
                        </form>
                    </FormProvider>
                </TabsContent>

                <TabsContent className="mt-3 space-y-3 outline-none" value={LinkedInFormMode.BY_PEOPLE}>
                    {children}
                </TabsContent>
            </Tabs>
        </LeadFormWrapper>
    );
};
