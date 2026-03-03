import { googleMapsPrompt, googleMapsSchema } from './google-maps';
import { instagramPrompt, instagramSchema } from './instagram';

export type TaskConfig = {
    prompt: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: any;
};

const TASK_REGISTRY: Record<string, TaskConfig> = {
    'google-maps': { prompt: googleMapsPrompt, schema: googleMapsSchema },
    instagram: { prompt: instagramPrompt, schema: instagramSchema },
};

export function getTaskConfig(taskType: string): TaskConfig | null {
    return TASK_REGISTRY[taskType] ?? null;
}

export type TaskType = keyof typeof TASK_REGISTRY;
