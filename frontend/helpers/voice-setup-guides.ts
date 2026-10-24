/** Step-by-step setup guides shown as a carousel (`SetupGuideDialog`): phone providers, Linphone. */

export type SetupGuideImage = {
    /** Under `public/`, e.g. `/voice-agent/guides/telnyx/2-api-key.webp`. */
    src: string;
    alt: string;
    width: number;
    height: number;
};

export type SetupGuideStep = {
    /** Stable id, so a link elsewhere can open the guide at this step. */
    id: string;
    title: string;
    /** One or two short paragraphs. */
    body: string[];
    /** A screenshot or an illustration of the step. Optional: a step without one shows its text only. */
    image?: SetupGuideImage;
    /** A page in the provider's own portal, opened in a new tab. */
    link?: { href: string; label: string };
    /** Values to type or paste in this step, each with a copy button (a username, a SIP address). */
    values?: { label: string; value: string }[];
};

export type SetupGuide = {
    title: string;
    steps: SetupGuideStep[];
};

/** Every guide image is 1400x875, under `public/voice-agent/guides/<folder>/`. */
export function guideImage(folder: string, file: string, alt: string): SetupGuideImage {
    return { src: `/voice-agent/guides/${folder}/${file}`, alt, width: 1400, height: 875 };
}

/** Index of a step by id; the first step when the id is missing or unknown. */
export function setupGuideStepIndex(guide: SetupGuide, stepId?: string | null): number {
    if (!stepId) return 0;
    return Math.max(
        0,
        guide.steps.findIndex((step) => step.id === stepId),
    );
}
