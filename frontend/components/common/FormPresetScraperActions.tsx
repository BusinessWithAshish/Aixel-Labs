'use client';

import { useEffect, useRef, useState } from 'react';
import { type DefaultValues, type FieldValues, type SubmitHandler, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import useLocalStorageState from 'use-local-storage-state';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
import { prepareLeadGenListName, useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    BookmarkIcon,
    BookmarkPlusIcon,
    ChevronDownIcon,
    InboxIcon,
    Loader2Icon,
    PlayIcon,
    RotateCcwIcon,
    XIcon,
} from 'lucide-react';

const PRESET_NAME_MAX_LENGTH = 50;
const LOADED_PRESET_LABEL_MAX = 28;

function elideLabel(name: string, maxLen: number): string {
    if (name.length <= maxLen) return name;
    return `${name.slice(0, maxLen - 1)}…`;
}

export function formPresetLocalStorageKey(module: LEAD_GENERATION_SUB_MODULES, moduleSegment?: string): string {
    return moduleSegment
        ? generateLocalStorageKey('lead-gen-form-preset', String(module), moduleSegment)
        : generateLocalStorageKey('lead-gen-form-preset', String(module));
}

/**
 * Stable compare for preset matching. localStorage JSON drops `undefined`, and
 * RHF/controlled fields often coerce empty optionals to `null` / `""` after
 * reset — treat those as equivalent and ignore key order.
 */
function normalizePresetValue(value: unknown): unknown {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number' && Number.isNaN(value)) return null;
    if (Array.isArray(value)) return value.map(normalizePresetValue);
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(obj).sort()) {
            const normalized = normalizePresetValue(obj[key]);
            if (normalized === null) continue;
            if (
                typeof normalized === 'object' &&
                !Array.isArray(normalized) &&
                Object.keys(normalized as Record<string, unknown>).length === 0
            ) {
                continue;
            }
            out[key] = normalized;
        }
        return out;
    }
    return value;
}

function snapshotFormValues(values: FieldValues): string {
    return JSON.stringify(normalizePresetValue(values));
}

export type FormPresetScraperActionsProps<TFieldValues extends FieldValues = FieldValues> = {
    module: LEAD_GENERATION_SUB_MODULES;
    moduleSegment?: string;
    onSubmit: SubmitHandler<TFieldValues>;
};

