export default function CreateTestLoading() {
  return (
    <main className="min-h-screen bg-background pb-16 text-slate-100">
      <header className="border-b border-white/10 bg-[#0a0e1a]/90">
        <div className="safe-container flex min-h-[72px] items-center justify-between gap-4">
          <div className="h-5 w-32 rounded bg-white/10" />
          <div className="h-10 w-28 rounded-lg bg-white/10" />
        </div>
      </header>
      <div className="safe-container pt-8">
        <div className="grid gap-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex flex-col items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-blue-400/20" />
              <div className="h-4 w-24 rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-5xl rounded-lg border border-white/10 bg-card/80 p-7">
          <div className="h-8 w-64 rounded bg-white/10" />
          <div className="mt-4 h-5 max-w-xl rounded bg-white/10" />
          <div className="mt-8 h-72 rounded-lg border border-dashed border-white/15 bg-white/[0.035]" />
          <div className="mt-8 flex justify-between border-t border-white/10 pt-5">
            <div className="h-11 w-24 rounded-lg bg-white/10" />
            <div className="h-11 w-32 rounded-lg bg-blue-400/25" />
          </div>
        </div>
      </div>
    </main>
  );
}
