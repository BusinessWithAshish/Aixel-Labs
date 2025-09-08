import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import React, {ReactNode} from "react";
import * as LabelPrimitive from "@radix-ui/react-label"
import {cn} from "@/lib/utils";

type InputWithLabelProps = {
    forId: string;
    className?: string;
    input?: React.ComponentProps<"input">
    label: React.ComponentProps<typeof LabelPrimitive.Root> & { text: ReactNode }
}

export const InputWithLabel = (props: InputWithLabelProps) => {

    return (
        <div className={cn("grid w-full items-center gap-3", props.className)}>
            <Label htmlFor={props.forId} {...props.label}>{props.label.text}</Label>
            <Input id={props.forId} {...props.input} />
        </div>
    )
}