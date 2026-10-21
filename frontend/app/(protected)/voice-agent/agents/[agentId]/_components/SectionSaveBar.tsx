import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SectionSaveBarProps = {
    dirty: boolean;
    /** What stops the section from saving, in the server's words. */
    error: string | null;
    saving: boolean;
    onDiscard: () => void;
    onSave: () => Promise<boolean>;
    saveLabel: string;
    discardLabel?: string;
    errorTestId: string;
};

/** Under a part of the editor saved on its own: why it cannot save yet, Discard and Save. Only while there are changes. */
export function SectionSaveBar({
    dirty,
    error,
    saving,
    onDiscard,
    onSave,
    saveLabel,
    discardLabel = 'Discard',
    errorTestId,
}: SectionSaveBarProps) {
    if (!dirty) return null;
    return (
        <div className={cn('flex flex-wrap items-center justify-end gap-2', error && 'justify-between')}>
            {error ? (
                <p className="text-destructive text-sm" role="alert" data-testid={errorTestId}>
                    {error}
                </p>
            ) : null}
            <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onDiscard} disabled={saving}>
                    {discardLabel}
                </Button>
                <Button type="button" size="sm" onClick={() => void onSave()} disabled={!!error || saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
}
