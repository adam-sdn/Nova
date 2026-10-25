"use client";

import Link from "next/link";
import { BoardIcon, DemoTag, NovaLogo, PhoneIcon, StethoscopeIcon } from "@/lib/ui";

const ROLES = [
  {
    href: "/patient",
    title: "Patient",
    body: "Phone-width window: check-in, status, enquiries, results pack.",
    size: "width=420,height=860",
    icon: PhoneIcon,
  },
  {
    href: "/nurse",
    title: "Nurse",
    body: "Four-stage board, patient overview, escort requests, enquiries inbox.",
    size: "width=1760,height=1000",
    icon: BoardIcon,
  },
  {
    href: "/doctor",
    title: "Doctor",
    body: "Home, follow-ups and settings; AI-filled clinical assessment.",
    size: "width=1400,height=950",
    icon: StethoscopeIcon,
  },
] as const;

export default function Onboarding() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[920px]">
        <div className="glass-strong appear flex flex-col gap-8 rounded-panel p-6 sm:p-10">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex flex-col gap-2">
                <h1 className="m-0">
                  <NovaLogo height={58} />
                </h1>
                <p className="text-[14px] text-muted">Open each role in its own window</p>
              </div>
            </div>
            <DemoTag />
          </header>

          <ul className="grid gap-4 sm:grid-cols-3">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.href}>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener"
                    data-testid={`role-${r.title.toLowerCase()}`}
                    onClick={(e) => {
                      // A named popup per role, so each opens in its own window and re-clicks reuse it.
                      const w = window.open(r.href, `care-loop-${r.title.toLowerCase()}`, r.size);
                      if (w) e.preventDefault();
                    }}
                    className="group liftable surface flex h-full min-h-[200px] flex-col gap-3 rounded-card p-5"
                  >
                    <div
                      className="grid size-9 place-items-center rounded-btn border border-black/[0.1] text-ink transition-colors duration-200 group-hover:border-onyx group-hover:bg-onyx group-hover:text-white"
                      aria-hidden="true"
                    >
                      <Icon size={17} />
                    </div>
                    <span className="text-[17px] font-semibold tracking-tight">{r.title}</span>
                    <span className="text-sm leading-relaxed text-muted">{r.body}</span>
                    <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink">
                      Open in a new window <span className="nudge" aria-hidden="true">→</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          <p className="text-sm">
            <Link href="/demo" className="font-semibold text-accent-ink underline underline-offset-2">
              Demo controls
            </Link>
            <span className="text-muted"> · Reset, Seed, simulate arrivals, toggle MOCK_AI</span>
          </p>
        </div>
      </div>
    </main>
  );
}
