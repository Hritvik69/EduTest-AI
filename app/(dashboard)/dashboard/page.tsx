"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BrandLogo } from "@/components/brand-logo";
import { TopicBars } from "@/components/results/topic-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchApiData } from "@/lib/api-client";
import { useIsClient } from "@/lib/use-is-client";
import type { BloomLevel } from "@/types";

interface Summary {
  papersCreated: number;
  attemptsCompleted: number;
  averageScore: number;
  competencyScore: number;
  dayStreak?: number;
  weakTopics: string[];
  strongTopics: string[];
  weakTopicDetails?: { topic: string; accuracy: number; attempts: number }[];
  recentAttempts?: {
    attemptId: number | string;
    paperId: number | string;
    title?: string;
    subject: string;
    classNum: number;
    percentage: number;
    completedAt: string;
  }[];
  subjectCards?: {
    subject: string;
    tests: number;
    average: number;
    scores: number[];
  }[];
  bloomScores: Partial<Record<BloomLevel, number>>;
}

interface PaperRow {
  id: number;
  title?: string;
  subject: string;
  classNum: number;
  totalMarks: number;
  duration: number;
  status: "READY" | "ATTEMPTED" | "GENERATING" | "FAILED";
  latestAttemptId?: number | null;
  latestPercentage?: number | null;
  isOwner?: boolean;
  createdAt: string;
}

interface UserProfile {
  name?: string | null;
  image?: string | null;
  email?: string | null;
  isGuest?: boolean;
}

