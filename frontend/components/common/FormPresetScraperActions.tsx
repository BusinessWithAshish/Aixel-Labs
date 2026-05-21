'use client';

import { useState } from 'react';
import { type DefaultValues, type FieldValues, type SubmitHandler, useFormContext, } from 'react-hook-form';
import { toast } from 'sonner';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import useLocalStorageState from 'use-local-storage-state';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
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

function snapshotFormValues(values: FieldValues): string {
    return JSON.stringify(values, (_, value) => (value === undefined ? null : value));
}

function presetFormValuesMatch(current: FieldValues, saved: FieldValues): boolean {
    return snapshotFormValues(current) === snapshotFormValues(saved);
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
    const { isSubmitting: busy } = form.formState;

    const presetKey = formPresetLocalStorageKey(module, moduleSegment);
    const [presets, setPresets] = useLocalStorageState<Record<string, DefaultValues<TFieldValues>>>(presetKey, {
        defaultValue: {},
    });

    const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saveMode, setSaveMode] = useState<'save-and-run' | 'save-only' | null>(null);
    const [presetNameInput, setPresetNameInput] = useState('');

    const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b));

    const runForm = () => {
        void form.handleSubmit(onSubmit, () => {
            toast.error('Form validation failed. Please check your inputs.');
        })();
    };

    const openSaveDialog = (mode: 'save-and-run' | 'save-only') => {
        if (busy) return;
        if (mode === 'save-and-run' && loadedPresetName) {
            const saved = presets[loadedPresetName];
            if (!saved) {
                setLoadedPresetName(null);
                toast.error('Preset not found.');
                return;
            }
            if (!presetFormValuesMatch(form.getValues(), saved)) {
                toast.info('Form was changed after loading the preset — preset unlinked.');
                setPresets((prev) => {
                    const next = { ...prev };
                    delete next[loadedPresetName];
                    return next;
                });
                setLoadedPresetName(null);
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
        form.reset(data);
        form.clearErrors();
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

        const snapshot = form.getValues() as DefaultValues<TFieldValues>;
        setPresets((prev) => ({ ...prev, [trimmed]: snapshot }));
        toast.success(`Saved preset "${trimmed}"`);
        setDialogOpen(false);
        setSaveMode(null);
        setLoadedPresetName(trimmed);

        if (mode === 'save-and-run') {
            runForm();
        }
    };

    const handleReset = () => {
        form.reset(originalDefaults ?? undefined);
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
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={busy}
                            className="rounded-l-none border-l border-primary-foreground/20 px-2 data-[state=open]:[&_svg]:rotate-180"
                            aria-label="More preset and run options"
                        >
                            <ChevronDownIcon className="size-4 transition-transform duration-200" />
                        </Button>
                    </DropdownMenuTrigger>
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
                            disabled={busy}
                            onSelect={runForm}
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
