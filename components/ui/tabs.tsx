"use client";

// Tabs, after originui's "Tabs" on 21st.dev (https://21st.dev/@originui/components/tabs), which wraps
// shadcn/ui Tabs over @radix-ui/react-tabs. Two looks, both rectangular:
// "segment" — a recessed track with a white active segment (filters);
// "rail"    — navigation items with an onyx active state (doctor sidebar / phone tab bar).
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "segment" | "rail";

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-2", className)} {...props} />;
}

const listStyles: Record<Variant, string> = {
  segment: "inline-flex items-center gap-0.5 rounded-btn bg-black/[0.055] p-[3px]",
  rail: "flex gap-1",
};

function TabsList({ className, variant = "segment", ...props }: ComponentProps<typeof TabsPrimitive.List> & { variant?: Variant }) {
  return <TabsPrimitive.List data-variant={variant} className={cn(listStyles[variant], className)} {...props} />;
}

const triggerStyles: Record<Variant, string> = {
  segment: cn(
    "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-ctl px-3 text-[13px] font-medium text-muted",
    "transition-[color,background-color,box-shadow] duration-150 hover:text-ink",
    "data-[state=active]:bg-white data-[state=active]:text-ink",
    "data-[state=active]:shadow-[0_0_0_0.5px_rgb(10_10_10/0.08),0_1px_3px_rgb(10_10_10/0.12)]",
  ),
  rail: cn(
    "group relative flex min-h-11 items-center justify-center gap-2.5 whitespace-nowrap rounded-btn px-3.5 text-[13.5px] font-medium text-graphite",
    "transition-[color,background-color] duration-200 hover:bg-black/[0.045] hover:text-ink",
    "lg:justify-start",
    "data-[state=active]:bg-onyx data-[state=active]:text-white data-[state=active]:hover:bg-onyx",
  ),
};

function TabsTrigger({ className, variant = "segment", ...props }: ComponentProps<typeof TabsPrimitive.Trigger> & { variant?: Variant }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "pressable cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        triggerStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

/**
 * A rail label that slides open when its tab is active (phones) and is always shown on desktop.
 * Animates grid-template-columns 0fr -> 1fr, so the width follows the text without measuring it.
 */
function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=active]:grid-cols-[1fr] lg:grid-cols-[1fr]">
      <span className="overflow-hidden">{children}</span>
    </span>
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

export { RailLabel, Tabs, TabsContent, TabsList, TabsTrigger };
