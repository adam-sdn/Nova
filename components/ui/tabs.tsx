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
  // Phones: icon only, the active item grows into an onyx pill with its label.
  // Desktop: a compact sidebar list, icon + label, active item as an onyx pill.
  rail: cn(
    "group relative flex min-h-12 items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-4 text-[14px] font-medium text-graphite",
    "transition-[color,background-color,box-shadow,flex-grow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-black/[0.04]",
    "lg:justify-start lg:px-4",
    "data-[state=active]:bg-onyx data-[state=active]:text-white data-[state=active]:shadow-[0_8px_18px_-8px_rgb(10_10_10/0.55)] data-[state=active]:hover:bg-onyx",
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