export function FormPresetScraperActions<TFieldValues extends FieldValues = FieldValues>({
    module,
    moduleSegment,
    onSubmit,
}: FormPresetScraperActionsProps<TFieldValues>) {
    const form = useFormContext<TFieldValues>();
    const [originalDefaults] = useState(
        () => form.formState.defaultValues as DefaultValues<TFieldValues> | undefined,
    );
    const { isSubmitting } = form.formState;
    const { loading: scraperLoading, abortRequest, clearPendingAbort } = useLeadGenScraper(module);
    const busy = isSubmitting || scraperLoading;

    const presetKey = formPresetLocalStorageKey(module, moduleSegment);
    const [presets, setPresets] = useLocalStorageState<Record<string, DefaultValues<TFieldValues>>>(presetKey, {
        defaultValue: {},
    });

    const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
    /** Settled form snapshot after load/save — used for dirty checks (not localStorage). */
    const loadedPresetSnapshotRef = useRef<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saveMode, setSaveMode] = useState<'save-and-run' | 'save-only' | null>(null);
    const [presetNameInput, setPresetNameInput] = useState('');

    const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b));

    // After reset, controlled fields may coerce values on the next paint(s).
    // Capture that settled shape as the dirty baseline (not the localStorage blob).
    useEffect(() => {
        if (!loadedPresetName) {
            loadedPresetSnapshotRef.current = null;
            return;
        }
        let cancelled = false;
        const capture = () => {
            if (!cancelled) {
                loadedPresetSnapshotRef.current = snapshotFormValues(form.getValues());
            }
        };
        capture();
        const raf1 = requestAnimationFrame(() => {
            capture();
            requestAnimationFrame(capture);
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf1);
        };
    }, [loadedPresetName, form]);

    const runForm = (presetName: string | null = loadedPresetName) => {
        if (!presetName) {
            toast.error('Save a preset before running.');
            return;
        }
        prepareLeadGenListName(module, presetName);
        clearPendingAbort();
        void form.handleSubmit(onSubmit, () => {
            prepareLeadGenListName(module, '');
            clearPendingAbort();
            toast.error('Form validation failed. Please check your inputs.');
        })();
    };

    const unlinkLoadedPreset = (message?: string) => {
        loadedPresetSnapshotRef.current = null;
        setLoadedPresetName(null);
        if (message) toast.info(message);
    };

    const isLoadedPresetDirty = (saved: FieldValues): boolean => {
        const current = snapshotFormValues(form.getValues());
        const baseline = loadedPresetSnapshotRef.current ?? snapshotFormValues(saved);
        return current !== baseline;
    };

    const openSaveDialog = (mode: 'save-and-run' | 'save-only') => {
        if (busy) return;
        if (mode === 'save-and-run' && loadedPresetName) {
            const saved = presets[loadedPresetName];
            if (!saved) {
                unlinkLoadedPreset();
                toast.error('Preset not found.');
                return;
            }
            if (isLoadedPresetDirty(saved as FieldValues)) {
                // Unlink only — never delete the stored preset on a mismatch.
                unlinkLoadedPreset(
                    'Form was changed after loading the preset — preset unlinked.',
                );
                return;
            }
            runForm();
            return;
        }
        setSaveMode(mode);
        setPresetNameInput('');
        setDialogOpen(true);
    };

    const loadPreset = (name: string) => {
        if (busy) return;
        const data = presets[name];
        if (!data) {
            toast.error('Preset not found.');
            return;
        }
        // Keep defaults so missing optional keys from JSON round-trip stay registered.
        form.reset({
            ...(originalDefaults as TFieldValues),
            ...(data as TFieldValues),
        });
        form.clearErrors();
        loadedPresetSnapshotRef.current = snapshotFormValues(form.getValues());
        setLoadedPresetName(name);
        toast(`Loaded preset "${name}"`);
    };

    const handleSaveConfirm = async () => {
        const mode = saveMode;
        if (!mode) return;
        const trimmed = presetNameInput.trim();
        if (!trimmed) {
            toast.error('Enter a preset name.');
            return;
        }
        if (trimmed.length > PRESET_NAME_MAX_LENGTH) {
            toast.error(`Preset name must be at most ${PRESET_NAME_MAX_LENGTH} characters.`);
            return;
        }
        if (presets[trimmed]) {
            toast.error('A preset with that name already exists. Try a new name.');
            return;
        }

        if (mode === 'save-and-run') {
            const valid = await form.trigger();
            if (!valid) {
                toast.error('Please fill in all required fields.');
                return;
            }
        }

        // Persist the settled form values (same shape used for match checks).
        const snapshot = form.getValues() as DefaultValues<TFieldValues>;
        setPresets((prev) => ({ ...prev, [trimmed]: snapshot }));
        loadedPresetSnapshotRef.current = snapshotFormValues(snapshot as FieldValues);
        toast.success(`Saved preset "${trimmed}"`);
        setDialogOpen(false);
        setSaveMode(null);
        setLoadedPresetName(trimmed);

        if (mode === 'save-and-run') {
            runForm(trimmed);
        }
    };

    const handleReset = () => {
        form.reset(originalDefaults ?? undefined);
        loadedPresetSnapshotRef.current = null;
        setLoadedPresetName(null);
        toast.success('Form reset to defaults.');
    };

    const primaryLabel = loadedPresetName
        ? `Run "${elideLabel(loadedPresetName, LOADED_PRESET_LABEL_MAX)}"`
        : 'Save and Run';

    return (
        <>
            <Button type="button" variant="outline" size="sm" onClick={handleReset} title="Reset form to defaults">
                <RotateCcwIcon className="size-4" />
            </Button>

            <DropdownMenu>
                <div
                    role="group"
                    aria-label="Save preset and run"
                    className="flex items-center gap-0 flex-nowrap rounded-md shadow-xs"
                >
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="rounded-r-none"
                        onClick={() => openSaveDialog('save-and-run')}
                        disabled={busy}
                        title={
                            loadedPresetName
                                ? `Submit using loaded preset "${loadedPresetName}"`
                                : 'Save a new preset and run'
                        }
                    >
                        {busy ? (
                            <>
                                <Loader2Icon className="size-4 animate-spin" />
                                <span className="sr-only">Loading</span>
                            </>
                        ) : (
                            <span className="max-w-56 truncate">{primaryLabel}</span>
                        )}
                    </Button>
                    {busy ? (
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="rounded-l-none border-l border-primary-foreground/20 px-2"
                            onClick={abortRequest}
                            aria-label="Abort request"
                            title="Abort request"
                        >
                            <XIcon className="size-4" />
                        </Button>
                    ) : (
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="rounded-l-none border-l border-primary-foreground/20 px-2 data-[state=open]:[&_svg]:rotate-180"
                                aria-label="More preset and run options"
                            >
                                <ChevronDownIcon className="size-4 transition-transform duration-200" />
                            </Button>
                        </DropdownMenuTrigger>
                    )}
                </div>

                <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            className="text-primary"
                            disabled={busy}
                            onSelect={() => openSaveDialog('save-only')}
                        >
                            <BookmarkPlusIcon />
                            Save only
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-destructive/50"
                            disabled={busy || !loadedPresetName}
                            onSelect={() => runForm()}
                        >
                            <PlayIcon />
                            Run without saving
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={busy}>
                                Saved presets
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent>
                                    {presetNames.length === 0 ? (
                                        <DropdownMenuItem disabled>
                                            <InboxIcon />
                                            No saved presets
                                        </DropdownMenuItem>
                                    ) : (
                                        presetNames.map((name) => (
                                            <DropdownMenuItem key={name} disabled={busy} onSelect={() => loadPreset(name)}>
                                                <BookmarkIcon />
                                                {name}
                                            </DropdownMenuItem>
                                        ))
                                    )}
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setSaveMode(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{saveMode === 'save-and-run' ? 'Save and run' : 'Save preset'}</DialogTitle>
                        <DialogDescription>Give this preset a name. It is stored in this browser only.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="preset-name">Name</Label>
                        <Input
                            id="preset-name"
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSaveConfirm();
                                }
                            }}
                            placeholder="Preset name"
                            autoComplete="off"
                            maxLength={PRESET_NAME_MAX_LENGTH}
                        />
                        <p className="text-muted-foreground text-xs">
                            {presetNameInput.length}/{PRESET_NAME_MAX_LENGTH} characters
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void handleSaveConfirm()}>
                            {saveMode === 'save-and-run' ? 'Save and run' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
