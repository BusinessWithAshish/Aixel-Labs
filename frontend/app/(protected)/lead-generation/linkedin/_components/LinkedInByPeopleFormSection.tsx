'use client';

import { FormProvider } from 'react-hook-form';
import { usePage } from '@/contexts/PageStore';
import { UseLinkedInFormReturn } from '../_hooks/use-linkedin-form';
import { LinkedInByPeopleForm } from './LinkedInByPeopleForm';

export const LINKEDIN_BY_PEOPLE_FORM_ID = 'linkedin-by-people-form';

export const LinkedInByPeopleFormSection = () => {
    const { peopleForm, onSubmitPeople } = usePage<UseLinkedInFormReturn>();

    return (
        <FormProvider {...peopleForm}>
            <form
                className="h-full w-full space-y-3"
                id={LINKEDIN_BY_PEOPLE_FORM_ID}
                onSubmit={peopleForm.handleSubmit(onSubmitPeople)}
            >
                <LinkedInByPeopleForm />
            </form>
        </FormProvider>
    );
};
