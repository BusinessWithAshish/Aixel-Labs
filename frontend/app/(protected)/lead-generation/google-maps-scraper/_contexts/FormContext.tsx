'use client';

import { GMAPS_SCRAPE_REQUEST } from '@aixellabs/shared/common/apis';
import { createContext, useContext, useState, ReactNode } from 'react';

type FormMode = 'location' | 'direct-url';

type FormContextType = {
    formData: GMAPS_SCRAPE_REQUEST;
    directUrls: string[];
    formMode: FormMode;
    updateFormData: (updates: Partial<GMAPS_SCRAPE_REQUEST>) => void;
    setDirectUrls: (urls: string[]) => void;
    setFormMode: (mode: FormMode) => void;
    resetForm: () => void;
    canSubmit: boolean;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

const initialFormData: GMAPS_SCRAPE_REQUEST = {
    query: '',
    country: '',
    states: [{
        name: '',
        cities: [],
    }],
};

export const FormProvider = ({ children }: { children: ReactNode }) => {
    const [formData, setFormData] = useState<GMAPS_SCRAPE_REQUEST>(initialFormData);
    const [directUrls, setDirectUrls] = useState<string[]>([]);
    const [formMode, setFormMode] = useState<FormMode>('location');

    const updateFormData = (updates: Partial<GMAPS_SCRAPE_REQUEST>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const resetForm = () => {
        setFormData(initialFormData);
        setDirectUrls([]);
    };

    const canSubmit = formMode === 'location'
        ? formData.query.trim().length > 0 && formData.country.trim().length > 0 && formData.states.length > 0
        : directUrls.length > 0;

    return (
        <FormContext.Provider
            value={{
                formData,
                directUrls,
                formMode,
                updateFormData,
                setDirectUrls,
                setFormMode,
                resetForm,
                canSubmit,
            }}
        >
            {children}
        </FormContext.Provider>
    );
};

export const useForm = () => {
    const context = useContext(FormContext);
    if (!context) {
        throw new Error('useForm must be used within FormProvider');
    }
    return context;
};
