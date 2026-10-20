'use client';

import type { VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { VoiceAgentEditor } from './VoiceAgentEditor';
import { VoiceAgentUsedOn } from './VoiceAgentUsedOn';
import { VoicePlayground } from './VoicePlayground';

/** Editor beside the numbers it is on and the playground on wide screens, stacked on narrow ones. */
export function VoiceAgentWorkspace({ geminiKey }: { geminiKey: VoiceGeminiKeyView }) {
    return (
        <div className="grid items-start gap-4 p-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            <VoiceAgentEditor />
            <div className="grid min-w-0 gap-4 lg:sticky lg:top-0">
                <VoiceAgentUsedOn />
                <VoicePlayground geminiKey={geminiKey} />
            </div>
        </div>
    );
}
