import PageLayout from "@/components/common/PageLayout"
import { PageProvider } from "@/contexts/PageStore"
import { ManageTenantsContent } from "./_components"
import { useManageTenantsPage } from "./_hooks"

export default function ManageTenantsPage() {
    return (
        <PageProvider usePageHook={useManageTenantsPage}>
            <PageLayout title="Manage Tenants">
                <ManageTenantsContent />
            </PageLayout>
        </PageProvider>
    )
}
