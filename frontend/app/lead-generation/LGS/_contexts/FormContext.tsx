'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// UI-friendly form data structure (will be converted to API format on submit)
type FormData = {
    query: string;
    selectedCountry: string;
    selectedState: string;
    selectedCities: string[];
    idsUrls: string[];
};

type FormContextType = {
    formData: FormData;
    updateFormData: (updates: Partial<FormData>) => void;
    resetForm: () => void;
    isLocationFormValid: boolean;
    isIdUrlFormValid: boolean;
    canSubmit: boolean;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

const initialFormData: FormData = {
    query: '',
    selectedCountry: '',
    selectedState: '',
    selectedCities: [],
    idsUrls: [],
};

export const FormProvider = ({ children }: { children: ReactNode }) => {
    const [formData, setFormData] = useState<FormData>(initialFormData);

    const updateFormData = (updates: Partial<FormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const resetForm = () => {
        setFormData(initialFormData);
    };

    // Simple validation logic
    const hasQuery = formData.query.trim().length > 0;
    const hasLocation = !!formData.selectedCountry && !!formData.selectedState && formData.selectedCities.length > 0;
    const hasIdsUrls = formData.idsUrls.length > 0;

    const isLocationFormValid = hasQuery && hasLocation;
    const isIdUrlFormValid = hasIdsUrls;
    const canSubmit = isLocationFormValid || isIdUrlFormValid;

    return (
        <FormContext.Provider
            value={{
                formData,
                updateFormData,
                resetForm,
                isLocationFormValid,
                isIdUrlFormValid,
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
