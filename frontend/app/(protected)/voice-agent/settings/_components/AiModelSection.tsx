import { AudioWaveform, Sparkles } from 'lucide-react';
import { SettingsSection } from '@/components/common/SettingsSection';
import { Badge } from '@/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';

/**
 * What the agents hear, think and speak with. Gemini Live is the only model today; separate
 * speech-to-text, LLM and text-to-speech providers become more items here.
 */
export function AiModelSection() {
    return (
        <SettingsSection
            titleId="ai-model-title"
            icon={Sparkles}
            title="AI model"
            description="What your agents listen, think and speak with."
        >
            <Item variant="outline" size="sm" data-testid="ai-model-gemini-live">
                <ItemMedia variant="icon">
                    <AudioWaveform />
                </ItemMedia>
                <ItemContent>
                    <ItemTitle>Gemini Live</ItemTitle>
                    <ItemDescription>
                        Google&rsquo;s voice model. Fast, natural replies on your Gemini API key.
                    </ItemDescription>
                </ItemContent>
                <ItemActions>
                    <Badge variant="green">In use</Badge>
                </ItemActions>
            </Item>
        </SettingsSection>
    );
}
