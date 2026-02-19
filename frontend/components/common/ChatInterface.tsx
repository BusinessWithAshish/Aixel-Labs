'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AIInput } from '@/components/ui/ai-input';
import { cn } from '@/lib/utils';
import { CheckCircle2, RotateCcw, User } from 'lucide-react';
import { ShimmeringText } from '../ui/shimmering-text';
import { GoogleGenAI } from '@google/genai';
import { AppLogo } from './AppLogo';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { toast } from 'sonner';

// Message type for the chat
type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
};

// Single persisted state for the chat interface (restored when tab is focused again)
type ChatInterfaceInfo<T = Record<string, unknown>> = {
    messages: Message[];
    inputValue: string;
    extractedData: Partial<T>;
    isComplete: boolean;
    error: string | null;
    isLoading: boolean;
};

function getDefaultChatInterfaceInfo<T>(): ChatInterfaceInfo<T> {
    return {
        messages: [],
        inputValue: '',
        extractedData: {},
        isComplete: false,
        error: null,
        isLoading: false,
    };
}

// Generic schema type - any object with a shape property containing field definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodSchema = { shape: Record<string, any> };

// Props for the ChatInterface component
export type ChatInterfaceProps<T = Record<string, unknown>> = {
    assistantName?: string;
    assistantDescription?: string;
    placeholder?: string;
    className?: string;
    emptyStateMessage?: string;
    systemPrompt?: string;
    outputSchema?: ZodSchema;
    messagesPersistKey: string;
    onDataExtracted?: (data: T) => void;
    /** Called when user confirms. Can be async; loading state is shown until it resolves. */
    onConfirm?: (data: T) => void | Promise<void>;
};

// Gemini client initialization
const getGeminiClient = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey });
};

type ZodTypeLike = {
    _def?: {
        typeName?: string;
        description?: string;
        innerType?: ZodTypeLike;
    };
};

// Helper: unwrap wrappers like Optional/Nullable/Default to get the base type
function unwrapZodType(zodType: ZodTypeLike): ZodTypeLike {
    let current: ZodTypeLike = zodType;

    // Unwrap common container types that wrap another Zod type
    while (current?._def?.innerType) {
        const typeName = current._def.typeName;
        if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault') {
            current = current._def.innerType as ZodTypeLike;
        } else {
            break;
        }
    }

    return current;
}

// Helper: detect whether a field is effectively optional
function isOptionalZodType(zodType: ZodTypeLike): boolean {
    const typeName = zodType?._def?.typeName;

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
        return true;
    }

    if (typeName === 'ZodDefault' && zodType._def?.innerType) {
        return isOptionalZodType(zodType._def.innerType);
    }

    return false;
}

// Generate a human-readable description of the Zod schema
function describeSchema(schema: ZodSchema): string {
    const shape = schema.shape;
    const descriptions: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
        const rawZodType = value as ZodTypeLike;
        const baseType = unwrapZodType(rawZodType);
        const typeName = baseType._def?.typeName;
        const description = baseType._def?.description;
        const isOptional = isOptionalZodType(rawZodType);

        let typeDesc = '';
        if (typeName === 'ZodString') {
            typeDesc = 'text';
        } else if (typeName === 'ZodNumber') {
            typeDesc = 'number';
        } else if (typeName === 'ZodBoolean') {
            typeDesc = 'yes/no';
        } else if (typeName === 'ZodArray') {
            typeDesc = 'list';
        } else if (typeName === 'ZodObject') {
            typeDesc = 'structured data';
        } else {
            typeDesc = 'value';
        }

        const optionalLabel = isOptional ? 'optional ' : '';

        descriptions.push(`• ${key} (${optionalLabel}${typeDesc})${description ? `: ${description}` : ''}`);
    }

    return descriptions.join('\n');
}

