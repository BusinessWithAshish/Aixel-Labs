'use client';

import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AIInput } from '@/components/ui/ai-input';
import { cn } from '@/lib/utils';
import { User, RotateCcw, CheckCircle2 } from 'lucide-react';
import { ShimmeringText } from '../ui/shimmering-text';
import Image from 'next/image';
import { GoogleGenAI } from '@google/genai';

// Message type for the chat
type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
};

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
    onDataExtracted?: (data: T) => void;
    onConfirm?: (data: T) => void;
};

// Gemini client initialization
const getGeminiClient = () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey });
};

// Generate a human-readable description of the Zod schema
function describeSchema(schema: ZodSchema): string {
    const shape = schema.shape;
    const descriptions: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
        const zodType = value as { _def: { typeName: string; description?: string } };
        const typeName = zodType._def?.typeName;
        const description = zodType._def?.description;

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

        descriptions.push(`• ${key} (${typeDesc})${description ? `: ${description}` : ''}`);
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
        const zodType = value as { _def: { typeName: string } };
        const fieldValue = (data as Record<string, unknown>)[key];

        if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
            missingFields.push(key);
        } else if (zodType._def?.typeName === 'ZodArray' && Array.isArray(fieldValue) && fieldValue.length === 0) {
            missingFields.push(key);
        }
    }

    return {
        isComplete: missingFields.length === 0,
        missingFields,
    };
}

const AixelLabsBotIcon = () => {
    return (
        <Image
            src="/aixellabs.svg"
            alt="Aixel Labs Bot Icon"
            width={32}
            height={32}
            className="border border-ring rounded-full p-1 bg-background text-foreground shrink-0"
            priority={true}
        />
    );
};

export function ChatInterface<T extends Record<string, unknown>>({
    assistantName = 'AI Assistant',
    assistantDescription = 'Here to help you',
    placeholder = 'Type your message...',
    className,
    emptyStateMessage = 'Start a conversation to get started',
    systemPrompt,
    outputSchema,
    onDataExtracted,
    onConfirm,
}: ChatInterfaceProps<T>) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [extractedData, setExtractedData] = useState<Partial<T>>({});
    const [isComplete, setIsComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Add a message to the chat
    const addMessage = useCallback((role: Message['role'], content: string) => {
        const message: Message = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role,
            content,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, message]);
        return message;
    }, []);

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
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]) as Partial<T>;
                    return parsed;
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
    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessageContent = inputValue.trim();
        setInputValue('');
        setError(null);
        setIsLoading(true);

        // Add user message
        addMessage('user', userMessageContent);

        try {
            // Build conversation history for extraction
            const conversationHistory = [...messages, { role: 'user' as const, content: userMessageContent }]
                .filter((m) => m.role !== 'system')
                .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n');

            // Extract data from conversation
            const newExtractedData = await extractDataFromConversation(conversationHistory);
            setExtractedData(newExtractedData);

            // Notify parent of extracted data
            if (onDataExtracted) {
                onDataExtracted(newExtractedData as T);
            }

            // Check completion status
            if (outputSchema) {
                const completionStatus = checkCompletion(outputSchema, newExtractedData);
                setIsComplete(completionStatus.isComplete);
            }

            // Generate AI response
            const aiResponse = await generateResponse(userMessageContent, newExtractedData);
            addMessage('assistant', aiResponse);
        } catch (err) {
            console.error('Error in chat:', err);
            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);
            addMessage('assistant', "I'm sorry, I encountered an error. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Reset the chat
    const handleReset = () => {
        setMessages([]);
        setExtractedData({});
        setIsComplete(false);
        setError(null);
        setInputValue('');
    };

    // Handle confirmation
    const handleConfirm = () => {
        if (onConfirm && isComplete) {
            onConfirm(extractedData as T);
        }
    };

    return (
        <Card className={cn('flex flex-col h-full w-full', className)}>
            <ChatHeader assistantName={assistantName} isComplete={isComplete} onReset={handleReset} />

            <CardContent className="flex flex-col h-full">
                <ScrollArea ref={scrollRef} className="flex-1 p-4">
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

                        {isLoading && <LoadingIndicator />}

                        {/* Confirmation prompt when data collection is complete */}
                        {isComplete && !isLoading && onConfirm && (
                            <ConfirmationPrompt
                                extractedData={extractedData}
                                onConfirm={handleConfirm}
                                onReset={handleReset}
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

                <ChatInputArea
                    inputValue={inputValue}
                    setInputValue={setInputValue}
                    handleSubmit={handleSubmit}
                    placeholder={placeholder}
                    isLoading={isLoading}
                    disabled={isLoading}
                />
            </CardContent>
        </Card>
    );
}

// Sub-components

function ChatHeader({
    assistantName,
    isComplete,
    onReset,
}: {
    assistantName: string;
    isComplete: boolean;
    onReset: () => void;
}) {
    return (
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <AixelLabsBotIcon />
                <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{assistantName}</h3>
                </div>
                {isComplete && (
                    <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">Ready</span>
                    </div>
                )}
            </CardTitle>
            <CardAction>
                <Button variant="ghost" size="icon" onClick={onReset} title="Start over">
                    <RotateCcw className="w-4 h-4" />
                </Button>
            </CardAction>
        </CardHeader>
    );
}

function EmptyState({ assistantName, message }: { assistantName: string; message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center animate-in fade-in duration-500">
            <AixelLabsBotIcon />
            <h4 className="font-medium text-foreground mt-2">{assistantName}</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">{message}</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <AixelLabsBotIcon />
            <ShimmeringText text="Thinking..." className="text-sm" duration={0.6} repeatDelay={1} />
        </div>
    );
}

function ConfirmationPrompt<T>({
    extractedData,
    onConfirm,
    onReset,
}: {
    extractedData: Partial<T>;
    onConfirm: () => void;
    onReset: () => void;
}) {
    const [showDetails, setShowDetails] = useState(false);

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
                <Button onClick={onConfirm} size="sm">
                    Start Now
                </Button>
                <Button onClick={onReset} variant="outline" size="sm">
                    Start Over
                </Button>
                <Button onClick={() => setShowDetails(!showDetails)} variant="ghost" size="sm" className="ml-auto">
                    {showDetails ? 'Hide Details' : 'Show Details'}
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
        <div className="p-4 border-t border-border bg-muted/20">
            <AIInput
                variant="textarea"
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                disabled={disabled}
                isLoading={isLoading}
                helperText="Press Enter to send, Shift+Enter for new line"
            />
        </div>
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
                <AixelLabsBotIcon />
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
