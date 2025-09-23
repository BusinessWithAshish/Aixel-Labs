"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { InputWithLabel } from "@/components/wrappers/InputWithLabel";

interface IdUrlFormProps {
  idsUrls: string[];
  onIdsUrlsChange: (idsUrls: string[]) => void;
  disabled?: boolean;
}

export const IdUrlForm = ({
  idsUrls,
  onIdsUrlsChange,
  disabled = false,
}: IdUrlFormProps) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (!value) {
      onIdsUrlsChange([]);
      return;
    }
    
    const parsedIdsUrls = value
      .split(",")
      .map((idUrl) => idUrl.trim())
      .filter(Boolean);
    
    onIdsUrlsChange(parsedIdsUrls);
  };

  return (
    <ScrollArea className="h-full">
        <div className="p-3">
            <InputWithLabel
          label={{ text: "Comma separated ID(s) or URL(s)" }}
          forId="idsUrls"
          input={{
            disabled,
            onChange: handleInputChange,
            placeholder: "Google maps Place ID(s) or URL(s)...",
            value: idsUrls.join(", "),
          }}
        />
        </div>
    
    </ScrollArea>
  );
};
