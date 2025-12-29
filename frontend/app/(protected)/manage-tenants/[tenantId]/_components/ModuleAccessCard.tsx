'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type ModuleAccess, Modules, type SubModule } from '@aixellabs/shared/mongodb';
import {
    areAllSubModulesEnabled,
    areSomeSubModulesEnabled,
    getSubModulesForModule,
    toggleAllSubModules,
    toggleSubModule,
} from '@/helpers/module-access-helpers';
import { cn } from '@/lib/utils';
import { enumToPascalCase } from '@/helpers/string-helpers';
import { getModuleIcon } from '@/lib/icon-map';

type ModuleAccessCardProps = {
    moduleAccess: ModuleAccess;
    onChange: (moduleAccess: ModuleAccess) => void;
    className?: string;
};

export function ModuleAccessCard({ moduleAccess, onChange, className }: ModuleAccessCardProps) {
    const handleToggleSubModule = (module: Modules, subModule: SubModule) => {
        const newAccess = toggleSubModule(moduleAccess, module, subModule);
        onChange(newAccess);
    };

    const handleToggleAllSubModules = (module: Modules, enabled: boolean) => {
        const newAccess = toggleAllSubModules(moduleAccess, module, enabled);
        onChange(newAccess);
    };

    return (
        <Card className={cn('w-full', className)}>
            <CardHeader>
                <CardTitle>Module Access</CardTitle>
                <CardDescription>Configure which modules and features this user can access</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {Object.values(Modules).map((module) => {
                        const Icon = getModuleIcon(module);
                        const allEnabled = areAllSubModulesEnabled(moduleAccess, module);
                        const someEnabled = areSomeSubModulesEnabled(moduleAccess, module);
                        const subModules = getSubModulesForModule(module);
                        const enabledSubModules = moduleAccess[module] || [];

                        return (
                            <div key={module} className="space-y-3">
                                {/* Module Header with Toggle All */}
                                <div className="flex flex-wrap items-center justify-between pb-2 border-b">
                                    <div className="flex items-center gap-2">
                                        {Icon && <Icon className="h-5 w-5 text-primary" />}
                                        <h3 className="font-semibold text-base">{enumToPascalCase(module)}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id={`${module}-all`}
                                            checked={allEnabled}
                                            ref={(el) => {
                                                if (el) {
                                                    (el as any).indeterminate = someEnabled && !allEnabled;
                                                }
                                            }}
                                            onCheckedChange={(checked) => {
                                                handleToggleAllSubModules(module, checked === true);
                                            }}
                                        />
                                        <Label
                                            htmlFor={`${module}-all`}
                                            className="text-sm text-muted-foreground cursor-pointer"
                                        >
                                            {allEnabled ? 'Deselect All' : 'Select All'}
                                        </Label>
                                    </div>
                                </div>

                                {/* Submodules Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-7">
                                    {subModules.map((subModule) => {
                                        const isEnabled = (enabledSubModules as SubModule[]).includes(subModule);
                                        return (
                                            <Toggle
                                                key={subModule}
                                                pressed={isEnabled}
                                                onPressedChange={() => handleToggleSubModule(module, subModule)}
                                                variant="outline"
                                                className={cn(
                                                    'justify-start text-left h-auto py-2 px-3',
                                                    isEnabled && 'bg-primary/10 border-primary',
                                                )}
                                            >
                                                <span className="text-sm truncate">{enumToPascalCase(subModule)}</span>
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
