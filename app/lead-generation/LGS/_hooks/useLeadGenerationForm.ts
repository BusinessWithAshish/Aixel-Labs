"use client";

import { useState, useMemo } from "react";

interface FormState {
  query: string;
  selectedCountry: string;
  selectedState: string;
  selectedCities: string[];
  idsUrls: string[];
}

interface UseLeadGenerationFormReturn {
  formState: FormState;
  updateFormState: (updates: Partial<FormState>) => void;
  resetForm: () => void;
  isFormValid: boolean;
  buildQueries: string[];
  isSubmitDisabled: boolean;
}

const initialFormState: FormState = {
  query: "",
  selectedCountry: "",
  selectedState: "",
  selectedCities: [],
  idsUrls: [],
};

export const useLeadGenerationForm = (): UseLeadGenerationFormReturn => {
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const updateFormState = (updates: Partial<FormState>) => {
    setFormState(prev => ({ ...prev, ...updates }));
  };

  const resetForm = () => {
    setFormState(initialFormState);
  };

  const buildQueries = useMemo(
    () => formState.selectedCities.map((city) => 
      `${formState.query} in ${city}, ${formState.selectedState}, ${formState.selectedCountry}`
    ),
    [formState.query, formState.selectedCities, formState.selectedState, formState.selectedCountry]
  );

  const isFormValid = useMemo(() => {
    const hasQuery = formState.query.trim().length > 0;
    const hasLocation = formState.selectedCountry && formState.selectedState && formState.selectedCities.length > 0;
    const hasIdsUrls = formState.idsUrls.length > 0;
    
    return (hasQuery && hasLocation) || hasIdsUrls;
  }, [formState]);

  const isSubmitDisabled = useMemo(() => {
    return !isFormValid;
  }, [isFormValid]);

  return {
    formState,
    updateFormState,
    resetForm,
    isFormValid,
    buildQueries,
    isSubmitDisabled,
  };
};
