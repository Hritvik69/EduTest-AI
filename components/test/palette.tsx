export function Palette({ total }: { total: number }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: total }, (_, index) => (
        <button
          key={index}
          className="h-9 rounded-lg border border-white/10 bg-white/[0.035] text-sm text-slate-300"
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}
