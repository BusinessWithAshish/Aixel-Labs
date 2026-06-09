import { AIInput } from '@/components/ui/ai-input';

export type ChatInputAreaProps = {
    inputValue: string;
    setInputValue: (value: string) => void;
    handleSubmit: () => void;
    placeholder: string;
    isLoading: boolean;
    disabled: boolean;
};

export function ChatInputArea({
    inputValue,
    setInputValue,
    handleSubmit,
    placeholder,
    isLoading,
    disabled,
}: ChatInputAreaProps) {
    return (
        <AIInput
            variant="textarea"
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            disabled={disabled}
            isLoading={isLoading}
            helperText="Press Enter to send · Shift + Enter for a new line"
        />
    );
}
