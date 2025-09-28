"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useConfiguration } from "./ConfigurationContext";
import { useForm } from "./FormContext";

type SubmissionState = {
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
  result: unknown;
};

type SubmissionContextType = {
  submissionState: SubmissionState;
  submitForm: () => Promise<void>;
  resetSubmission: () => void;
};

const SubmissionContext = createContext<SubmissionContextType | undefined>(undefined);

const initialSubmissionState: SubmissionState = {
  isSubmitting: false,
  isSuccess: false,
  error: null,
  result: null,
};

export const SubmissionProvider = ({ children }: { children: ReactNode }) => {
  const [submissionState, setSubmissionState] = useState<SubmissionState>(initialSubmissionState);
  const { config } = useConfiguration();
  const { formData } = useForm();

  const submitForm = async () => {
    setSubmissionState(prev => ({
      ...prev,
      isSubmitting: true,
      error: null,
    }));

    try {
      // Determine backend URL
      let backendUrl: string;
      
      if (config.useAWS) {
        backendUrl = "http://aws-instance:8100"; // Placeholder for AWS
      } else {
        backendUrl = config.backendUrl;
      }

      // Prepare request data
      const requestData = {
        query: formData.query,
        selectedCountry: formData.selectedCountry,
        selectedState: formData.selectedState,
        selectedCities: formData.selectedCities,
        idsUrls: formData.idsUrls,
      };

      // Make API request
      const response = await fetch(`${backendUrl}/gmaps/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      setSubmissionState(prev => ({
        ...prev,
        isSubmitting: false,
        isSuccess: true,
        result,
      }));

    } catch (error) {
      setSubmissionState(prev => ({
        ...prev,
        isSubmitting: false,
        isSuccess: false,
        error: error instanceof Error ? error.message : "An error occurred",
      }));
    }
  };

  const resetSubmission = () => {
    setSubmissionState(initialSubmissionState);
  };

  return (
    <SubmissionContext.Provider
      value={{
        submissionState,
        submitForm,
        resetSubmission,
      }}
    >
      {children}
    </SubmissionContext.Provider>
  );
};

export const useSubmission = () => {
  const context = useContext(SubmissionContext);
  if (!context) {
    throw new Error("useSubmission must be used within SubmissionProvider");
  }
  return context;
};
