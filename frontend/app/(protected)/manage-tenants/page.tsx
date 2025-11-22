import PageLayout from "@/components/common/PageLayout"
import { PageProvider } from "@/contexts/PageStore"
import { ManageTenantsContent } from "./_components"
import { useManageTenantsPage } from "./_hooks"
import { auth } from "@/auth"

export default async function ManageTenantsPage() {
    const session = await auth()
    
    if (!session?.user?.isAdmin) {
        return (
            <PageLayout title="Manage Tenants">
                <div className="flex flex-col items-center justify-center h-full">
                    <h1 className="text-4xl font-bold">403 - Access Denied</h1>
                    <p className="text-lg">You do not have permission to access this page.</p>
                </div>
            </PageLayout>
        )
    }
    
    return (
        <PageProvider usePageHook={useManageTenantsPage}>
            <PageLayout title="Manage Tenants">
                <ManageTenantsContent />
            </PageLayout>
        </PageProvider>
    )
}
