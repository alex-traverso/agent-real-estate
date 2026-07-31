"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fadeOnly, springSheet } from "@/lib/motion"
import { XIcon } from "lucide-react"

type SheetSide = "top" | "right" | "bottom" | "left"

// How far each side's panel travels in from, as a percentage of its own
// size — matches the old `slide-in-from-{side}-10` Tailwind classes but
// with a spring instead of a fixed-duration CSS animation.
const SHEET_OFFSET: Record<SheetSide, { x?: string; y?: string }> = {
  top: { y: "-100%" },
  bottom: { y: "100%" },
  left: { x: "-100%" },
  right: { x: "100%" },
}

// Mirrors DialogOpenContext (see dialog.tsx): lets SheetContent read the
// open state to drive AnimatePresence, whether the caller controls Sheet
// itself (MobileNav) or renders it uncontrolled.
const SheetOpenContext = React.createContext(false)

function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false
  )
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : uncontrolledOpen

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <SheetPrimitive.Root
      data-slot="sheet"
      open={isOpen}
      onOpenChange={handleOpenChange}
      {...props}
    >
      <SheetOpenContext.Provider value={isOpen}>
        {children}
      </SheetOpenContext.Provider>
    </SheetPrimitive.Root>
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      asChild
      forceMount
      data-slot="sheet-overlay"
      {...props}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fadeOnly}
        className={cn(
          "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
          className
        )}
      />
    </SheetPrimitive.Overlay>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide
  showCloseButton?: boolean
}) {
  const isOpen = React.useContext(SheetOpenContext)
  const reduced = useReducedMotion()
  const offset = SHEET_OFFSET[side]

  return (
    <SheetPortal forceMount>
      <AnimatePresence>
        {/* Overlay must live behind the same isOpen check as Content, as its
            own direct AnimatePresence child (see dialog.tsx's DialogContent
            for why forceMount + this isOpen gating is needed at all). */}
        {isOpen && <SheetOverlay />}
        {isOpen && (
          // Same forceMount + AnimatePresence + asChild composition as
          // DialogContent — see the comment there for why.
          <SheetPrimitive.Content
            asChild
            forceMount
            data-side={side}
            {...props}
          >
            <motion.div
              data-slot="sheet-content"
              initial={{ opacity: 0, ...(reduced ? {} : offset) }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, ...(reduced ? {} : offset) }}
              transition={reduced ? fadeOnly : springSheet}
              className={cn(
                "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
                className
              )}
            >
              {children}
              {showCloseButton && (
                <SheetPrimitive.Close data-slot="sheet-close" asChild>
                  <Button
                    variant="ghost"
                    className="absolute top-3 right-3"
                    size="icon-sm"
                  >
                    <XIcon
                    />
                    <span className="sr-only">Close</span>
                  </Button>
                </SheetPrimitive.Close>
              )}
            </motion.div>
          </SheetPrimitive.Content>
        )}
      </AnimatePresence>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
