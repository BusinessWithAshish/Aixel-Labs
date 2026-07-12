import { z } from 'zod';

export const loginFormSchema = z.object({
    phoneNumber: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/, 'Enter a full number in E.164 format, e.g. +919876543210.'),
    otpCode: z.string().trim().length(6, 'Enter the 6-digit code from SMS.'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
