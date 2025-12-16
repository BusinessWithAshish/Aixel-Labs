'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function NLQueryInput({
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
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !isLoading) {
            executeSearch();
        }
    };

    const handleClear = () => {
        clear?.();
    };

    const handleExampleClick = (example: string) => {
        setQuery(example);
        // Don't auto-execute, let user click search
    };

    const hasActiveFilter = !!(explanation && query.trim());

    return (
        <div className={cn('space-y-3', className)}>
            {/* Search Input */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className="pl-10 pr-3"
                    />
                </div>

                {/* Search Button */}
                <Button onClick={executeSearch} disabled={isLoading || !query.trim()} className="shrink-0">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="ml-2 hidden sm:inline">Search</span>
                </Button>

                {/* Clear Button */}
                {(query || hasActiveFilter) && (
                    <Button variant="outline" size="icon" onClick={handleClear} disabled={isLoading} title="Clear query">
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Status Bar */}
            {showStatus && (hasActiveFilter || error) && (
                <div
                    className={cn(
                        'flex items-center gap-2 p-2 rounded-md text-sm',
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
                </div>
            )}

            {/* Example Queries */}
            {showExamples && examples.length > 0 && !query && (
                <div className="space-y-2">
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
                </div>
            )}
        </div>
    );
}
