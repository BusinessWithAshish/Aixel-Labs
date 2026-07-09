'use client';

import { ZodColorPicker, ZodSelectField } from '@/components/common/zod-form-builder';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTheme } from 'next-themes';
import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { useTenantBranding } from '@/contexts/TenantBranding';
import { Button } from '@/components/ui/button';

export function AppearanceSettings() {
    const { defaultThemeColor } = useTenantBranding();
    const { themeColor, setThemeColor } = useThemeColor();
    const { theme, setTheme } = useTheme();

    const themeModeOptions = [
        {
            label: 'Light',
            value: 'light',
            icon: <Sun className="size-4" />,
        },
        {
            label: 'Dark',
            value: 'dark',
            icon: <Moon className="size-4" />,
        },
        {
            label: 'System',
            value: 'system',
            icon: <Monitor className="size-4" />,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">Customize how the application looks and feels.</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-end gap-2">
                    <ZodColorPicker
                        name="theme-color"
                        label="Theme Color"
                        description="Pick a custom accent color for buttons, focus rings, and the sidebar."
                        value={themeColor ?? defaultThemeColor}
                        onChange={setThemeColor}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        title="Reset to tenant default"
                        onClick={() => setThemeColor(defaultThemeColor)}
                        disabled={themeColor === defaultThemeColor}
                    >
                        <RotateCcw className="size-4" />
                    </Button>
                </div>

                <ZodSelectField
                    name="theme-mode"
                    label="Theme Mode"
                    description="Select light, dark, or system theme mode"
                    options={themeModeOptions}
                    value={theme ?? 'system'}
                    onChange={setTheme}
                    suppressSelectValueHydrationWarning
                />
            </div>

            <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                    <strong>Tip:</strong> The theme mode (light/dark/system) automatically applies to your selected
                    color theme. Try switching between modes to see how your chosen color adapts!
                </p>
            </div>
        </div>
    );
}
