'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { useConfiguration } from './ConfigurationContext';
import { useForm } from './FormContext';
import { GMAPS_SCRAPE_REQUEST, StreamMessage } from '@aixellabs/shared/apis';
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
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        // Process any remaining buffer
                        if (buffer.trim()) {
                            const messages = buffer.split('\n\n').filter((msg) => msg.trim());
                            for (const msg of messages) {
                                if (msg.startsWith('data: ')) {
                                    try {
                                        const message: StreamMessage = JSON.parse(msg.slice(6));
                                        if (message.type === 'complete') {
                                            setSubmissionState((prev) => ({
                                                ...prev,
                                                isSubmitting: false,
                                                isSuccess: true,
                                                result: message.data,
                                            }));
                                        }
                                    } catch (error) {
                                        console.error('Error parsing final SSE message:', error);
                                    }
                                }
                            }
                        }
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });

                    // Process complete SSE messages (separated by \n\n)
                    const messages = buffer.split('\n\n');
                    buffer = messages.pop() || ''; // Keep incomplete message in buffer

                    for (const msg of messages) {
                        if (msg.trim().startsWith('data: ')) {
                            try {
                                const message: StreamMessage = JSON.parse(msg.trim().slice(6));

                                // Update state based on message type
                                if (message.type === 'complete') {
                                    setSubmissionState((prev) => ({
                                        ...prev,
                                        isSubmitting: false,
                                        isSuccess: true,
                                        result: message.data,
                                    }));
                                } else if (message.type === 'error') {
                                    setSubmissionState((prev) => ({
                                        ...prev,
                                        isSubmitting: false,
                                        isSuccess: false,
                                        error: message.message || 'An error occurred',
                                    }));
                                }
                                // For status/progress messages, you might want to emit events or update intermediate state
                            } catch (error) {
                                console.error('Error parsing SSE message:', error);
                            }
                        }
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
