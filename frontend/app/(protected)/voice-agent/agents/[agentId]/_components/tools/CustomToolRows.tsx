'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, type VoiceAgentWebhookToolView } from '@aixellabs/backend/db/types';
import { deleteVoiceAgentWebhookTool, setVoiceAgentWebhookToolEnabled } from '@/app/actions/voice-agent-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import { VOICE_WEBHOOK_PARAM_TYPE_LABELS } from '@/helpers/voice-agent-defaults';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { ToolRow } from './ToolRow';
import { WebhookToolDialog } from './WebhookToolDialog';

type CustomToolRowsProps = { open: string | null; onOpen: (name: string | null) => void };

/**
 * The owner's webhook tools as rows of the Tools list (on/off, and opened: what it sends where, edit, delete),
 * then "Add tool". Each change saves at once.
 */
export function CustomToolRows({ open, onOpen }: CustomToolRowsProps) {
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
        <>
            {tools.map((tool, i) => (
                <ToolRow
                    key={tool.id}
                    id={i === 0 ? 'custom-tools-title' : undefined}
                    tool={summaries[i]}
                    open={open === tool.id}
                    onOpenChange={(isOpen) => onOpen(isOpen ? tool.id : null)}
                    onCheckedChange={(enabled) => void toggle(tool, enabled)}
                    switchDisabled={toggling === tool.id}
                    badges={
                        <>
                            <Badge variant="outline">Custom</Badge>
                            {tool.hasSecret ? (
                                <span title="Requests are signed" className="text-muted-foreground">
                                    <KeyRound className="size-3.5" aria-label="Signed" />
                                </span>
                            ) : null}
                        </>
                    }
                    data-testid="custom-tool"
                >
                    <p className="text-sm whitespace-pre-line">{tool.description}</p>
                    <dl className="grid grid-cols-[minmax(0,1fr)] gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
                        <dt className="text-muted-foreground">Sends to</dt>
                        <dd className="min-w-0 truncate font-mono text-xs leading-5" title={tool.url}>
                            {tool.url}
                        </dd>
                        <dt className="text-muted-foreground">Collects</dt>
                        <dd>
                            {tool.parameters.length
                                ? tool.parameters
                                      .map(
                                          (p) =>
                                              `${p.name} (${VOICE_WEBHOOK_PARAM_TYPE_LABELS[p.type]}${p.required ? '' : ', optional'})`,
                                      )
                                      .join(', ')
                                : 'Nothing from the caller'}
                        </dd>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(tool)}
                            aria-label={`Edit ${tool.name}`}
                        >
                            <Pencil className="size-4" />
                            Edit
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(tool)}
                            aria-label={`Delete ${tool.name}`}
                        >
                            <Trash2 className="size-4" />
                            Delete
                        </Button>
                    </div>
                </ToolRow>
            ))}
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <Button type="button" variant="outline" size="sm" onClick={() => openDialog(null)} disabled={atLimit}>
                    <Plus className="size-4" />
                    Add tool
                </Button>
                <span className="text-muted-foreground text-xs">
                    {atLimit
                        ? `An agent can have up to ${VOICE_WEBHOOK_LIMITS.maxTools} custom tools.`
                        : 'Your own system the agent can use mid-call, like looking up an order: it sends what it collected to your URL and reads the answer.'}
                </span>

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
                    onOpenChange={(isOpen) => {
                        if (!isOpen && !deleting) setToDelete(null);
                    }}
                    title={toDelete ? `Delete ${toDelete.name}?` : 'Delete tool?'}
                    alertMessage="The agent stops using it from the next call. Past call logs keep what it did."
                    confirmText="Delete tool"
                    onConfirm={() => void confirmDelete()}
                    isLoading={deleting}
                />
            </li>
        </>
    );
}