export default function DashboardPage() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [papers, setPapers] = React.useState<PaperRow[]>([]);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [subjectFilter, setSubjectFilter] = React.useState("All");
  const [deletingPaperId, setDeletingPaperId] = React.useState<number | null>(null);
  const mounted = useIsClient();

  React.useEffect(() => {
    fetchApiData<Summary>(
      "/api/analytics/summary",
      undefined,
      "Could not load analytics.",
    )
      .then((payload) => setSummary(payload))
      .catch(() => setSummary(null));

    fetchApiData<{ papers: PaperRow[] }>(
      "/api/papers",
      undefined,
      "Could not load papers.",
    )
      .then((payload) => {
        setPapers(payload.papers ?? []);
      })
      .catch(() => setPapers([]));

    fetchApiData<{ user: UserProfile }>("/api/me", undefined, "Could not load profile.")
      .then((payload) => {
        setProfile(payload.user);
      })
      .catch(() => {
        setProfile(null);
      });
  }, []);

  const subjects = React.useMemo(
    () => ["All", ...Array.from(new Set((summary?.recentAttempts ?? []).map((item) => item.subject)))],
    [summary?.recentAttempts],
  );
  const performanceData = (summary?.recentAttempts ?? [])
    .filter((attempt) => subjectFilter === "All" || attempt.subject === subjectFilter)
    .map((attempt, index) => ({
      name: `T${index + 1}`,
      score: attempt.percentage,
    }));
  const createTestHref = "/create-test";

  async function deletePaper(paper: PaperRow) {
    if (
      !window.confirm(
        `Delete "${paper.title ?? `${paper.subject} Paper`}" from your dashboard?`,
      )
    ) {
      return;
    }

    setDeletingPaperId(paper.id);
    try {
      await fetchApiData<{ deleted: boolean }>(
        `/api/papers/${paper.id}`,
        { method: "DELETE" },
        "Could not delete paper.",
      );
      setPapers((current) => current.filter((item) => item.id !== paper.id));
      setSummary((current) =>
        current
          ? {
              ...current,
              papersCreated: Math.max(0, current.papersCreated - 1),
            }
          : current,
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not delete paper.",
      );
    } finally {
      setDeletingPaperId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-12 text-slate-100">
      <header className="border-b border-white/10 bg-[#0a0e1a]/90 backdrop-blur">
        <div className="safe-container flex min-h-[72px] items-center justify-between gap-4">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href={createTestHref}>
                <Plus className="h-4 w-4" />
                Create Test
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="safe-container pt-8">
        <section className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="flex items-center gap-4">
            {profile?.image ? (
              <div
                aria-hidden
                className="h-14 w-14 rounded-lg border border-white/10 bg-cover bg-center"
                style={{ backgroundImage: `url(${profile.image})` }}
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-blue-500/10 text-lg font-extrabold text-blue-100">
                {displayName(profile).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-extrabold text-white">
                Welcome back, {firstName(profile)}!
              </h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <CalendarDays className="h-4 w-4" />
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "full",
                }).format(new Date())}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric icon={FileText} label="Papers Created" value={String(summary?.papersCreated ?? 0)} />
          <Metric icon={CheckCircle2} label="Tests Attempted" value={String(summary?.attemptsCompleted ?? 0)} />
          <Metric icon={BarChart3} label="Avg Score" value={`${summary?.averageScore ?? 0}%`} />
          <Metric icon={Flame} label="Day Streak" value={`${summary?.dayStreak ?? 0}`} />
        </section>

        <section className="mt-5 rounded-lg border border-blue-300/20 bg-blue-500/10 p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-white">Create New Test Paper</h2>
              <p className="mt-2 text-sm text-blue-100">
                60 seconds. Any chapter. Any format.
              </p>
            </div>
            <Button asChild>
              <Link href={createTestHref}>
                Start Creating
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
              <h2 className="text-lg font-extrabold text-white">Shared Papers</h2>
              <Badge>{papers.length} stored</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Paper</th>
                    <th className="px-5 py-3">Marks</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((paper) => (
                    <tr key={paper.id} className="border-b border-white/10 last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">
                          {paper.title ?? `${paper.subject} Paper`}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Class {paper.classNum} | {paper.subject}
                        </p>
                      </td>
                      <td className="px-5 py-4">{paper.totalMarks}</td>
                      <td className="px-5 py-4">
                        <StatusBadge paper={paper} />
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {new Date(paper.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/test/${paper.id}`}>
                              <Play className="h-3.5 w-3.5" />
                              Take
                            </Link>
                          </Button>
                          {paper.latestAttemptId ? (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/results/${paper.latestAttemptId}`}>Results</Link>
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/papers/${paper.id}/preview`}>
                              <Search className="h-3.5 w-3.5" />
                              Preview
                            </Link>
                          </Button>
                          {paper.isOwner !== false ? (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deletingPaperId === paper.id}
                              onClick={() => void deletePaper(paper)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingPaperId === paper.id ? "Deleting" : "Delete"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!papers.length ? (
                    <tr>
                      <td className="px-5 py-10 text-center text-slate-400" colSpan={5}>
                        No shared papers yet. Create a paper and it will appear here.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-white">Performance</h2>
              <select
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white"
              >
                {subjects.map((subject) => (
                  <option key={subject}>{subject}</option>
                ))}
              </select>
            </div>
            <div className="h-64 min-w-[320px] overflow-x-auto">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#38bdf8"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </Card>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="overflow-x-auto p-5">
            <h2 className="mb-4 text-lg font-extrabold text-white">
              Consistent Weak Areas
            </h2>
            <TopicBars
              topics={
                summary?.weakTopicDetails?.length
                  ? summary.weakTopicDetails
                  : (summary?.weakTopics ?? []).map((topic, index) => ({
                      topic,
                      accuracy: Math.max(35, 55 - index * 6),
                      attempts: 1,
                    }))
              }
            />
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold text-white">Subject Cards</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(summary?.subjectCards ?? []).map((subject) => (
                <div
                  key={subject.subject}
                  className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">{subject.subject}</p>
                      <p className="text-sm text-slate-400">
                        Tests: {subject.tests} | Avg: {subject.average}%
                      </p>
                    </div>
                    <Clock3 className="h-5 w-5 text-blue-200" />
                  </div>
                  <div className="mt-4 flex h-12 items-end gap-1">
                    {subject.scores.map((score, index) => (
                      <div
                        key={`${subject.subject}-${index}`}
                        className="w-full rounded-t bg-blue-400"
                        style={{ height: `${Math.max(8, score)}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function displayName(profile: UserProfile | null) {
  return profile?.name?.trim() || profile?.email?.split("@")[0] || "Guest";
}

function firstName(profile: UserProfile | null) {
  return displayName(profile).split(/\s+/)[0] || "Guest";
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono-label text-xs uppercase text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-400/[0.12] text-blue-200 sm:h-11 sm:w-11">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ paper }: { paper: PaperRow }) {
  if (paper.latestAttemptId) {
    return (
      <Badge className="border-blue-300/25 bg-blue-500/10 text-blue-100">
        ATTEMPTED {paper.latestPercentage ?? 0}%
      </Badge>
    );
  }

  const color =
    paper.status === "READY"
      ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
      : paper.status === "GENERATING"
        ? "border-amber-300/25 bg-amber-500/10 text-amber-100"
        : "border-red-300/25 bg-red-500/10 text-red-100";

  return <Badge className={color}>{paper.status}</Badge>;
}
