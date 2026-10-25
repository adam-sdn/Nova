"use client";

// The moving background behind the nurse and doctor dashboards: WaveLines (21st.dev) in a fixed,
// viewport-sized layer under the page content. Lines are drawn in slate at low opacity and faded at
// the edges, so they read as texture under the glass bars and never compete with clinical content
// (which sits on solid surfaces). Stands still under prefers-reduced-motion.
import { WaveLines } from "./wave-lines";

export function DashboardBackdrop() {
  return (
    <div aria-hidden="true" data-testid="dashboard-backdrop" className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden">
      <WaveLines
        lines={30}
        amplitude={34}
        speed={0.55}
        trackWindow
        className="text-slate opacity-70 [mask-image:radial-gradient(120%_90%_at_50%_40%,black_35%,transparent_85%)]"
      />
    </div>
  );
}
