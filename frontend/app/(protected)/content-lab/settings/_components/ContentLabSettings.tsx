'use client';

import { Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_COUNTRIES, CONTENT_LAB_LANGUAGES } from '../../_constants';
import type { UseContentLabSettingsPageReturn } from '../_hooks/use-content-lab-settings-page';
import { AccountsSection } from './AccountsSection';
import { AiKeySection } from './AiKeySection';

function DefaultsSection() {
    const page = usePage<UseContentLabSettingsPageReturn>();
    const { form } = page;

    return (
        <Card className="h-auto gap-4" aria-labelledby="content-lab-defaults">
            <CardHeader>
                <CardTitle id="content-lab-defaults" className="flex items-center gap-2">
                    <Globe className="text-muted-foreground size-4" /> Defaults
                </CardTitle>
                <CardDescription>New boards start with this country for results and this language for drafts.</CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="grid gap-4"
                    aria-label="Defaults"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void page.save();
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="default-country">Country</Label>
                            <Select value={form.country} onValueChange={page.setCountry}>
                                <SelectTrigger id="default-country" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTENT_LAB_COUNTRIES.map(({ code, label }) => (
                                        <SelectItem key={code} value={code}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="default-language">Language</Label>
                            <Select value={form.language} onValueChange={page.setLanguage}>
                                <SelectTrigger id="default-language" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTENT_LAB_LANGUAGES.map((language) => (
                                        <SelectItem key={language} value={language}>
                                            {language}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button type="submit" className="w-fit" disabled={page.saving}>
                        {page.saving ? <Loader2 className="animate-spin" /> : null} Save defaults
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

/** Full-width settings: accounts across the top, then the AI key and the defaults side by side on wide screens. */
export function ContentLabSettings() {
    return (
        <div className="grid w-full min-w-0 gap-5 p-1 sm:p-2 xl:grid-cols-2">
            <div className="min-w-0 xl:col-span-2">
                <AccountsSection />
            </div>
            <div className="min-w-0">
                <AiKeySection />
            </div>
            <div className="min-w-0">
                <DefaultsSection />
            </div>
        </div>
    );
}