// Build the system prompt for conversational data collection
function buildSystemPrompt<T>(
    schema: ZodSchema | undefined,
    customPrompt: string | undefined,
    extractedData: Partial<T>,
): string {
    const basePrompt =
        customPrompt ||
        `You are a friendly and helpful assistant. Your goal is to have a natural conversation 
         with the user to understand their needs and collect the necessary information.`;

    if (!schema) {
        return basePrompt;
    }

    const schemaDescription = describeSchema(schema);
    const currentDataStr = Object.keys(extractedData).length > 0 ? JSON.stringify(extractedData, null, 2) : 'None yet';

    return `${basePrompt}

## Your Task
You need to collect the following information from the user through natural conversation:

${schemaDescription}

## Current Collected Information
${currentDataStr}

## Guidelines for Your Responses

1. **Be Conversational**: Ask questions naturally, one or two at a time. Don't overwhelm the user with a list of questions.

2. **Be Smart About Context**: 
   - When users mention a city (like "Mumbai" or "New York"), automatically infer the country and state/region
   - If something is ambiguous, ask for clarification politely

3. **Keep It Concise**: Your responses should be 1-3 sentences. Be helpful but brief.

4. **Acknowledge Progress**: When the user provides information, acknowledge it before asking for more.

5. **When Complete**: Once you have all required information, summarize what you've collected and ask the user to confirm.

6. **Natural Language Only**: Always respond in natural conversational language. Never output JSON or code in your responses.

Remember: You're having a conversation, not conducting an interview. Be personable and helpful!`;
}

// Build the extraction prompt to get structured data from conversation
function buildExtractionPrompt<T>(schema: ZodSchema, conversationHistory: string, currentData: Partial<T>): string {
    const schemaDescription = describeSchema(schema);

    return `Analyze this conversation and extract structured data.

## Target Schema
${schemaDescription}

## Conversation
${conversationHistory}

## Previously Extracted Data
${JSON.stringify(currentData, null, 2)}

## Instructions
1. Extract any new information mentioned in the conversation
2. For locations:
   - "Mumbai" → country: "India", states: [{ name: "Maharashtra", cities: ["Mumbai"] }]
   - "New York" → country: "United States", states: [{ name: "New York", cities: ["New York"] }]
   - "restaurants in Delhi and Mumbai" → states: [{ name: "Delhi", cities: ["Delhi"] }, { name: "Maharashtra", cities: ["Mumbai"] }]
3. Merge new data with existing data
4. Return ONLY valid JSON matching the schema structure
5. If a field cannot be determined, use empty string for strings or empty array for arrays

Return the extracted data as JSON:`;
}

// Check if all required fields are filled
function checkCompletion<T>(schema: ZodSchema, data: Partial<T>): { isComplete: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    const shape = schema.shape;

    for (const [key, value] of Object.entries(shape)) {
        const rawZodType = value as ZodTypeLike;

        // Optional fields should not block completion if they are missing
        if (isOptionalZodType(rawZodType)) {
            continue;
        }

        const baseType = unwrapZodType(rawZodType);
        const fieldValue = (data as Record<string, unknown>)[key];

        if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
            missingFields.push(key);
        } else if (baseType._def?.typeName === 'ZodArray' && Array.isArray(fieldValue) && fieldValue.length === 0) {
            missingFields.push(key);
        }
    }

    return {
        isComplete: missingFields.length === 0,
        missingFields,
    };
}

