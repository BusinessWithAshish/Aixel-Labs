"use client";

import { ReactNode } from "react";
import { FormProvider } from "../_contexts/FormContext";
import { SubmissionProvider } from "../_contexts/SubmissionContext";

type LeadGenerationProviderProps = {
  children: ReactNode;
};

export const LeadGenerationProvider = ({ children }: LeadGenerationProviderProps) => {
  return (
    <FormProvider>
      <SubmissionProvider>
        {children}
      </SubmissionProvider>
    </FormProvider>
  );
};
