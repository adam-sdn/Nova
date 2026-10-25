"use client";

// Tabs, after originui's "Tabs" on 21st.dev (https://21st.dev/@originui/components/tabs), which wraps
// shadcn/ui Tabs over @radix-ui/react-tabs. Two looks: "pill" (a recessed glass track with a raised
// active segment) and "rail" (vertical icon + label items for the floating side navigation).
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "pill" | "rail";

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-2", className)} {...props} />;
}

const listStyles: Record<Variant, string> = {
  pill: "inline-flex items-center gap-1 rounded-full bg-[rgb(16_32_48/0.06)] p-1 shadow-[inset_0_1px_2px_rgb(16_32_48/0.08)]",
  rail: "flex gap-1",
};

function TabsList({ className, variant = "pill", ...props }: ComponentProps<typeof TabsPrimitive.List> & { variant?: Variant }) {
  return <TabsPrimitive.List data-variant={variant} className={cn(listStyles[variant], className)} {...props} />;
}

const triggerStyles: Record<Variant, string> = {
  pill: cn(
    "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold text-muted",
    "transition-[color,background-color,box-shadow] duration-200 hover:text-ink",
    "data-[state=active]:bg-white data-[state=active]:text-accent-ink",
    "data-[state=active]:shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(16_32_48/0.1),0_4px_12px_-2px_rgb(16_32_48/0.14)]",
  ),
  rail: cn(
    "relative flex min-h-11 items-center justify-center gap-1 rounded-[16px] px-3 text-[12px] font-semibold text-muted",
    "transition-[color,background-color,box-shadow] duration-200 hover:bg-white/50 hover:text-ink",
    "flex-col whitespace-nowrap py-2 lg:min-h-[64px] lg:w-[88px]",
    "data-[state=active]:bg-white data-[state=active]:text-accent-ink",
    "data-[state=active]:shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(16_32_48/0.1),0_6px_16px_-4px_rgb(16_32_48/0.16)]",
  ),
};

function TabsTrigger({ className, variant = "pill", ...props }: ComponentProps<typeof TabsPrimitive.Trigger> & { variant?: Variant }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        triggerStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
