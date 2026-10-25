"use client";

// Dialog: the shadcn/ui Dialog (over @radix-ui/react-dialog) used across 21st.dev's dashboard-ui-design
// collection, restyled as a Liquid Glass sheet over a blurred scrim. Focus trap, Escape and
// aria wiring come from Radix.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-50 bg-[rgb(10_10_10/0.24)] backdrop-blur-[4px]" />
      <DialogPrimitive.Content
        className={cn(
          "dialog-content fixed border border-white/70 bg-white/[0.96] shadow-[0_24px_60px_-20px_rgb(10_10_10/0.35)] backdrop-blur-xl left-1/2 top-1/2 z-50 flex w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-panel p-6",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="btn-glass absolute right-4 top-4 grid size-9 place-items-center rounded-ctl text-muted hover:text-ink"
          aria-label="Close"
        >
          <X size={16} aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-10 text-[18px] font-semibold tracking-tight", className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-[14px] leading-relaxed text-muted", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger };
