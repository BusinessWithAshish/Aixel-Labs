import { cn } from '@/lib/utils';

type CommonLoaderProps = {
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    text?: string;
    fullScreen?: boolean;
    className?: string;
};

const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    '2xl': 'h-20 w-20',
};

const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
};

export function CommonLoader({ size = 'md', text, fullScreen = false, className }: CommonLoaderProps) {
    const content = (
        <div className={cn('flex flex-col w-full items-center justify-center gap-3 h-full', className)}>
            <div className={cn('animate-spin rounded-full border-b-2 border-primary', sizeClasses[size])} />
            {text && <p className={cn('text-muted-foreground animate-pulse', textSizeClasses[size])}>{text}</p>}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
                {content}
            </div>
        );
    }

    return content;
}
