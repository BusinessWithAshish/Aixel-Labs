'use client';

import { GMAPS_SCRAPE_REQUEST } from '@aixellabs/shared/apis';
import { createContext, useContext, useState, ReactNode } from 'react';

type FormContextType = {
    formData: GMAPS_SCRAPE_REQUEST;
    updateFormData: (updates: Partial<GMAPS_SCRAPE_REQUEST>) => void;
    resetForm: () => void;
    canSubmit: boolean;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

const initialFormData: GMAPS_SCRAPE_REQUEST = {
    query: '',
    country: '',
    states: [],
};

export const FormProvider = ({ children }: { children: ReactNode }) => {
    const [formData, setFormData] = useState<GMAPS_SCRAPE_REQUEST>(initialFormData);

    const updateFormData = (updates: Partial<GMAPS_SCRAPE_REQUEST>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const resetForm = () => {
        setFormData(initialFormData);
    };

    // Simple validation logic
    const canSubmit = formData.query.trim().length > 0 && formData.country.trim().length > 0 && formData.states.length > 0;

    return (
        <FormContext.Provider
            value={{
                formData,
                updateFormData,
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
