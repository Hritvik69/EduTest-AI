import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  Clock3,
  Download,
  FileCheck2,
  Menu,
  Sparkles,
  Timer,
  UploadCloud,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { questionTypeMeta, sectionDotColors, subjects } from "@/lib/edutest-data";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: BookOpenCheck,
    title: "Select Class, Subject & Chapters",
    description: "Pick exactly what the paper should cover.",
  },
  {
    icon: Timer,
    title: "Choose Marks, Duration & Formats",
    description: "Match a unit test, board paper, or practice session.",
  },
  {
    icon: BarChart3,
    title: "Set Difficulty",
    description: "Tune from direct concept recall to extreme challenge.",
  },
  {
    icon: Sparkles,
    title: "Generate, Attempt, Get Evaluated",
    description: "Create the paper, take it online, and review feedback.",
  },
];

const features = [
  {
    icon: Brain,
    title: "Bloom's Taxonomy Mapped",
    description: "Every question tagged to thinking level.",
  },
  {
    icon: Sparkles,
    title: "Competency-Based",
    description: "Tests application, not memorization.",
  },
  {
    icon: Clock3,
    title: "Interactive Timer",
    description: "Real exam experience with countdown.",
  },
  {
    icon: FileCheck2,
    title: "AI Evaluation",
    description: "Get marks and feedback like a real examiner.",
  },
  {
    icon: BarChart3,
    title: "Weak Topic Detection",
    description: "Know exactly where to improve.",
  },
  {
    icon: Download,
    title: "PDF Export",
    description: "Download paper in CBSE format.",
  },
];

type SampleQuestion = {
  badge: string;
  level: string;
  title: string;
  question?: string;
  scenario?: string;
  options?: string[];
  subQuestions?: string[];
  answer: string;
};

const sampleQuestions: SampleQuestion[] = [
  {
    badge: "MCQ",
    level: "CBSE-Level",
    title: "Friction and heat",
    question:
      "A cyclist notices bicycle brakes get hot after repeated use. Why does this happen?",
    options: [
      "A. Chemical reaction",
      "B. Friction converts energy to heat",
      "C. Air pressure rises",
      "D. Gravity decreases",
    ],
    answer: "B - Friction converts energy to heat",
  },
  {
    badge: "Case-Based",
    level: "Competency",
    title: "Plant response",
    scenario:
      "Riya noticed that her garden plant, kept near a window for 3 days with limited light, had yellowing leaves.",
    subQuestions: [
      "Q(a): What process is affected? (MCQ)",
      "Q(b): Explain the mechanism behind this. (Short)",
    ],
    answer: "Photosynthesis and chlorophyll formation",
  },
  {
    badge: "Assertion-Reason",
    level: "Board Pattern",
    title: "Conductivity of metals",
    scenario:
      "Assertion (A): Metals are good conductors of electricity.\nReason (R): Metals have free electrons that carry charge.",
    options: [
      "A. Both true, R explains A",
      "B. Both true, R does not explain A",
      "C. A true, R false",
      "D. A false, R true",
    ],
    answer: "A - Both true, R explains A",
  },
];

const heroSyllabus = [
  "Class 10 Science",
  "Light",
  "Electricity",
  "Case-based",
  "80 marks",
  "3 hours",
];

const heroQuestions = [
  {
    number: "01",
    type: "MCQ",
    prompt: "Why does a copper wire heat up when current flows for a long time?",
    tone: "text-blue-100",
  },
  {
    number: "02",
    type: "Case Study",
    prompt: "Analyze a household circuit fault using the given evidence table.",
    tone: "text-emerald-100",
  },
  {
    number: "03",
    type: "Assertion",
    prompt: "Metals conduct electricity because free electrons carry charge.",
    tone: "text-amber-100",
  },
];

const heroEvaluation = [
  { label: "Bloom map", value: "6 levels", color: "bg-blue-300" },
  { label: "Board fit", value: "CBSE", color: "bg-emerald-300" },
  { label: "Formats", value: "18", color: "bg-amber-300" },
];

