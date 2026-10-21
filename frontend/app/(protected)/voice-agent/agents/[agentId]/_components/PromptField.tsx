'use client';

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Braces, TriangleAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    filterPromptTools,
    filterPromptVariables,
    findToolMentions,
    findVariableMentions,
    mentionProblem,
    slashQueryAt,
    variableProblem,
    variableQueryAt,
    type PromptSlashQuery,
    type PromptTool,
    type PromptVariable,
} from '../_utils/prompt-tools';

type PromptFieldProps = {
    id: string;
    value: string;
    onChange: (value: string) => void;
    tools: PromptTool[];
    /** Takes the owner to the Tools card (the booking switch, or the custom tools). */
    onOpenTools: (kind?: PromptTool['kind']) => void;
    /** `{{variables}}` it can use: offered after "{{" and marked in the text. */
    variables?: PromptVariable[];
    /** Takes the owner to the variables' default values. */
    onOpenVariables?: () => void;
    invalid?: boolean;
    describedBy?: string;
    placeholder?: string;
    className?: string;
};

type Box = { top: number; left: number; width: number; height: number };

/** What the open menu inserts: a tool ("/") or a variable ("{{"). */
type MenuQuery = PromptSlashQuery & { kind: 'tools' | 'variables' };

/** One marked span in the mirror: a tool name or a `{{variable}}`, and why it may not work. */
type Mark = { start: number; end: number; name: string; kind: 'tool' | 'variable'; problem: string | null };

const NO_VARIABLES: PromptVariable[] = [];

// The textarea and the mirror behind it must lay text out identically.
const TEXT_BOX =
    'border px-3 py-2 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words [scrollbar-gutter:stable]';
const MENU_WIDTH = 288;

// Mark colours, shared by the text, the menus and the legend so each kind reads the same everywhere.
const TOOL_MARK = 'bg-primary/15 ring-primary/15 dark:bg-primary/25 dark:ring-primary/25';
const VARIABLE_MARK = 'bg-sky-500/15 ring-sky-500/15 dark:bg-sky-400/20 dark:ring-sky-400/20';
const PROBLEM_MARK =
    'bg-amber-400/20 ring-amber-400/20 underline decoration-amber-600 decoration-wavy underline-offset-[3px] dark:bg-amber-400/15 dark:ring-amber-400/15 dark:decoration-amber-400';
const MENU_HEADING = 'text-muted-foreground border-b px-2 pt-1 pb-1.5 text-xs';

/** Where character `offset` of the text is drawn, read from the mirror. */
function rectAt(mirror: HTMLElement, offset: number): DOMRect | null {
    const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
    let rest = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (rest < length) {
            const range = document.createRange();
            range.setStart(node, rest);
            range.setEnd(node, rest + 1);
            return range.getBoundingClientRect();
        }
        rest -= length;
    }
    return null;
}

/**
 * The prompt textarea. A mirror behind it marks tool names (warning style when the agent lacks
 * the tool) and `{{variables}}` (warning style when one may come out empty). "/" at the start of
 * a word opens a menu of the agent's tools to insert, "{{" one of its variables.
 */