export function ChatInterface<T extends Record<string, unknown>>({
    assistantName = 'AI Assistant',
    placeholder = 'Type your message...',
    className,
    emptyStateMessage = 'Start a conversation to get started',
    systemPrompt,
    outputSchema,
    onDataExtracted,
    onConfirm,
    messagesPersistKey,
}: ChatInterfaceProps<T>) {
    const [chatInterfaceInfo, setChatInterfaceInfo] = useLocalStorage<ChatInterfaceInfo<T>>(
        messagesPersistKey,
        getDefaultChatInterfaceInfo<T>(),
        {
            deserializer: (raw) => {
                try {
                    const parsed = JSON.parse(raw) as ChatInterfaceInfo<T>;
                    const messages = (parsed.messages || []).map((m) => ({
                        ...m,
                        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                    }));
                    return {
                        ...getDefaultChatInterfaceInfo<T>(),
                        ...parsed,
                        messages,
                        isLoading: false,
                        error: null,
                    };
                } catch {
                    return getDefaultChatInterfaceInfo<T>();
                }
            },
        },
    );

    const { messages, inputValue, extractedData, isComplete, error, isLoading } = chatInterfaceInfo;
    const [isConfirming, setIsConfirming] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Single "busy" for disabling input: either AI is thinking or confirm (Start Now) is in progress
    const isBusy = isLoading || isConfirming;

    // Auto-scroll to the bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Add a message to the chat
    const addMessage = useCallback(
        (role: Message['role'], content: string) => {
            const message: Message = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role,
                content,
                timestamp: new Date(),
            };
            setChatInterfaceInfo((prev) => ({ ...prev, messages: [...prev.messages, message] }));
            return message;
        },
        [setChatInterfaceInfo],
    );

    // Extract data from conversation using Gemini
    const extractDataFromConversation = useCallback(
        async (conversationHistory: string): Promise<Partial<T>> => {
            if (!outputSchema) return extractedData;

            try {
                const client = getGeminiClient();
                const extractionPrompt = buildExtractionPrompt(outputSchema, conversationHistory, extractedData);

                const response = await client.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: extractionPrompt,
                });

                const responseText = response.text || '';

                // Parse the JSON response
                const jsonMatch = responseText.match(/\{[\s\S]*}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]) as Partial<T>;
                }

                return extractedData;
            } catch (err) {
                console.error('Error extracting data:', err);
                return extractedData;
            }
        },
        [outputSchema, extractedData],
    );

    // Generate AI response using Gemini
    const generateResponse = useCallback(
        async (userMessage: string, currentExtractedData: Partial<T>): Promise<string> => {
            try {
                const client = getGeminiClient();
                const contextPrompt = buildSystemPrompt(outputSchema, systemPrompt, currentExtractedData);

                // Build conversation context
                const conversationContext = messages
                    .filter((m) => m.role !== 'system')
                    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                    .join('\n');

                const fullPrompt = `${contextPrompt}

## Conversation So Far
${conversationContext}

User: ${userMessage}

Respond naturally to the user. Remember to be conversational and helpful.`;

                const response = await client.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: fullPrompt,
                });

                return response.text || "I'm sorry, I couldn't generate a response. Please try again.";
            } catch (err) {
                console.error('Error generating response:', err);
                throw err;
            }
        },
        [messages, outputSchema, systemPrompt],
    );

    // Handle message submission
    const handleChatMessageSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isBusy) return;

        const userMessageContent = inputValue.trim();
        setChatInterfaceInfo((prev) => ({ ...prev, inputValue: '', error: null, isLoading: true }));

        // Add a user message
        addMessage('user', userMessageContent);

        try {
            // Build conversation history for extraction
            const conversationHistory = [...messages, { role: 'user' as const, content: userMessageContent }]
                .filter((m) => m.role !== 'system')
                .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n');

            // Extract data from conversation
            const newExtractedData = await extractDataFromConversation(conversationHistory);
            setChatInterfaceInfo((prev) => ({
                ...prev,
                extractedData: newExtractedData,
                ...(outputSchema
                    ? { isComplete: checkCompletion(outputSchema, newExtractedData).isComplete }
                    : {}),
            }));

            // Notify parent of extracted data
            if (onDataExtracted) {
                onDataExtracted(newExtractedData as T);
            }

            // Generate AI response
            const aiResponse = await generateResponse(userMessageContent, newExtractedData);
            addMessage('assistant', aiResponse);
        } catch (err) {
            console.error('Error in chat message:', err);
            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setChatInterfaceInfo((prev) => ({
                ...prev,
                error: errorMessage,
            }));
            addMessage('assistant', "I'm sorry, I encountered an error. Please try again.");
        } finally {
            setChatInterfaceInfo((prev) => ({ ...prev, isLoading: false }));
        }
    };

    // Reset the chat
    const handleReset = () => {
        setChatInterfaceInfo(getDefaultChatInterfaceInfo<T>());
    };

    // Handle confirmation (supports async onConfirm); use isConfirming so we don't show "Thinking..." during submit
    const handleConfirm = useCallback(async () => {
        if (!onConfirm || !isComplete) return;
        setIsConfirming(true);
        try {
            await onConfirm(extractedData as T);
            toast.success(
                'Your previous request to the scraper for fetching leads was successful, so we are resetting the chat.',
                { duration: 10_000 },
            );
            setChatInterfaceInfo(getDefaultChatInterfaceInfo<T>());
        } catch (err) {
            console.error('Error while confirming:', err);
            toast.error(err instanceof Error ? err.message : 'Something went wrong while confirming. Please try again.');
            setChatInterfaceInfo((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Something went wrong while confirming. Please try again.' }));
        } finally {
            setIsConfirming(false);
        }
    }, [onConfirm, isComplete, extractedData, setChatInterfaceInfo]);

    return (
        <Card className={cn('flex flex-col h-full w-full', className)}>
            <ChatHeader assistantName={assistantName} onReset={handleReset} />

            <CardContent className="flex flex-col h-full">
                <ScrollArea ref={scrollRef} className="flex-1">
                    <div className="space-y-4">
                        {messages.length === 0 && <EmptyState assistantName={assistantName} message={emptyStateMessage} />}

                        {messages.map((message, index) => (
                            <ChatMessage
                                key={message.id}
                                role={message.role}
                                content={message.content}
                                isLatest={index === messages.length - 1}
                            />
                        ))}

                        {/* Only show "Thinking..." when AI is responding, not when Start Now is in progress */}
                        {isLoading && !isConfirming && <LoadingIndicator />}

                        {/* Confirmation prompt when data collection is complete */}
                        {isComplete && onConfirm && (
                            <ConfirmationPrompt
                                extractedData={extractedData}
                                onConfirm={handleConfirm}
                                onReset={handleReset}
                                isConfirming={isConfirming}
                            />
                        )}

                        {/* Error display */}
                        {error && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>

            <CardFooter>
                <ChatInputArea
                    inputValue={inputValue}
                    setInputValue={(value) =>
                        setChatInterfaceInfo((prev) => ({ ...prev, inputValue: value }))
                    }
                    handleSubmit={handleChatMessageSubmit}
                    placeholder={placeholder}
                    isLoading={isBusy}
                    disabled={isBusy}
                />
            </CardFooter>
        </Card>
    );
}

// Sub-components

function ChatHeader({
    assistantName,
    onReset,
}: {
    assistantName: string;
    onReset: () => void;
}) {
    return (
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <AppLogo />
                <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{assistantName}</h3>
                </div>
            </CardTitle>
            <CardAction>
                <Button variant="outline" size="icon" onClick={onReset} title="Start over">
                    <RotateCcw className="w-4 h-4" />
                </Button>
            </CardAction>
        </CardHeader>
    );
}

function EmptyState({ assistantName, message }: { assistantName: string; message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center animate-in fade-in duration-500">
            <AppLogo />
            <h4 className="font-medium text-foreground mt-2">{assistantName}</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">{message}</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <AppLogo />
            <ShimmeringText text="Thinking..." className="text-sm" duration={0.6} repeatDelay={1} />
        </div>
    );
}

function ConfirmationPrompt<T>({
    extractedData,
    onConfirm,
    onReset,
    isConfirming,
}: {
    extractedData: Partial<T>;
    onConfirm: () => void | Promise<void>;
    onReset: () => void;
    isConfirming?: boolean;
}) {

    const showDetails = process.env.NEXT_PUBLIC_NODE_ENV === 'development';

    return (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-300 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <p className="font-medium text-foreground">Ready to proceed?</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                I have all the information I need. Would you like me to start the process?
            </p>
            {showDetails && (
                <pre className="text-xs bg-muted p-2 rounded mb-4 overflow-x-auto">
                    {JSON.stringify(extractedData, null, 2)}
                </pre>
            )}
            <div className="flex items-center gap-2">
                <Button onClick={onConfirm} size="sm" disabled={isConfirming}>
                    {isConfirming ? 'Processing...' : 'Start Now'}
                </Button>
                <Button onClick={onReset} variant="outline" size="sm" disabled={isConfirming}>
                    Start Over
                </Button>
            </div>
        </div>
    );
}

type ChatInputAreaProps = {
    inputValue: string;
    setInputValue: (value: string) => void;
    handleSubmit: () => void;
    placeholder: string;
    isLoading: boolean;
    disabled: boolean;
};

function ChatInputArea({ inputValue, setInputValue, handleSubmit, placeholder, isLoading, disabled }: ChatInputAreaProps) {
    return (
        <AIInput
            variant="textarea"
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            disabled={disabled}
            isLoading={isLoading}
            helperText="Press ⌘/Ctrl + Enter to send"
        />
    );
}

type ChatMessageProps = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    isLatest: boolean;
};

function ChatMessage({ role, content, isLatest }: ChatMessageProps) {
    const isUser = role === 'user';
    const isSystem = role === 'system';

    if (isSystem) {
        return (
            <div className={cn('flex justify-center', isLatest && 'animate-in slide-in-from-bottom-2 fade-in duration-300')}>
                <div className="px-3 py-1.5 bg-muted/50 rounded-full">
                    <p className="text-xs text-muted-foreground">{content}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'flex items-start gap-3',
                isUser && 'flex-row-reverse',
                isLatest && 'animate-in slide-in-from-bottom-2 fade-in duration-300',
            )}
        >
            {isUser ? (
                <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src="https://ui.shadcn.com/avatars/shadcn.jpg" alt="User" />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        <User className="w-4 h-4 text-secondary-foreground" />
                    </AvatarFallback>
                </Avatar>
            ) : (
                <AppLogo />
            )}

            <div
                className={cn(
                    'max-w-[80%] px-4 py-3 rounded-2xl',
                    isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                )}
            >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            </div>
        </div>
    );
}
