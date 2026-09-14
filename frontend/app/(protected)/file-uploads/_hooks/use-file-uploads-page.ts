'use client';

export type UseFileUploadsPageReturn = Record<string, never>;

/**
 * File Uploads has no shared page-level state — `FileDropZone` owns its own
 * queue. This hook exists only to satisfy the standard `PageProvider` shell.
 */
export const useFileUploadsPage = (): UseFileUploadsPageReturn => ({});