export function PromptField({
    id,
    value,
    onChange,
    tools,
    onOpenTools,
    variables = NO_VARIABLES,
    onOpenVariables,
    invalid,
    describedBy,
    placeholder,
    className,
}: PromptFieldProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);
    const [slash, setSlash] = useState<MenuQuery | null>(null);
    // A "/" closed with Esc stays closed until the caret leaves it.
    const [dismissed, setDismissed] = useState<number | null>(null);
    const [active, setActive] = useState(0);
    const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
    const [hovered, setHovered] = useState<{ index: number; box: Box } | null>(null);
    const [scrolled, setScrolled] = useState(0);

    const mentions = useMemo(
        // The word being typed after "/" is a query, not a mention.
        () => findToolMentions(value, tools).filter((m) => slash?.kind !== 'tools' || m.start !== slash.start + 1),
        [value, tools, slash],
    );
    const variableMentions = useMemo(() => findVariableMentions(value, variables), [value, variables]);
    const marks = useMemo(
        (): Mark[] =>
            [
                ...mentions.map((m) => ({ ...m, kind: 'tool' as const, problem: mentionProblem(m) })),
                ...variableMentions.map((m) => ({ ...m, kind: 'variable' as const, problem: variableProblem(m) })),
            ].sort((a, b) => a.start - b.start),
        [mentions, variableMentions],
    );
    /** Variables that may come out empty, once each. */
    const emptyVariables = useMemo(
        () => [...new Set(variableMentions.filter((m) => variableProblem(m)).map((m) => m.name))],
        [variableMentions],
    );
    const problems = useMemo(() => {
        const byText = new Map<string, string[]>();
        for (const mention of mentions) {
            const problem = mentionProblem(mention);
            if (!problem) continue;
            const names = byText.get(problem) ?? [];
            if (!names.includes(mention.name)) byText.set(problem, [...names, mention.name]);
        }
        return [...byText].map(([text, names]) => ({ text, names }));
    }, [mentions]);

    const toolOptions = useMemo(
        () => (slash?.kind === 'tools' ? filterPromptTools(tools, slash.query) : []),
        [slash, tools],
    );
    const variableOptions = useMemo(
        () => (slash?.kind === 'variables' ? filterPromptVariables(variables, slash.query) : []),
        [slash, variables],
    );
    // A "{{" with nothing to offer shows no menu; a "/" always does (its fallback entry opens Tools).
    const open = slash !== null && slash.start !== dismissed && (slash.kind === 'tools' || variableOptions.length > 0);
    const options = toolOptions;
    // Nothing to insert: the one entry goes to the Tools card.
    const optionCount = slash?.kind === 'variables' ? variableOptions.length : Math.max(options.length, 1);
    const listboxId = `${id}-${slash?.kind ?? 'tools'}`;
    const optionId = (index: number) => `${id}-tool-${index}`;
    const problemsId = `${id}-problems`;

    /** Reads the caret from the textarea: opens, moves or closes the menu. */
    const syncSlash = (el: HTMLTextAreaElement) => {
        const caret = el.selectionStart === el.selectionEnd ? el.selectionStart : null;
        const tool = caret === null ? null : slashQueryAt(el.value, caret);
        const variable = caret === null || tool || variables.length === 0 ? null : variableQueryAt(el.value, caret);
        const next: MenuQuery | null = tool
            ? { ...tool, kind: 'tools' }
            : variable
              ? { ...variable, kind: 'variables' }
              : null;
        if (next?.start !== slash?.start || next?.query !== slash?.query) setActive(0);
        if (next?.start !== dismissed) setDismissed(null);
        setSlash(next);
    };

    // Keep the mirror scrolled with the textarea, and the menu under the "/".
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        const mirror = mirrorRef.current;
        const wrapper = wrapperRef.current;
        if (!textarea || !mirror || !wrapper) return;
        mirror.scrollTop = textarea.scrollTop;
        mirror.scrollLeft = textarea.scrollLeft;
        const rect = open ? rectAt(mirror, slash.start) : null;
        if (!rect) {
            setMenuAt(null);
            return;
        }
        const box = wrapper.getBoundingClientRect();
        const top = Math.min(Math.max(rect.bottom - box.top, 0), textarea.clientHeight) + 4;
        const left = Math.min(Math.max(rect.left - box.left, 0), Math.max(box.width - MENU_WIDTH, 0));
        setMenuAt({ top, left });
    }, [value, open, slash, scrolled]);

    const close = () => {
        if (slash) setDismissed(slash.start);
    };

    /** Replaces the "/query" with `text`, through the browser's editing so undo still works. */
    const replaceSlash = (text: string) => {
        const textarea = textareaRef.current;
        if (!textarea || !slash) return;
        textarea.focus();
        textarea.setSelectionRange(slash.start, slash.end);
        const done = text ? document.execCommand('insertText', false, text) : document.execCommand('delete', false);
        if (!done) {
            textarea.setRangeText(text, slash.start, slash.end, 'end');
            onChange(textarea.value);
        }
        setSlash(null);
    };

    const choose = (index: number) => {
        if (slash?.kind === 'variables') {
            const variable = variableOptions[index];
            if (variable) replaceSlash(`{{${variable.name}}}`);
            return;
        }
        const tool = options[index];
        if (!tool) {
            replaceSlash('');
            onOpenTools();
            return;
        }
        const after = value.slice(slash?.end ?? 0);
        replaceSlash(/^[\s.,;:!?)]/.test(after) ? tool.name : `${tool.name} `);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!open || event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((i) => (i + step + optionCount) % optionCount);
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            choose(active);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };

    /** Hovering a mark that will not work shows why (the mirror itself takes no pointer events). */
    const onMouseMove = (event: MouseEvent<HTMLTextAreaElement>) => {
        const wrapper = wrapperRef.current;
        const marks = mirrorRef.current?.querySelectorAll<HTMLElement>('mark[data-problem]') ?? [];
        let hit: { index: number; box: Box } | null = null;
        for (const mark of marks) {
            const rect = [...mark.getClientRects()].find(
                (r) =>
                    event.clientX >= r.left &&
                    event.clientX <= r.right &&
                    event.clientY >= r.top &&
                    event.clientY <= r.bottom,
            );
            if (!rect || !wrapper) continue;
            const box = wrapper.getBoundingClientRect();
            hit = {
                index: Number(mark.dataset.index),
                box: { top: rect.top - box.top, left: rect.left - box.left, width: rect.width, height: rect.height },
            };
            break;
        }
        if (hit?.index !== hovered?.index) setHovered(hit);
    };

    const hoveredProblem = hovered ? (marks[hovered.index]?.problem ?? null) : null;

    // The mirror: plain text with each mark wrapped (the textarea paints the text).
    const mirrored: ReactNode[] = [];
    let from = 0;
    marks.forEach((mark, index) => {
        const { problem } = mark;
        mirrored.push(value.slice(from, mark.start));
        mirrored.push(
            <mark
                key={mark.start}
                data-index={index}
                data-tool={mark.kind === 'tool' ? mark.name : undefined}
                data-variable={mark.kind === 'variable' ? mark.name : undefined}
                data-problem={problem ?? undefined}
                className={cn(
                    'rounded-[3px] text-transparent ring-2',
                    problem ? PROBLEM_MARK : mark.kind === 'variable' ? VARIABLE_MARK : TOOL_MARK,
                )}
            >
                {value.slice(mark.start, mark.end)}
            </mark>,
        );
        from = mark.end;
    });
    // A zero-width space keeps a trailing newline's empty line in the mirror.
    mirrored.push(`${value.slice(from)}\u200b`);

    return (
        <div className="grid gap-2">
            <div ref={wrapperRef} className="relative">
                <div
                    ref={mirrorRef}
                    aria-hidden
                    data-testid="prompt-mirror"
                    className={cn(
                        TEXT_BOX,
                        'pointer-events-none absolute inset-0 overflow-hidden rounded-md border-transparent text-transparent dark:bg-input/30',
                    )}
                >
                    {mirrored}
                </div>
                <Textarea
                    ref={textareaRef}
                    id={id}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        syncSlash(e.target);
                    }}
                    onSelect={(e) => syncSlash(e.currentTarget)}
                    onKeyDown={onKeyDown}
                    onBlur={() => setSlash(null)}
                    onScroll={() => {
                        setHovered(null);
                        setScrolled((n) => n + 1);
                    }}
                    onMouseMove={onMouseMove}
                    onMouseLeave={() => setHovered(null)}
                    aria-invalid={invalid}
                    aria-describedby={
                        [describedBy, problems.length > 0 ? problemsId : null].filter(Boolean).join(' ') || undefined
                    }
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-controls={open ? listboxId : undefined}
                    aria-activedescendant={open ? optionId(active) : undefined}
                    spellCheck={false}
                    placeholder={placeholder}
                    className={cn(
                        TEXT_BOX,
                        'relative resize-y bg-transparent field-sizing-fixed md:text-[13px] dark:bg-transparent',
                        className,
                    )}
                />

                {hovered && hoveredProblem ? (
                    <Tooltip open>
                        <TooltipTrigger asChild>
                            <span aria-hidden className="pointer-events-none absolute" style={hovered.box} />
                        </TooltipTrigger>
                        <TooltipContent sideOffset={4}>{hoveredProblem}</TooltipContent>
                    </Tooltip>
                ) : null}

                {open && menuAt && slash.kind === 'variables' ? (
                    <div
                        id={listboxId}
                        role="listbox"
                        aria-label="Insert a variable"
                        data-testid="prompt-variable-menu"
                        className="bg-popover text-popover-foreground absolute z-20 max-h-60 max-w-full overflow-y-auto rounded-md border p-1 shadow-md"
                        style={{ top: menuAt.top, left: menuAt.left, width: MENU_WIDTH }}
                    >
                        <p className={MENU_HEADING} aria-hidden>
                            Variables: blanks filled in on each call
                        </p>
                        {variableOptions.map((variable, index) => (
                            <div
                                key={variable.name}
                                id={optionId(index)}
                                role="option"
                                aria-selected={index === active}
                                onPointerDown={(e) => e.preventDefault()}
                                onPointerMove={() => setActive(index)}
                                onClick={() => choose(index)}
                                className="aria-selected:bg-accent aria-selected:text-accent-foreground grid cursor-pointer gap-0.5 rounded-sm px-2 py-1.5"
                            >
                                <span className={cn('w-fit rounded-[3px] font-mono text-[13px] ring-2', VARIABLE_MARK)}>
                                    {`{{${variable.name}}}`}
                                </span>
                                <span className="text-muted-foreground truncate text-xs">
                                    {variable.builtin ? 'Built-in · ' : ''}
                                    {variable.description}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : open && menuAt ? (
                    <div
                        id={listboxId}
                        role="listbox"
                        aria-label="Insert a tool"
                        data-testid="prompt-tool-menu"
                        className="bg-popover text-popover-foreground absolute z-20 max-h-60 max-w-full overflow-y-auto rounded-md border p-1 shadow-md"
                        style={{ top: menuAt.top, left: menuAt.left, width: MENU_WIDTH }}
                    >
                        <p className={MENU_HEADING} aria-hidden>
                            Tools: things the agent can do on a call
                        </p>
                        {options.length > 0 ? (
                            options.map((tool, index) => (
                                <div
                                    key={tool.name}
                                    id={optionId(index)}
                                    role="option"
                                    aria-selected={index === active}
                                    onPointerDown={(e) => e.preventDefault()}
                                    onPointerMove={() => setActive(index)}
                                    onClick={() => choose(index)}
                                    className="aria-selected:bg-accent aria-selected:text-accent-foreground grid cursor-pointer gap-0.5 rounded-sm px-2 py-1.5"
                                >
                                    <span className={cn('w-fit rounded-[3px] font-mono text-[13px] ring-2', TOOL_MARK)}>
                                        {tool.name}
                                    </span>
                                    {tool.description ? (
                                        <span className="text-muted-foreground truncate text-xs">{tool.description}</span>
                                    ) : null}
                                </div>
                            ))
                        ) : (
                            <div
                                id={optionId(0)}
                                role="option"
                                aria-selected
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => choose(0)}
                                className="bg-accent text-accent-foreground grid cursor-pointer gap-0.5 rounded-sm px-2 py-1.5"
                            >
                                <span className="flex items-center gap-1.5 text-sm">
                                    <Wrench className="size-3.5" />
                                    Set up tools
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {tools.some((tool) => tool.on)
                                        ? `No tool matches “${slash.query}”`
                                        : 'This agent has no tools yet'}
                                </span>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            <p className="sr-only" aria-live="polite">
                {open && slash.kind === 'variables'
                    ? `${variableOptions.length} variable${variableOptions.length === 1 ? '' : 's'}. Up and down to choose, Enter to insert, Escape to close.`
                    : open
                      ? options.length > 0
                          ? `${options.length} tool${options.length === 1 ? '' : 's'}. Up and down to choose, Enter to insert, Escape to close.`
                          : 'No tools to insert. Enter opens Tools.'
                      : ''}
            </p>

            <ul className="text-muted-foreground grid gap-1 text-xs" data-testid="prompt-legend">
                <li>
                    Type <kbd className="bg-muted text-foreground rounded px-1 font-mono">/</kbd> to add a{' '}
                    <span className={cn('rounded-[3px] font-mono ring-2', TOOL_MARK)}>tool</span>: something the agent can do
                    on a call, like booking an appointment.
                </li>
                <li>
                    Type <kbd className="bg-muted text-foreground rounded px-1 font-mono">{'{{'}</kbd> to add a{' '}
                    <span className={cn('rounded-[3px] font-mono ring-2', VARIABLE_MARK)}>{'{{variable}}'}</span>: a blank
                    filled in on each call, like today&rsquo;s date or a contact&rsquo;s name.
                </li>
                <li>
                    <span className={cn('rounded-[3px] ring-2', PROBLEM_MARK)}>Underlined</span> words will not work as
                    written: point at them to see why.
                </li>
            </ul>

            {problems.length > 0 ? (
                <ul id={problemsId} className="grid gap-1" data-testid="prompt-tool-problems">
                    {problems.map(({ text, names }) => (
                        <li
                            key={text}
                            className="flex flex-wrap items-center gap-x-1.5 text-xs text-amber-700 dark:text-amber-400"
                            data-testid="prompt-tool-problem"
                        >
                            <TriangleAlert className="size-3.5 shrink-0" />
                            <span>
                                {names.map((name, i) => (
                                    <span key={name}>
                                        {i > 0 ? ', ' : null}
                                        <code className="font-mono">{name}</code>
                                    </span>
                                ))}
                                : {text}.
                            </span>
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs"
                                onClick={() => onOpenTools(tools.find((t) => t.name === names[0])?.kind ?? 'custom')}
                            >
                                Go to Tools
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}

            {emptyVariables.length > 0 ? (
                <p
                    className="flex flex-wrap items-center gap-x-1.5 text-xs text-amber-700 dark:text-amber-400"
                    data-testid="prompt-variable-problem"
                >
                    <Braces className="size-3.5 shrink-0" />
                    <span>
                        {emptyVariables.map((name, i) => (
                            <span key={name}>
                                {i > 0 ? ', ' : null}
                                <code className="font-mono">{`{{${name}}}`}</code>
                            </span>
                        ))}
                        : no default value, so {emptyVariables.length === 1 ? 'it is' : 'they are'} empty unless the call
                        brings one (a campaign column or a test call).
                    </span>
                    {onOpenVariables ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={onOpenVariables}
                        >
                            Add default values
                        </Button>
                    ) : null}
                </p>
            ) : null}
        </div>
    );
}