export default async function LandingPage() {
  const createTestHref = "/create-test";
  const pdfTestHref = "/create-test?mode=pdf";

  return (
    <main className="min-h-screen overflow-hidden bg-background text-slate-100">
      <Navbar createTestHref={createTestHref} />

      <section className="relative min-h-[calc(100vh-72px)] overflow-hidden pb-16 pt-28 md:pt-32">
        <div className="absolute inset-0 dot-grid opacity-55" />
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-500/10 to-transparent" />
        <div className="safe-container relative z-10">
          <div className="max-w-4xl">
            <Badge className="border-blue-300/25 bg-blue-400/10 text-blue-100">
              CBSE/NCERT aligned for Class 6-12
            </Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              Generate CBSE Test Papers in 60 Seconds
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Competency-based. NCERT aligned. All 18 question formats. Board
              pattern ready. AI evaluated.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group">
                <Link href={createTestHref}>
                  <Sparkles className="h-5 w-5" />
                  Create Free Paper
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how-it-works">
                  See How It Works
                  <ArrowDown className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="border-blue-200/50 bg-primary text-white shadow-[0_0_34px_rgb(59_130_246/0.58)] ring-1 ring-blue-200/20 hover:bg-blue-400 hover:shadow-[0_0_46px_rgb(59_130_246/0.72)]"
              >
                <Link href={pdfTestHref}>
                  <UploadCloud className="h-5 w-5" />
                  PDF-EDU-TEST
                </Link>
              </Button>
            </div>
          </div>
          <HeroShowcase />
        </div>
      </section>

      <Section id="how-it-works" title="Simple 4-Step Process">
        <div className="grid gap-4 lg:grid-cols-4">
          {steps.map((step, index) => (
            <StepCard key={step.title} index={index} step={step} />
          ))}
        </div>
      </Section>

      <Section title="Every CBSE Question Format Covered">
        <div className="flex flex-wrap gap-3">
          {questionTypeMeta.map((item) => (
            <span
              key={item.type}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  sectionDotColors[item.section],
                )}
              />
              {item.label}
            </span>
          ))}
        </div>
        <p className="mt-6 text-sm text-slate-400">
          All formats follow CBSE board pattern and Bloom&apos;s Taxonomy mapping.
        </p>
      </Section>

      <Section title="Real CBSE-Level Questions Generated by AI">
        <div className="grid gap-4 lg:grid-cols-3">
          {sampleQuestions.map((sample) => (
            <SampleQuestionCard key={sample.title} sample={sample} />
          ))}
        </div>
      </Section>

      <Section title="Supported Subjects" subtitle="CBSE Class 6 to Class 12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {subjects.map((subject) => (
            <Card
              key={subject.name}
              className="flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center transition hover:border-blue-300/40 hover:bg-blue-400/[0.08]"
            >
              <span className="text-3xl" aria-hidden>
                {subject.icon}
              </span>
              <span className="text-sm font-semibold">{subject.name}</span>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Built for Real CBSE Preparation">
        <div className="grid gap-3 md:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-400/[0.12] text-blue-200">
                <feature.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-50">{feature.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <section className="safe-container py-16">
        <div className="rounded-lg border border-blue-200/20 bg-gradient-to-r from-blue-600 to-emerald-500 p-8 shadow-glow sm:p-10">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-white">
                Start Testing Smarter Today
              </h2>
              <p className="mt-3 max-w-xl text-blue-50/90">
                Free forever. No credit card needed. No usage limits.
              </p>
            </div>
            <Button asChild variant="gold" size="lg">
              <Link href={createTestHref}>
                Create Your First Paper Free
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="safe-container flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-slate-400">
              AI-powered CBSE assessment for every student
            </p>
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-200">
              More Product By Hritvik - Developer
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-400">
              <a
                href="https://nse-sentinelmax-msrfjdkwmksf6jama4jvmx.streamlit.app/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                NSE SentinelMax
              </a>
              <a
                href="https://omni-ai-converter-web.vercel.app/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Omni AI Converter
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            <Link href="#how-it-works" className="hover:text-white">
              About
            </Link>
            <Link href="#how-it-works" className="hover:text-white">
              How It Works
            </Link>
            <Link href="/" className="hover:text-white">
              Privacy
            </Link>
          </div>
          <p className="text-sm text-slate-400">Made in India for CBSE Students</p>
        </div>
      </footer>
    </main>
  );
}

