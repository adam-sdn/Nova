import { DemoTag, LoopMark } from "./index";

/** Stage 0 placeholder for a role screen. Each worktree replaces its own page. */
export function Placeholder({ title, owner }: { title: string; owner: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LoopMark />
          <h1 className="text-lg font-semibold">Care Loop · {title}</h1>
        </div>
        <DemoTag />
      </header>
      <p className="text-sm text-muted">
        Placeholder. This screen is built in the <span className="font-mono">{owner}</span> worktree (see
        docs/PARALLEL_PLAN.md).
      </p>
    </main>
  );
}
