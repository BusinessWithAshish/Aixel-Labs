import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardAction } from '@/components/ui/card';

type CardSaveActionsProps = {
    dirty: boolean;
    /** What stops the card from saving, in the server's words. */
    error: string | null;
    saving: boolean;
    onDiscard: () => void;
    onSave: () => Promise<boolean>;
    saveLabel: string;
    discardLabel?: string;
    errorTestId: string;
};

/** Top right of a card saved on its own: Discard (while there are changes), Save, and why it cannot save yet. */
export function CardSaveActions({
    dirty,
    error,
    saving,
    onDiscard,
    onSave,
    saveLabel,
    discardLabel = 'Discard',
    errorTestId,
}: CardSaveActionsProps) {
    return (
        <CardAction className="grid max-w-64 justify-items-end gap-1.5">
            <div className="flex flex-wrap justify-end gap-2">
                {dirty ? (
                    <Button type="button" variant="outline" size="sm" onClick={onDiscard} disabled={saving}>
                        {discardLabel}
                    </Button>
                ) : null}
                <Button type="button" size="sm" onClick={() => void onSave()} disabled={!dirty || !!error || saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {saveLabel}
                </Button>
            </div>
            {dirty && error ? (
                <p className="text-destructive text-right text-xs font-normal" role="alert" data-testid={errorTestId}>
                    {error}
                </p>
            ) : null}
        </CardAction>
    );
}
