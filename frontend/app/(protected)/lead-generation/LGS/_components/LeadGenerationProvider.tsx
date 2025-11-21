"use client";

import { ReactNode } from "react";
import { ConfigurationProvider } from "../_contexts/ConfigurationContext";
import { FormProvider } from "../_contexts/FormContext";
import { SubmissionProvider } from "../_contexts/SubmissionContext";

type LeadGenerationProviderProps = {
  children: ReactNode;
};

export const LeadGenerationProvider = ({ children }: LeadGenerationProviderProps) => {
  return (
    <ConfigurationProvider>
      <FormProvider>
        <SubmissionProvider>
          {children}
        </SubmissionProvider>
      </FormProvider>
    </ConfigurationProvider>
  );
};
