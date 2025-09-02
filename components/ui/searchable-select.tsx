"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

type OptionType = {
    value: string
    label: string
}

type SearchableSelectProps = {
    options: OptionType[]
    placeholder?: string
    disabled?: boolean
    value?: string          // controlled selected value
    onChange?: (val: string) => void // callback when selected
    className?: string
}

export function SearchableSelect({
                                     options,
                                     placeholder = "Select option...",
                                     value,
    disabled = false,
                                     onChange,
                                     className,
                                 }: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false)

    const selectedLabel = options.find((o) => o.value === value)?.label

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-[200px] justify-between", className)}
                >
                    {selectedLabel ?? placeholder}
                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command
                    filter={(value, search) => {
                        if (!search) return 1
                        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }}
                >
                    <CommandInput disabled={disabled} placeholder="Search option..." />
                    <CommandList>
                        <CommandEmpty>No option found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    onSelect={() => {
                                        onChange?.(option.value)
                                        setOpen(false)
                                    }}
                                >
                                    <CheckIcon
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}