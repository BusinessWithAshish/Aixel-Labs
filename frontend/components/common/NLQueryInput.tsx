'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AIInput } from '@/components/ui/ai-input';
import { Search, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * NLQueryInput Component
 *
 * A thin wrapper component for the useNLQuery hook.
 * Pass the hook's return values directly to this component.
 *
 * @example
 * ```tsx
 * const nlQuery = useNLQuery({ data: leads });
 *
 * <NLQueryInput
 *   query={nlQuery.query}
 *   setQuery={nlQuery.setQuery}
 *   executeSearch={nlQuery.executeSearch}
 *   isLoading={nlQuery.isLoading}
 *   error={nlQuery.error}
 *   clear={nlQuery.clear}
 *   explanation={nlQuery.explanation}
 *   isCached={nlQuery.isCached}
 * />
 * ```
 */
export type NLQueryInputProps = {
    /** Current query value from hook */
    query: string;
    /** Set query function from hook */
    setQuery: (value: string) => void;
    /** Execute search function from hook */
    executeSearch: () => void;
    /** Loading state from hook */
    isLoading?: boolean;
    /** Error from hook */
    error?: string | null;
    /** Clear function from hook */
    clear?: () => void;
    /** Explanation from hook */
    explanation?: string | null;
    /** Cached state from hook */
    isCached?: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Example queries to show as suggestions */
    examples?: string[];
    /** Number of results (for display) */
    resultCount?: number;
    /** Total number of items (for display) */
    totalCount?: number;
    /** Additional CSS classes */
    className?: string;
    /** Show the status bar (default: true) */
    showStatus?: boolean;
    /** Show example queries (default: true) */
    showExamples?: boolean;
};

export const NLQueryInput = memo(function NLQueryInput({
    query,
    setQuery,
    executeSearch,
    isLoading = false,
    error = null,
    clear,
    explanation = null,
    isCached = false,
    placeholder = "Describe what you're looking for...",
    examples = [],
    resultCount,
    totalCount,
    className,
    showStatus = true,
    showExamples = true,
}: NLQueryInputProps) {
    const handleClear = () => {
        clear?.();
    };

    const handleExampleClick = (example: string) => {
        setQuery(example);
        // Don't auto-execute, let user click search
    };

    const hasActiveFilter = !!(explanation && query.trim());

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn('space-y-3', className)}
        >
            {/* Search Input */}
            <AIInput
                variant="input"
                value={query}
                onChange={setQuery}
                onSubmit={executeSearch}
                placeholder={placeholder}
                disabled={isLoading}
                isLoading={isLoading}
                showSendButton={false}
                showHelperText={false}
                actionButtons={
                    <>
                        {/* Search Button */}
                        <Button
                            onClick={executeSearch}
                            disabled={isLoading || !query.trim()}
                            size="sm"
                            className="h-9 rounded-lg"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            <span className="ml-2 hidden sm:inline">Search</span>
                        </Button>

                        {/* Clear Button */}
                        <AnimatePresence mode="wait">
                            {(query || hasActiveFilter) && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleClear}
                                        disabled={isLoading}
                                        title="Clear query"
                                        className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                }
            />

            {/* Status Bar */}
            <AnimatePresence mode="wait">
                {showStatus && (hasActiveFilter || error) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className={cn(
                            'flex items-center gap-2 p-2 rounded-md text-sm overflow-hidden',
                            error ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                        )}
                    >
                        {error ? (
                            <>
                                <X className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 flex-wrap flex-1">
                                {explanation && <span className="text-muted-foreground text-xs">{explanation}</span>}
                                {isCached && (
                                    <Badge variant="secondary" className="text-xs">
                                        ⚡ Cached
                                    </Badge>
                                )}
                                {resultCount !== undefined && totalCount !== undefined && (
                                    <Badge variant="outline" className="text-xs">
                                        {resultCount} / {totalCount} results
                                    </Badge>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Example Queries */}
            <AnimatePresence mode="wait">
                {showExamples && examples.length > 0 && !query && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="space-y-2 overflow-hidden"
                    >
                        <p className="text-xs text-muted-foreground font-medium">Try these examples:</p>
                        <div className="flex flex-wrap gap-2">
                            {examples.map((example, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleExampleClick(example)}
                                    disabled={isLoading}
                                    className="text-xs h-7"
                                >
                                    {example}
                                </Button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});

NLQueryInput.displayName = 'NLQueryInput';
