'use client';

import { ZodStringField } from '@/components/common/zod-form-builder/ZodFieldComponents';
import { Button } from '@/components/ui/button';
import { DialogDescription } from '@/components/ui/dialog';
import { usePage } from '@/contexts/PageStore';
import type { TUseUserLeadListsPageReturn } from '../_hooks/use-user-lead-lists-page';
import { LeadListDialogShell } from './LeadListDialogShell';

const DELETE_POLICY_COPY =
    'This permanently deletes the list and its lead memberships. Soft-delete / retention is not available yet.';

function AddLeadListDialog() {
    const {
        addDialogOpen,
        setAddDialogOpen,
        newName,
        setNewName,
        newDescription,
        setNewDescription,
        submitNewList,
        addSubmitting,
    } = usePage<TUseUserLeadListsPageReturn>();

    return (
        <LeadListDialogShell
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            title="Add Lead List"
            description="Give your lead list a name and description."
            footer={
                <>
                    <Button type="button" variant="outline" disabled={addSubmitting} onClick={() => setAddDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={addSubmitting} onClick={() => void submitNewList()}>
                        {addSubmitting ? 'Adding…' : 'Add Lead List'}
                    </Button>
                </>
            }
        >
            <ZodStringField
                required
                name="name"
                label="Name"
                description="Give your lead list a name."
                value={newName}
                onChange={setNewName}
                disabled={addSubmitting}
            />
            <ZodStringField
                name="description"
                label="Description"
                description="Give your lead list a description."
                value={newDescription}
                onChange={setNewDescription}
                disabled={addSubmitting}
            />
        </LeadListDialogShell>
    );
}

function EditLeadListDialog() {
    const {
        editDialogOpen,
        setEditDialogOpen,
        editName,
        setEditName,
        editDescription,
        setEditDescription,
        submitEditList,
        editSubmitting,
    } = usePage<TUseUserLeadListsPageReturn>();

    return (
        <LeadListDialogShell
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            title="Edit lead list"
            description="Update the title and description. Both fields are optional."
            footer={
                <>
                    <Button type="button" variant="outline" disabled={editSubmitting} onClick={() => setEditDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={editSubmitting} onClick={() => void submitEditList()}>
                        {editSubmitting ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <ZodStringField
                name="editName"
                label="Title"
                description="List title (optional)."
                value={editName}
                onChange={setEditName}
                disabled={editSubmitting}
            />
            <ZodStringField
                name="editDescription"
                label="Description"
                description="List description (optional)."
                value={editDescription}
                onChange={setEditDescription}
                disabled={editSubmitting}
            />
        </LeadListDialogShell>
    );
}

function DeleteLeadListsDialog() {
    const {
        deleteDialogOpen,
        cancelDelete,
        confirmDelete,
        deleteTargetIds,
        deleteIntent,
        deleteSubmitting,
    } = usePage<TUseUserLeadListsPageReturn>();

    const count = deleteTargetIds?.length ?? 0;
    const isSelected = deleteIntent === 'selected';

    const description = (
        <DialogDescription className="space-y-2">
            <span className="block">
                {isSelected
                    ? `You selected ${count} list${count === 1 ? '' : 's'}. Those lists will be permanently deleted.`
                    : `All ${count} list${count === 1 ? '' : 's'} in this view will be permanently deleted.`}
            </span>
            <span className="block">{DELETE_POLICY_COPY}</span>
        </DialogDescription>
    );

    return (
        <LeadListDialogShell
            open={deleteDialogOpen}
            onOpenChange={(open) => {
                if (!open) {
                    if (deleteSubmitting) return;
                    cancelDelete();
                }
            }}
            title={isSelected ? 'Permanently delete selected lead lists?' : 'Permanently delete all lead lists?'}
            description={description}
            footer={
                <>
                    <Button type="button" variant="outline" disabled={deleteSubmitting} onClick={cancelDelete}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={deleteSubmitting}
                        onClick={() => void confirmDelete()}
                    >
                        {deleteSubmitting ? 'Deleting…' : 'Delete permanently'}
                    </Button>
                </>
            }
        />
    );
}

export function LeadListDialogs() {
    return (
        <>
            <AddLeadListDialog />
            <EditLeadListDialog />
            <DeleteLeadListsDialog />
        </>
    );
}
