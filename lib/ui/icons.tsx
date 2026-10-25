// Icons copied from the approved mockups (docs/design). Always decorative: the label carries the meaning.
import type { ReactNode } from "react";

function Icon({ size = 12, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const TriangleIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </Icon>
);

export const ClockIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const ArrowIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);

export const MicIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const BubbleIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
  </Icon>
);

export const ChevronUpIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m6 15 6-6 6 6" />
  </Icon>
);

export const DotIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
  </Icon>
);

export const CheckIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);

export const PhoneIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </Icon>
);

export const BoardIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M15 4v16" />
  </Icon>
);

export const StethoscopeIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 4v6a4 4 0 0 0 8 0V4" />
    <path d="M9 18a4 4 0 0 0 4-4v-2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="9" cy="18" r="3" />
  </Icon>
);

/** The Care Loop mark from the mockup header. */
export const LoopMark = () => (
  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12A8 8 0 0 1 17.7 6.4" />
      <path d="M18 3v4h-4" />
      <path d="M6 21v-4h4" />
    </svg>
  </div>
);
