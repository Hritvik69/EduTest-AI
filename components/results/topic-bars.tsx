"use client";

export function TopicBars({
  topics,
  onTopicClick,
}: {
  topics: { topic: string; accuracy: number }[];
  onTopicClick?: (topic: string) => void;
}) {
  if (!topics.length) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
        No topic analytics yet.
      </div>
    );
  }

  return (
    <div className="min-w-[320px] space-y-3">
      {topics.map((topic) => (
        <button
          key={topic.topic}
          type="button"
          onClick={() => onTopicClick?.(topic.topic)}
          className="block w-full rounded-lg p-1 text-left transition hover:bg-white/[0.04]"
        >
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold text-slate-200">{topic.topic}</span>
            <span className="text-white">{topic.accuracy}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${topic.accuracy}%`,
                backgroundColor: barColor(topic.accuracy),
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function barColor(accuracy: number) {
  if (accuracy >= 70) return "#34d399";
  if (accuracy >= 50) return "#fbbf24";
  return "#f87171";
}
