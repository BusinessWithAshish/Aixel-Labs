import { Suspense } from 'react';
import { AllUserLeads } from './_components/AllUserLeads';
import { Card, CardContent } from '@/components/ui/card';

export default function SavedLeadsPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold">Saved Leads</h1>
                <p className="text-gray-600 mt-1">View and manage all your saved leads from various sources</p>
            </div>

            <Suspense
                fallback={
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                                <span className="ml-3">Loading your saved leads...</span>
                            </div>
                        </CardContent>
                    </Card>
                }
            >
                <AllUserLeads />
            </Suspense>
        </div>
    );
}
