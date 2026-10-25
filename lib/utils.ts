import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the project's radius tokens (rounded-ctl / -btn / -card / -panel in globals.css),
// so a caller's radius replaces a component's default instead of both applying.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ["ctl", "btn", "card", "panel"] } } });

/** Merge class names; later Tailwind classes win over earlier ones (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
