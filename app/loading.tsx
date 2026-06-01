export default function Loading() {
  return (
    <main className="min-h-screen bg-background text-slate-100">
      <header className="border-b border-white/10 bg-[#0a0e1a]/90">
        <div className="safe-container flex h-[72px] items-center justify-between">
          <div className="h-5 w-32 rounded bg-white/10" />
          <div className="hidden h-10 w-40 rounded-lg bg-white/10 md:block" />
        </div>
      </header>
      <section className="safe-container py-16">
        <div className="h-7 w-48 rounded-full bg-blue-400/15" />
        <div className="mt-8 h-16 max-w-3xl rounded bg-white/10" />
        <div className="mt-4 h-16 max-w-2xl rounded bg-white/10" />
        <div className="mt-8 flex gap-3">
          <div className="h-12 w-44 rounded-lg bg-blue-400/25" />
          <div className="h-12 w-40 rounded-lg bg-white/10" />
        </div>
      </section>
    </main>
  );
}
