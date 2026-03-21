import { useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { SelectContent, SelectItem } from "../ui/select"
import { OptionType } from "../ui/searchable-select"

type VirtualizedSelectProps = {
    options: OptionType[]
    estimateSize?: number
    maxHeight?: number
    overscan?: number
}

export const VirtualizedSelectContent = ({
    options,
    estimateSize = 35,
    maxHeight = 300,
    overscan = 5,
}: VirtualizedSelectProps) => {
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

    const virtualizer = useVirtualizer({
        count: options.length,
        getScrollElement: () => scrollEl,
        estimateSize: () => estimateSize,
        overscan,
    })

    return (
        <SelectContent>
            <div ref={setScrollEl} style={{ maxHeight, overflowY: "auto" }}>
                <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                        const option = options[virtualItem.index]
                        return (
                            <SelectItem
                                key={virtualItem.key}
                                data-index={virtualItem.index}
                                value={option.value}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: `${virtualItem.size}px`,
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                {option.label}
                            </SelectItem>
                        )
                    })}
                </div>
            </div>
        </SelectContent>
    )
}
