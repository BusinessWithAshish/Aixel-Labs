"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { InputWithLabel } from "@/components/wrappers/InputWithLabel";
import { useForm } from "../_contexts";

export const IdUrlForm = () => {
  const { formData, updateFormData, isIdUrlFormValid } = useForm();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (!value) {
      updateFormData({ idsUrls: [] });
      return;
    }
    
    const parsedIdsUrls = value
      .split(",")
      .map((idUrl) => idUrl.trim())
      .filter(Boolean);
    
    updateFormData({ idsUrls: parsedIdsUrls });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <InputWithLabel
          label={{ text: "Comma separated ID(s) or URL(s)" }}
          forId="idsUrls"
          input={{
            onChange: handleInputChange,
            placeholder: "Google maps Place ID(s) or URL(s)...",
            value: formData.idsUrls.join(", "),
          }}
        />
        
        {/* Form Status */}
        {isIdUrlFormValid && (
          <div className="text-sm text-green-600 font-medium">
            ✓ ID/URL form is ready to submit
          </div>
        )}
      </div>
    </ScrollArea>
  );
};