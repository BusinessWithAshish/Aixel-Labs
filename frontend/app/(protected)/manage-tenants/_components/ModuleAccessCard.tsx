'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type ModuleAccess, Modules, type SubModule } from '@aixellabs/backend/db/types';
import {
    areAllSubModulesEnabled,
    areSomeSubModulesEnabled,
    getSubModulesForModule,
    toggleAllSubModules,
    toggleSubModule,
} from '@/helpers/module-access-helpers';
import { cn } from '@/lib/utils';
import { enumToTitleCase } from '@/helpers/string-helpers';
import { modulesIconMap } from '@/config/sidebar.config';

type ModuleAccessCardProps = {
    /**
     * Full module access map for the user.
     * Can be undefined/null when the user has no module access configured yet.
     */
    moduleAccess?: ModuleAccess | null;
    onChange?: (moduleAccess: ModuleAccess) => void;
    /** When true, checkboxes/toggles are display-only. */
    readOnly?: boolean;
    title?: string;
    description?: string;
    className?: string;
};

export function ModuleAccessCard({
    moduleAccess,
    onChange,
    readOnly = false,
    title = 'Module Access',
    description = 'Configure which modules and features this user can access',
    className,
}: ModuleAccessCardProps) {
    const effectiveModuleAccess = (moduleAccess ?? {}) as ModuleAccess;

    const handleToggleSubModule = (module: Modules, subModule: SubModule) => {
        if (readOnly || !onChange) return;
        onChange(toggleSubModule(effectiveModuleAccess, module, subModule));
    };

    const handleToggleAllSubModules = (module: Modules, enabled: boolean) => {
        if (readOnly || !onChange) return;
        onChange(toggleAllSubModules(effectiveModuleAccess, module, enabled));
    };

    return (
        <Card className={cn('h-auto w-full', className)}>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {Object.values(Modules).map((module) => {
                        const Icon = modulesIconMap[module as Modules];
                        const allEnabled = areAllSubModulesEnabled(effectiveModuleAccess, module);
                        const someEnabled = areSomeSubModulesEnabled(effectiveModuleAccess, module);
                        const subModules = getSubModulesForModule(module);
                        const enabledSubModules = effectiveModuleAccess[module] || [];

                        return (
                            <div key={module} className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between pb-2 border-b">
                                    <div className="flex items-center gap-2">
                                        {Icon && <Icon className="h-5 w-5 text-primary" />}
                                        <h3 className="font-semibold text-base">{enumToTitleCase(module)}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!readOnly && (
                                            <Label
                                                htmlFor={`${module}-all`}
                                                className="text-sm text-muted-foreground cursor-pointer"
                                            >
                                                {allEnabled ? 'Deselect All' : 'Select All'}
                                            </Label>
                                        )}
                                        <Checkbox
                                            id={`${module}-all`}
                                            checked={allEnabled}
                                            disabled={readOnly}
                                            ref={(el) => {
                                                if (el) {
                                                    (el as HTMLInputElement).indeterminate =
                                                        someEnabled && !allEnabled;
                                                }
                                            }}
                                            onCheckedChange={(checked) => {
                                                handleToggleAllSubModules(module, checked === true);
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-7">
                                    {subModules.map((subModule) => {
                                        const isEnabled = (enabledSubModules as SubModule[]).includes(subModule);
                                        return (
                                            <Toggle
                                                key={subModule}
                                                pressed={isEnabled}
                                                disabled={readOnly}
                                                onPressedChange={() => handleToggleSubModule(module, subModule)}
                                                variant="outline"
                                                className={cn(
                                                    'justify-start text-left h-auto py-2 px-3',
                                                    isEnabled && 'bg-primary/10 border-primary',
                                                    readOnly && 'pointer-events-none',
                                                )}
                                            >
                                                <span className="text-sm truncate">{enumToTitleCase(subModule)}</span>
                                            </Toggle>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