function HeroShowcase() {
  const tickerItems = questionTypeMeta.slice(0, 8);

  return (
    <div className="hero-stage relative mt-10 overflow-hidden rounded-lg border border-blue-200/15 bg-[#0b1425]/80 p-4 shadow-[0_28px_90px_rgb(0_0_0/0.35)] backdrop-blur md:mt-12 md:p-5">
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="hero-sweep absolute inset-y-0 left-0 w-1/2" />
      <div className="relative grid min-w-0 gap-4 lg:grid-cols-[0.9fr_1.35fr_0.95fr]">
        <div className="hero-float min-w-0 rounded-lg border border-white/10 bg-slate-950/45 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Syllabus locked
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-white">
                Paper Blueprint
              </h2>
            </div>
            <BookOpenCheck className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {heroSyllabus.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <AnimatedMeter label="Knowledge" value="w-[76%]" color="bg-blue-400" />
            <AnimatedMeter label="Application" value="w-[58%]" color="bg-emerald-400" />
            <AnimatedMeter label="Reasoning" value="w-[44%]" color="bg-amber-300" />
          </div>
        </div>

        <div className="relative min-w-0 rounded-lg border border-blue-200/20 bg-[#0f1b31]/90 p-4 shadow-glow sm:p-5">
          <div className="hero-scan-line" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-blue-200/75">
                Live generation
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-white">
                AI builds a CBSE-ready test
              </h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 hero-blink" />
              Running
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {heroQuestions.map((question, index) => (
              <div
                key={question.number}
                className={cn(
                  "hero-question-card rounded-lg border border-white/10 bg-slate-950/45 p-3",
                  index === 1 && "hero-question-delay",
                  index === 2 && "hero-question-slow",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-400/[0.12] text-xs font-extrabold text-blue-100">
                    {question.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-xs font-extrabold", question.tone)}>
                        {question.type}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-500" />
                      <span className="text-xs text-slate-400">Auto balanced</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-200">
                      {question.prompt}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] py-2">
            <div className="hero-ticker flex min-w-max gap-2 px-2">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span
                  key={`${item.type}-${index}`}
                  className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 text-xs font-semibold text-slate-300"
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="hero-float hero-float-delay rounded-lg border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Examiner mode
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-white">
                  Instant Evaluation
                </h2>
              </div>
              <Brain className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[conic-gradient(#10b981_0_72%,#f59e0b_72%_88%,rgb(59_130_246/0.2)_88%_100%)]">
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#0a0e1a]">
                  <span className="text-2xl font-extrabold text-white">92</span>
                  <span className="text-xs font-bold text-slate-400">score</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4">
            <div className="space-y-3">
              {heroEvaluation.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                    <span className="text-sm font-semibold text-slate-300">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-sm font-extrabold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnimatedMeter({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">{label}</span>
        <span className="text-slate-500">mapped</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={cn("hero-meter h-full rounded-full", value, color)} />
      </div>
    </div>
  );
}

function Navbar({
  createTestHref,
}: {
  createTestHref: string;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0a0e1a]/[0.86] backdrop-blur-xl">
      <nav className="safe-container flex h-[72px] items-center justify-between py-4">
        <Logo />
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/dashboard" className="text-sm font-semibold text-slate-300 hover:text-white">
            Dashboard
          </Link>
          <Button asChild variant="outline">
            <Link href={createTestHref}>Get Started Free</Link>
          </Button>
          <AuthControl />
        </div>
        <details className="group relative md:hidden">
          <summary className="flex cursor-pointer list-none items-center rounded-lg border border-white/10 p-2 text-slate-200 marker:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </summary>
          <div className="absolute right-0 mt-3 flex w-56 flex-col gap-2 rounded-lg border border-white/10 bg-[#0a0e1a]/95 p-3 shadow-2xl">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]"
            >
              Dashboard
            </Link>
            <Button asChild>
              <Link href={createTestHref}>Get Started Free</Link>
            </Button>
            <AuthControl mobile />
          </div>
        </details>
      </nav>
    </header>
  );
}

function AuthControl({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-100",
        mobile && "justify-center",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20 text-xs">
        G
      </span>
      Guest
    </span>
  );
}

function Logo() {
  return <BrandLogo />;
}

function SampleQuestionCard({ sample }: { sample: SampleQuestion }) {
  return (
    <div className="rounded-lg border border-white/15 bg-[#0f1629]/80 p-5 shadow-2xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge className="border-blue-300/30 bg-blue-500/15 text-blue-100">
          {sample.badge}
        </Badge>
        <Badge className="border-emerald-300/30 bg-emerald-500/10 text-emerald-100">
          {sample.level}
        </Badge>
      </div>
      <h3 className="mt-5 text-xl font-extrabold text-white">{sample.title}</h3>

      {sample.scenario ? (
        <div className="mt-4 whitespace-pre-line rounded-lg border border-blue-300/15 bg-blue-950/30 p-4 text-sm leading-7 text-slate-300">
          {sample.scenario}
        </div>
      ) : null}

      {sample.question ? (
        <p className="mt-4 text-base font-semibold leading-7 text-slate-100">
          {sample.question}
        </p>
      ) : null}

      {sample.options ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {sample.options.map((option) => (
            <div
              key={option}
              className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-300"
            >
              {option}
            </div>
          ))}
        </div>
      ) : null}

      {sample.subQuestions ? (
        <div className="mt-4 grid gap-2">
          {sample.subQuestions.map((question) => (
            <div
              key={question}
              className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-300"
            >
              {question}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-100">
        <span aria-hidden>OK</span>
        <span>{sample.answer}</span>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="safe-container py-16">
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StepCard({
  step,
  index,
}: {
  step: (typeof steps)[number];
  index: number;
}) {
  const Icon = step.icon;

  return (
    <div className="relative">
      {index < steps.length - 1 ? (
        <ArrowRight className="absolute -right-4 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 text-blue-200/45 lg:block" />
      ) : null}
      <Card className="h-full p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-400/[0.12] text-sm font-bold text-blue-100">
            {index + 1}
          </span>
          <Icon className="h-5 w-5 text-amber-300" />
        </div>
        <h3 className="text-lg font-bold text-white">{step.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p>
      </Card>
    </div>
  );
}
