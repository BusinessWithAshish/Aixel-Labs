'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { useConfiguration } from './ConfigurationContext';
import { useForm } from './FormContext';
import { 
    GMAPS_SCRAPE_REQUEST,
    SSEParser,
    isCompleteMessage, 
    isErrorMessage 
} from '@aixellabs/shared/apis';
import { API_ENDPOINTS } from '@aixellabs/shared/utils';

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
        setSubmissionState((prev) => ({
            ...prev,
            isSubmitting: true,
            error: null,
        }));

        try {
            // Determine backend URL
            let backendUrl: string;

            if (config.useAWS) {
                backendUrl = 'http://aws-instance:8100'; // Placeholder for AWS
            } else {
                backendUrl = config.backendUrl;
            }

            // Transform form data to API format
            const requestData: GMAPS_SCRAPE_REQUEST = {
                query: formData.query,
                country: formData.country,
                states: formData.states.map((state) => ({
                    name: state.name,
                    cities: state.cities,
                })),
            };

            // Make API request with SSE
            const response = await fetch(`${backendUrl}${API_ENDPOINTS.GMAPS_SCRAPE}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
                credentials: 'include', // Include credentials for CORS
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle Server-Sent Events (SSE)
            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const parser = new SSEParser();

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        // Process any remaining buffer
                        const finalMessages = parser.flush();
                        for (const message of finalMessages) {
                            if (isCompleteMessage(message)) {
                                setSubmissionState((prev) => ({
                                    ...prev,
                                    isSubmitting: false,
                                    isSuccess: true,
                                    result: message.data,
                                }));
                            }
                        }
                        break;
                    }

                    // Decode chunk and parse messages
                    const chunk = decoder.decode(value, { stream: true });
                    const messages = parser.parseChunk(chunk);

                    // Process each message
                    for (const message of messages) {
                        console.log(`[${message.type}] ${message.message}`, message.data);

                        if (isCompleteMessage(message)) {
                            setSubmissionState((prev) => ({
                                ...prev,
                                isSubmitting: false,
                                isSuccess: true,
                                result: message.data,
                            }));
                        } else if (isErrorMessage(message)) {
                            setSubmissionState((prev) => ({
                                ...prev,
                                isSubmitting: false,
                                isSuccess: false,
                                error: message.message || 'An error occurred',
                            }));
                        }
                        // For status/progress messages, you can add custom handling here
                        // e.g., emit events, update progress state, etc.
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            setSubmissionState((prev) => ({
                ...prev,
                isSubmitting: false,
                isSuccess: false,
                error: error instanceof Error ? error.message : 'An error occurred',
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
        throw new Error('useSubmission must be used within SubmissionProvider');
    }
    return context;
};
