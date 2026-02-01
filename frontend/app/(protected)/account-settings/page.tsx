'use client'

import PageLayout from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ZodSelectField } from "@/components/common/zod-form-builder";
import { useThemeColor, ThemeColor } from "@/hooks/use-theme-color";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

export default function AccountSettingsPage() {
    const { themeColor, setThemeColor, mounted } = useThemeColor();
    const { theme, setTheme } = useTheme();

    const themeColorOptions = [
        {
            label: 'Default (Purple)',
            value: ThemeColor.DEFAULT
        },
        {
            label: 'Blue',
            value: ThemeColor.BLUE
        },
        {
            label: 'Rose',
            value: ThemeColor.ROSE
        },
        {
            label: 'Green',
            value: ThemeColor.GREEN
        }
    ];

    const themeModeOptions = [
        {
            label: 'Light',
            value: 'light',
            icon: Sun
        },
        {
            label: 'Dark',
            value: 'dark',
            icon: Moon
        },
        {
            label: 'System',
            value: 'system',
            icon: Monitor
        },
    ];

    const handleThemeColorChange = (color: string) => {
        setThemeColor(color as ThemeColor);
    };

    const handleThemeModeChange = (mode: string) => {
        setTheme(mode);
    };

    if (!mounted) return null;

    return (
        <PageLayout title="Account Settings">
            <Card>
                <CardHeader>
                    <CardTitle>Your account settings & application preferences</CardTitle>
                    <CardDescription>Change and manage your settings for your account.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-lg font-medium">Appearance</h3>
                        <p className="text-sm text-muted-foreground">
                            Customize how the application looks and feels.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <ZodSelectField
                            name='theme-color'
                            label='Theme Color'
                            description="Select your preferred color theme"
                            options={themeColorOptions}
                            value={themeColor}
                            onChange={handleThemeColorChange}
                        />

                        <ZodSelectField
                            name='theme-mode'
                            label='Theme Mode'
                            description="Select light, dark, or system theme mode"
                            options={themeModeOptions}
                            value={theme || 'system'}
                            onChange={handleThemeModeChange}
                        />
                    </div>

                    <div className="rounded-lg border p-4 bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                            <strong>Tip:</strong> The theme mode (light/dark/system) automatically applies to your selected color theme.
                            Try switching between modes to see how your chosen color adapts!
                        </p>
                    </div>
                </CardContent>
            </Card>
        </PageLayout>
    )
}