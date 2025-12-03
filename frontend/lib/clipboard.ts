import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export type CopyToClipboardOptions = {
    /**
     * Success message to display in toast notification
     * @default "Copied to clipboard!"
     */
    successMessage?: string;
    
    /**
     * Error message to display in toast notification
     * @default "Failed to copy to clipboard"
     */
    errorMessage?: string;
    
    /**
     * Whether to show toast notifications
     * @default true
     */
    showToast?: boolean;
    
    /**
     * Custom callback to execute on successful copy
     */
    onSuccess?: () => void;
    
    /**
     * Custom callback to execute on copy failure
     */
    onError?: (error: Error) => void;
};

export type CopyToClipboardResult = {
    success: boolean;
    error?: Error;
};

// ============================================================================
// Copy to Clipboard Utility
// ============================================================================

/**
 * Generic utility to copy text to clipboard with toast notifications
 * 
 * @param text - The text to copy to clipboard
 * @param options - Optional configuration for toast messages and callbacks
 * @returns Promise with success status and optional error
 * 
 * @example
 * ```typescript
 * // Basic usage
 * await copyToClipboard('+1234567890');
 * 
 * // With custom messages
 * await copyToClipboard('+1234567890', {
 *   successMessage: 'Phone number copied!',
 *   errorMessage: 'Could not copy phone number'
 * });
 * 
 * // With callbacks
 * await copyToClipboard(email, {
 *   onSuccess: () => console.log('Copied!'),
 *   onError: (error) => console.error(error)
 * });
 * 
 * // Without toast notifications
 * await copyToClipboard(text, { showToast: false });
 * ```
 */
export const copyToClipboard = async (
    text: string,
    options: CopyToClipboardOptions = {}
): Promise<CopyToClipboardResult> => {
    const {
        successMessage = 'Copied to clipboard!',
        errorMessage = 'Failed to copy to clipboard',
        showToast = true,
        onSuccess,
        onError,
    } = options;

    try {
        // Check if clipboard API is available
        if (!navigator.clipboard) {
            throw new Error('Clipboard API not available');
        }

        // Copy text to clipboard
        await navigator.clipboard.writeText(text);

        // Show success toast if enabled
        if (showToast) {
            toast.success(successMessage);
        }

        // Execute success callback if provided
        if (onSuccess) {
            onSuccess();
        }

        return { success: true };
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error occurred');

        // Show error toast if enabled
        if (showToast) {
            toast.error(errorMessage);
        }

        // Execute error callback if provided
        if (onError) {
            onError(err);
        }

        return { success: false, error: err };
    }
};

// ============================================================================
// Specialized Copy Functions
// ============================================================================

/**
 * Copy phone number to clipboard with appropriate messaging
 * 
 * @param phoneNumber - The phone number to copy
 * @param options - Optional configuration
 * @returns Promise with success status and optional error
 */
export const copyPhoneNumber = async (
    phoneNumber: string,
    options: Omit<CopyToClipboardOptions, 'successMessage' | 'errorMessage'> & {
        successMessage?: string;
        errorMessage?: string;
    } = {}
): Promise<CopyToClipboardResult> => {
    return copyToClipboard(phoneNumber, {
        successMessage: 'Phone number copied!',
        errorMessage: 'Failed to copy phone number',
        ...options,
    });
};

/**
 * Copy email to clipboard with appropriate messaging
 * 
 * @param email - The email to copy
 * @param options - Optional configuration
 * @returns Promise with success status and optional error
 */
export const copyEmail = async (
    email: string,
    options: Omit<CopyToClipboardOptions, 'successMessage' | 'errorMessage'> & {
        successMessage?: string;
        errorMessage?: string;
    } = {}
): Promise<CopyToClipboardResult> => {
    return copyToClipboard(email, {
        successMessage: 'Email copied!',
        errorMessage: 'Failed to copy email',
        ...options,
    });
};

/**
 * Copy URL to clipboard with appropriate messaging
 * 
 * @param url - The URL to copy
 * @param options - Optional configuration
 * @returns Promise with success status and optional error
 */
export const copyUrl = async (
    url: string,
    options: Omit<CopyToClipboardOptions, 'successMessage' | 'errorMessage'> & {
        successMessage?: string;
        errorMessage?: string;
    } = {}
): Promise<CopyToClipboardResult> => {
    return copyToClipboard(url, {
        successMessage: 'URL copied!',
        errorMessage: 'Failed to copy URL',
        ...options,
    });
};
