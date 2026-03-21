'use client';

import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { InstagramLeadCard } from "../../../../../components/common/lead-card/InstagramLeadCard";
import { CommonLoader } from "@/components/common/CommonLoader";
import { NoDataFound } from "@/components/common/NoDataFound";

export const InstagramResultsSection = () => {

    const { instagramLeads, form } = usePage<UseInstagramFormReturn>();

    if (form.formState.isSubmitting) {
        return <CommonLoader text='Loading your Instagram leads' />
    }

    if (!instagramLeads.length) {
        return <NoDataFound message='No Instagram leads found! Please try again.' showBackButton={false} />
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 h-full overflow-y-auto">
            {instagramLeads.map((lead) => (
                <InstagramLeadCard key={lead.id} lead={lead} />
            ))}
        </div>
    );
};