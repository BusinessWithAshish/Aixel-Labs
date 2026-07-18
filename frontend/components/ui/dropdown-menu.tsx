"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckIcon, ChevronRightIcon, CircleIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const dropdownMenuItemVariants = cva(
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground",
        primary:
          "text-primary focus:text-primary focus:bg-primary/10 data-highlighted:text-primary data-highlighted:bg-primary/10 dark:focus:bg-primary/15 dark:data-highlighted:bg-primary/15 [&_svg:not([class*='text-'])]:text-primary",
        warning:
          "text-amber-700 focus:text-amber-900 focus:bg-amber-500/15 data-highlighted:text-amber-900 data-highlighted:bg-amber-500/15 dark:text-amber-500 dark:focus:text-amber-100 dark:data-highlighted:text-amber-100 dark:focus:bg-amber-500/20 dark:data-highlighted:bg-amber-500/20 [&_svg:not([class*='text-'])]:text-amber-600 dark:[&_svg:not([class*='text-'])]:text-amber-500",
        destructive:
          "text-destructive focus:text-destructive focus:bg-destructive/10 data-highlighted:text-destructive data-highlighted:bg-destructive/10 dark:focus:bg-destructive/20 dark:data-highlighted:bg-destructive/20 [&_svg:not([class*='text-'])]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type DropdownMenuItemVariant = NonNullable<
  VariantProps<typeof dropdownMenuItemVariants>["variant"]
>

type DropdownMenuIcon = LucideIcon | React.ReactNode

type DropdownMenuOptionItem = {
  type?: "item"
  /** Stable key; falls back to index when omitted. */
  key?: string
  label: React.ReactNode
  icon?: DropdownMenuIcon
  variant?: DropdownMenuItemVariant
  disabled?: boolean
  inset?: boolean
  shortcut?: React.ReactNode
  className?: string
  /** Skip rendering this option. */
  hidden?: boolean
  onSelect?: (event: Event) => void
}

type DropdownMenuOptionSeparator = {
  type: "separator"
  key?: string
  hidden?: boolean
  className?: string
}

type DropdownMenuOptionLabel = {
  type: "label"
  key?: string
  label: React.ReactNode
  inset?: boolean
  hidden?: boolean
  className?: string
}

type DropdownMenuOption =
  | DropdownMenuOptionItem
  | DropdownMenuOptionSeparator
  | DropdownMenuOptionLabel

function renderDropdownMenuIcon(icon?: DropdownMenuIcon) {
  if (!icon) return null
  if (React.isValidElement(icon)) return icon
  const Icon = icon as LucideIcon
  return <Icon className="size-4" />
}

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
      className={cn(
        "cursor-pointer",
        props.className
      )}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  icon,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> &
  VariantProps<typeof dropdownMenuItemVariants> & {
    inset?: boolean
    icon?: DropdownMenuIcon
  }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(dropdownMenuItemVariants({ variant }), className)}
      {...props}
    >
      {renderDropdownMenuIcon(icon)}
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

/**
 * Renders menu entries from option descriptors (items, labels, separators).
 * Keep special cases (e.g. submenus) composed beside this in the content tree.
 */
function DropdownMenuItems({ options }: { options: DropdownMenuOption[] }) {
  return options.map((option, index) => {
    if (option.hidden) return null

    const key = option.key ?? String(index)

    if (option.type === "separator") {
      return <DropdownMenuSeparator key={key} className={option.className} />
    }

    if (option.type === "label") {
      return (
        <DropdownMenuLabel
          key={key}
          inset={option.inset}
          className={option.className}
        >
          {option.label}
        </DropdownMenuLabel>
      )
    }

    return (
      <DropdownMenuItem
        key={key}
        variant={option.variant}
        icon={option.icon}
        disabled={option.disabled}
        inset={option.inset}
        className={option.className}
        onSelect={option.onSelect}
      >
        {option.label}
        {option.shortcut ? (
          <DropdownMenuShortcut>{option.shortcut}</DropdownMenuShortcut>
        ) : null}
      </DropdownMenuItem>
    )
  })
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuItems,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  dropdownMenuItemVariants,
  type DropdownMenuIcon,
  type DropdownMenuItemVariant,
  type DropdownMenuOption,
  type DropdownMenuOptionItem,
  type DropdownMenuOptionLabel,
  type DropdownMenuOptionSeparator,
}
