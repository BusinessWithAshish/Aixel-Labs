import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { useMemo } from "react";
import { InstagramLeadCard } from "./InstagramLeadCard";

export const InstagramResultsSection = () => {

    const { response } = usePage<UseInstagramFormReturn>();
    const leads = useMemo(() => response?.allLeads ?? [], [response?.allLeads]);

    return (
        <div className="grid grid-cols-1 h-full overflow-y-auto md:grid-cols-2 lg:grid-cols-4 gap-4">
            {leads.map((lead) => (
                <InstagramLeadCard key={lead.id} lead={lead} />
            ))}
        </div>
    );
};