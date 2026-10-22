'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Pencil, Plus, Trash2, Webhook } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, type VoiceAgentWebhookToolView } from '@aixellabs/backend/db/types';
import { deleteVoiceAgentWebhookTool, setVoiceAgentWebhookToolEnabled } from '@/app/actions/voice-agent-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { SettingsSection } from '@/components/common/SettingsSection';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { ToolSummary } from './ToolSummary';
import { WebhookToolDialog } from './WebhookToolDialog';

/** Webhook tools the owner defines: list, on/off, add / edit dialog, delete. Each change saves at once. */
export function CustomToolsSection() {
    const { agentId, saved, applySavedAgent, promptTools } = usePage<UseVoiceAgentEditorPageReturn>();
    const tools = saved.tools.webhooks;
    // The prompt's copy of each tool (name, line, URL host), made from the same list in the same order.
    const summaries = promptTools.filter((t) => t.kind === 'custom');
    const [dialogOpen, setDialogOpen] = useState(false);
    // The tool being edited (null = adding one). Kept while the dialog animates closed.
    const [dialogTool, setDialogTool] = useState<VoiceAgentWebhookToolView | null>(null);
    const [toDelete, setToDelete] = useState<VoiceAgentWebhookToolView | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [toggling, setToggling] = useState<string | null>(null);
    const atLimit = tools.length >= VOICE_WEBHOOK_LIMITS.maxTools;

    const openDialog = (tool: VoiceAgentWebhookToolView | null) => {
        setDialogTool(tool);
        setDialogOpen(true);
    };

    const toggle = async (tool: VoiceAgentWebhookToolView, enabled: boolean) => {
        setToggling(tool.id);
        const response = await setVoiceAgentWebhookToolEnabled(agentId, tool.id, enabled);
        setToggling(null);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not change the tool');
            return;
        }
        applySavedAgent(response.data);
        toast.success(enabled ? `${tool.name} is on` : `${tool.name} is off`);
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        const response = await deleteVoiceAgentWebhookTool(agentId, toDelete.id);
        setDeleting(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not delete the tool');
            return;
        }
        applySavedAgent(response.data);
        toast.success(`${toDelete.name} deleted`);
        setToDelete(null);
    };

    return (
        <SettingsSection
            titleId="custom-tools-title"
            icon={Webhook}
            title="Custom tools"
            description="Your own systems the agent can use mid-call, like looking up an order. It sends what it collected to your URL and reads the answer."
            action={
                <Button type="button" variant="outline" size="sm" onClick={() => openDialog(null)} disabled={atLimit}>
                    <Plus className="size-4" />
                    Add tool
                </Button>
            }
            data-testid="custom-tools"
        >
            {tools.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-sm">
                    No custom tools yet.
                </p>
            ) : (
                <ul className="divide-y rounded-md border">
                    {tools.map((tool, i) => (
                        <li key={tool.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="custom-tool">
                            <Switch
                                checked={tool.enabled}
                                onCheckedChange={(enabled) => void toggle(tool, enabled)}
                                disabled={toggling === tool.id}
                                aria-label={`Use ${tool.name}`}
                            />
                            <ToolSummary
                                tool={summaries[i]}
                                badges={
                                    <>
                                        {!tool.enabled ? <Badge variant="secondary">Off</Badge> : null}
                                        {tool.hasSecret ? (
                                            <span title="Requests are signed" className="text-muted-foreground">
                                                <KeyRound className="size-3.5" aria-label="Signed" />
                                            </span>
                                        ) : null}
                                    </>
                                }
                            />
                            <div className="flex shrink-0 items-center">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => openDialog(tool)}
                                    aria-label={`Edit ${tool.name}`}
                                >
                                    <Pencil className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive size-8"
                                    onClick={() => setToDelete(tool)}
                                    aria-label={`Delete ${tool.name}`}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {atLimit ? (
                <p className="text-muted-foreground text-xs">
                    An agent can have up to {VOICE_WEBHOOK_LIMITS.maxTools} custom tools.
                </p>
            ) : null}

            <WebhookToolDialog
                agentId={agentId}
                open={dialogOpen}
                tool={dialogTool}
                otherNames={tools.filter((t) => t.id !== dialogTool?.id).map((t) => t.name)}
                onOpenChange={setDialogOpen}
                onSaved={applySavedAgent}
            />

            <ConfirmDialog
                open={toDelete !== null}
                onOpenChange={(open) => {
                    if (!open && !deleting) setToDelete(null);
                }}
                title={toDelete ? `Delete ${toDelete.name}?` : 'Delete tool?'}
                alertMessage="The agent stops using it from the next call. Past call logs keep what it did."
                confirmText="Delete tool"
                onConfirm={() => void confirmDelete()}
                isLoading={deleting}
            />
        </SettingsSection>
    );
}
