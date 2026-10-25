"use client";

import Link from "next/link";
import { DemoTag, LoopMark } from "@/lib/ui";

const ROLES = [
  { href: "/patient", title: "Patient", body: "Phone-width window: check-in, status, enquiries, results pack.", size: "width=420,height=860" },
  { href: "/nurse", title: "Nurse", body: "Four-stage board, patient overview, escort requests, enquiries inbox.", size: "width=1760,height=1000" },
  { href: "/doctor", title: "Doctor", body: "Home, follow-ups and settings; AI-filled clinical assessment.", size: "width=1400,height=950" },
] as const;

export default function Onboarding() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LoopMark />
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Care Loop</h1>
            <p className="text-[14px] text-muted">Open each role in its own window</p>
          </div>
        </div>
        <DemoTag />
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {ROLES.map((r) => (
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
              className="glass liftable flex min-h-40 flex-col gap-2 rounded-[24px] p-6"
            >
              <span className="text-[17px] font-semibold tracking-tight">{r.title}</span>
              <span className="text-sm leading-relaxed text-muted">{r.body}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink">Open in a new window →</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm">
        <Link href="/demo" className="font-semibold text-accent underline underline-offset-2">
          Demo controls
        </Link>
        <span className="text-muted"> · Reset, Seed, simulate arrivals, toggle MOCK_AI</span>
      </p>
    </main>
  );
}
