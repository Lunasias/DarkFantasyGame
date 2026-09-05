export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-4 py-1 text-xs uppercase tracking-widest text-zinc-400">
          Phase 0 · Foundation
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          DarkFantasyGame
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-400">
          An original, browser-based, online dark-fantasy turn-based RPG board
          game. Strategic, cooperative and competitive, with persistent
          progression.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-5 py-2 text-sm text-zinc-300">
            Next.js · React · TypeScript
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-5 py-2 text-sm text-zinc-300">
            Drizzle · Neon PostgreSQL
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-5 py-2 text-sm text-zinc-300">
            Three.js · React Three Fiber
          </span>
        </div>
      </div>
    </main>
  );
}
