"use client";

import * as React from "react";
import { ListChecks, Waypoints, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { GeneratedQuestion, MCQOption, MatchPair, SubQuestion } from "@/types";
import { cn } from "@/lib/utils";
import { normalizeMCQOptions } from "@/lib/question-options";

export type AnswerValue = string | Record<string, string> | undefined;
type MatchMode = "select" | "connect";
type MatchLine = {
  left: string;
  right: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
type LongAnswerCommand = "bold" | "bullets" | "underline" | "differenceTable";
type TextFormatResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

export interface QuestionInputProps {
  question: GeneratedQuestion | SubQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

const assertionOptionText: Record<string, string> = {
  A: "Both A and R true, R correctly explains A",
  B: "Both A and R true, R does NOT explain A",
  C: "A true, R false",
  D: "A false, R true",
};

export function QuestionRenderer(props: QuestionInputProps) {
  switch (props.question.type) {
    case "MCQ":
      return <MCQQuestion {...props} />;
    case "ASSERTION_REASON":
      return <AssertionReasonQuestion {...props} />;
    case "TRUE_FALSE":
      return <TrueFalseQuestion {...props} />;
    case "ONE_WORD":
      return <OneWordQuestion {...props} />;
    case "FILL_BLANK":
      return <FillBlankQuestion {...props} />;
    case "VERY_SHORT":
      return <VeryShortQuestion {...props} />;
    case "MATCH_FOLLOWING":
      return <MatchFollowingQuestion {...props} />;
    case "SHORT":
      return <ShortAnswerQuestion {...props} />;
    case "NUMERICAL":
      return <NumericalQuestion {...props} />;
    case "SOURCE_BASED":
      return <SourceBasedQuestion {...props} />;
    case "CASE_BASED":
      return <CaseBasedQuestion {...props} />;
    case "PARAGRAPH":
      return <ParagraphQuestion {...props} />;
    case "HOTS":
      return <HOTSQuestion {...props} />;
    case "COMPETENCY":
      return <CompetencyQuestion {...props} />;
    case "DIAGRAM":
      return <DiagramQuestion {...props} />;
    case "PRACTICAL":
      return <PracticalQuestion {...props} />;
    case "LONG":
      return <LongAnswerQuestion {...props} />;
    case "NCERT_FORMAT":
      return <NCERTQuestion {...props} />;
    default:
      return <ShortAnswerQuestion {...props} />;
  }
}

export function MCQQuestion({ question, value, onChange }: QuestionInputProps) {
  const options = React.useMemo(
    () => normalizeMCQOptions(question.options, question.correctAnswer),
    [question.correctAnswer, question.options],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!["1", "2", "3", "4"].includes(event.key)) return;
      const option = options[Number(event.key) - 1];
      if (option) onChange(value === option.id ? "" : option.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange, options, value]);

  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />
      <div className="grid gap-3">
        {options.map((option) => (
          <OptionButton
            key={option.id}
            option={option}
            selected={value === option.id}
            onClick={() => onChange(value === option.id ? "" : option.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function AssertionReasonQuestion({
  question,
  value,
  onChange,
}: QuestionInputProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-300/30 bg-blue-500/10 p-4">
        <div className="mono-label mb-1 text-xs uppercase text-blue-100">
          Assertion (A)
        </div>
        <p className="text-slate-100">
          {"assertion" in question && question.assertion
            ? question.assertion
            : question.text}
        </p>
      </div>
      <div className="rounded-lg border border-violet-300/30 bg-violet-500/10 p-4">
        <div className="mono-label mb-1 text-xs uppercase text-violet-100">
          Reason (R)
        </div>
        <p className="text-slate-100">
          {"reason" in question && question.reason ? question.reason : question.text}
        </p>
      </div>
      <div className="grid gap-3">
        {Object.entries(assertionOptionText).map(([id, text]) => (
          <button
            key={id}
            onClick={() => onChange(value === id ? "" : id)}
            className={cn(
              "rounded-lg border p-3 text-left text-sm font-semibold transition",
              value === id
                ? "border-blue-300 bg-primary text-white"
                : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/40",
            )}
          >
            {id}. {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TrueFalseQuestion({ question, value, onChange }: QuestionInputProps) {
  return (
    <div className="space-y-5">
      <QuestionText text={question.text} />
      <div className="grid grid-cols-2 gap-3">
        {["True", "False"].map((item) => (
          <button
            key={item}
            onClick={() => onChange(value === item ? "" : item)}
            className={cn(
              "h-16 rounded-lg border text-lg font-extrabold transition",
              value === item && item === "True" && "border-emerald-300 bg-emerald-500 text-white",
              value === item && item === "False" && "border-red-300 bg-red-500 text-white",
              value !== item && "border-white/10 bg-white/[0.035] text-slate-300",
            )}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OneWordQuestion({ question, value, onChange }: QuestionInputProps) {
  return (
    <div className="space-y-5">
      <QuestionText text={question.text} />
      <input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        className="mx-auto block h-14 w-full max-w-md rounded-lg border border-white/10 bg-slate-950/70 px-4 text-center text-xl font-bold text-white outline-none focus:border-blue-300/70"
        placeholder="Your answer"
      />
    </div>
  );
}

export function FillBlankQuestion(props: QuestionInputProps) {
  return <OneWordQuestion {...props} />;
}

export function VeryShortQuestion(props: QuestionInputProps) {
  return <TextAnswer rows={3} {...props} />;
}

export function ShortAnswerQuestion(props: QuestionInputProps) {
  return <TextAnswer rows={4} hint="Write in points for better marks." {...props} />;
}

export function HOTSQuestion(props: QuestionInputProps) {
  return (
    <div className="space-y-4">
      <Badge className="border-amber-300/25 bg-amber-500/10 text-amber-100">
        HOTS
      </Badge>
      <ShortAnswerQuestion {...props} />
    </div>
  );
}

export function CompetencyQuestion(props: QuestionInputProps) {
  return (
    <div className="space-y-4">
      <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100">
        Competency
      </Badge>
      <ShortAnswerQuestion {...props} />
    </div>
  );
}

export function MatchFollowingQuestion({
  question,
  value,
  onChange,
}: QuestionInputProps) {
  const [mode, setMode] = React.useState<MatchMode>("select");
  const pairs = React.useMemo(
    () => ("matchPairs" in question ? question.matchPairs ?? [] : []),
    [question],
  );
  const answer = objectValue(value);
  const shuffledRight = React.useMemo(
    () => [...pairs.map((pair) => pair.right)].sort((a, b) => a.localeCompare(b)),
    [pairs],
  );
  const matchedCount = pairs.filter((pair) => answer[pair.left]).length;

  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/50 p-1">
          <button
            type="button"
            onClick={() => setMode("select")}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition",
              mode === "select"
                ? "bg-primary text-white shadow-glow"
                : "text-slate-300 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <ListChecks className="h-4 w-4" />
            Dropdown
          </button>
          <button
            type="button"
            onClick={() => setMode("connect")}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition",
              mode === "connect"
                ? "bg-primary text-white shadow-glow"
                : "text-slate-300 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <Waypoints className="h-4 w-4" />
            Connect nodes
          </button>
        </div>
        <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-100">
          {matchedCount} / {pairs.length} matched
        </Badge>
      </div>

      {mode === "select" ? (
        <SelectMatchMode
          answer={answer}
          pairs={pairs}
          rightItems={shuffledRight}
          onChange={onChange}
        />
      ) : (
        <NodeMatchMode
          answer={answer}
          pairs={pairs}
          rightItems={shuffledRight}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function SelectMatchMode({
  pairs,
  rightItems,
  answer,
  onChange,
}: {
  pairs: MatchPair[];
  rightItems: string[];
  answer: Record<string, string>;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      {pairs.map((pair, index) => (
        <div
          key={pair.left}
          className="grid gap-3 border-b border-white/10 p-3 last:border-0 sm:grid-cols-2"
        >
          <div className="font-semibold text-slate-100">
            A{index + 1}. {cleanMatchLabel(pair.left)}
          </div>
          <Select
            value={answer[pair.left] ?? ""}
            onChange={(event) =>
              onChange({ ...answer, [pair.left]: event.target.value })
            }
          >
            <option value="">Choose match</option>
            {rightItems.map((right) => (
              <option key={right} value={right}>
                {cleanMatchLabel(right)}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}

function NodeMatchMode({
  pairs,
  rightItems,
  answer,
  onChange,
}: {
  pairs: MatchPair[];
  rightItems: string[];
  answer: Record<string, string>;
  onChange: (value: AnswerValue) => void;
}) {
  const [activeLeft, setActiveLeft] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<MatchLine[]>([]);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const leftRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const registerLeft = React.useCallback(
    (left: string) => (node: HTMLButtonElement | null) => {
      leftRefs.current[left] = node;
    },
    [],
  );

  const registerRight = React.useCallback(
    (right: string) => (node: HTMLButtonElement | null) => {
      rightRefs.current[right] = node;
    },
    [],
  );

  const updateLines = React.useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    const nextLines = pairs.flatMap((pair) => {
      const right = answer[pair.left];
      const leftNode = leftRefs.current[pair.left];
      const rightNode = right ? rightRefs.current[right] : null;
      if (!right || !leftNode || !rightNode) return [];

      const leftRect = leftNode.getBoundingClientRect();
      const rightRect = rightNode.getBoundingClientRect();
      return [
        {
          left: pair.left,
          right,
          x1: leftRect.right - layerRect.left,
          y1: leftRect.top + leftRect.height / 2 - layerRect.top,
          x2: rightRect.left - layerRect.left,
          y2: rightRect.top + rightRect.height / 2 - layerRect.top,
        },
      ];
    });
    setLines(nextLines);
  }, [answer, pairs]);

  React.useEffect(() => {
    updateLines();
    const timer = window.setTimeout(updateLines, 0);
    window.addEventListener("resize", updateLines);

    const nodes = [
      layerRef.current,
      ...Object.values(leftRefs.current),
      ...Object.values(rightRefs.current),
    ].filter(Boolean) as Element[];

    let observer: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      observer = new ResizeObserver(updateLines);
      nodes.forEach((node) => observer?.observe(node));
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateLines);
      observer?.disconnect();
    };
  }, [rightItems, updateLines]);

  const connect = React.useCallback(
    (left: string, right: string) => {
      const next = { ...answer };
      Object.keys(next).forEach((key) => {
        if (next[key] === right && key !== left) delete next[key];
      });
      next[left] = right;
      onChange(next);
      setActiveLeft(null);
    },
    [answer, onChange],
  );

  const clear = React.useCallback(
    (left: string) => {
      const next = { ...answer };
      delete next[left];
      onChange(next);
      if (activeLeft === left) setActiveLeft(null);
    },
    [activeLeft, answer, onChange],
  );

  const dragStart = (event: React.DragEvent<HTMLButtonElement>, left: string) => {
    event.dataTransfer.setData("text/plain", left);
    event.dataTransfer.effectAllowed = "link";
    setActiveLeft(left);
  };

  const rightLabel = React.useCallback(
    (right: string) => `B${Math.max(0, rightItems.indexOf(right)) + 1}`,
    [rightItems],
  );

  return (
    <div
      ref={layerRef}
      className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-950/25 p-4"
    >
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
        {lines.map((line) => {
          const curve = Math.max(48, Math.abs(line.x2 - line.x1) * 0.35);
          return (
            <g key={`${line.left}-${line.right}`}>
              <path
                d={`M ${line.x1} ${line.y1} C ${line.x1 + curve} ${line.y1}, ${line.x2 - curve} ${line.y2}, ${line.x2} ${line.y2}`}
                fill="none"
                opacity="0.42"
                stroke="rgb(96 165 250)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>

      <div className="relative z-10 grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase text-blue-200">Column A</div>
          {pairs.map((pair, index) => {
            const selected = activeLeft === pair.left;
            const matchedRight = answer[pair.left];
            return (
              <div
                key={pair.left}
                className={cn(
                  "flex min-h-14 items-center gap-2 rounded-lg border bg-[#0f1629]/90 p-2 transition",
                  matchedRight && "border-blue-300/35",
                  selected
                    ? "border-blue-300 shadow-[0_0_26px_rgb(59_130_246/0.24)]"
                    : "border-white/10",
                )}
              >
                <button
                  ref={registerLeft(pair.left)}
                  type="button"
                  draggable
                  onClick={() => setActiveLeft(selected ? null : pair.left)}
                  onDragStart={(event) => dragStart(event, pair.left)}
                  onDragEnd={() => setActiveLeft(null)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-pressed={selected}
                  title="Drag this point to a matching point"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-400/[0.12] text-sm font-extrabold text-blue-100">
                    A{index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">
                    {cleanMatchLabel(pair.left)}
                  </span>
                  <span
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 rounded-full border-2",
                      selected
                        ? "border-blue-100 bg-blue-400"
                        : matchedRight
                          ? "border-blue-200 bg-blue-400"
                          : "border-blue-300 bg-slate-950",
                    )}
                  />
                </button>
                {matchedRight ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-2 py-1 text-xs font-bold text-blue-100">
                      {rightLabel(matchedRight)}
                    </span>
                    <button
                      type="button"
                      onClick={() => clear(pair.left)}
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/[0.08] hover:text-white"
                      aria-label={`Clear match for ${pair.left}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-bold uppercase text-emerald-200">Column B</div>
          {rightItems.map((right, index) => {
            const matchedLeft = pairs.find((pair) => answer[pair.left] === right);
            const canConnect = Boolean(activeLeft);
            return (
              <button
                key={right}
                ref={registerRight(right)}
                type="button"
                onClick={() => {
                  if (activeLeft) connect(activeLeft, right);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "link";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const left = event.dataTransfer.getData("text/plain");
                  if (left) connect(left, right);
                }}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-lg border bg-[#0f1629]/90 p-3 text-left transition",
                  matchedLeft
                    ? "border-emerald-300/35"
                    : "border-white/10",
                  canConnect && "hover:border-emerald-300/70 hover:bg-emerald-500/10",
                )}
                title="Drop a Column A point here"
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded-full border-2",
                    matchedLeft
                      ? "border-emerald-100 bg-emerald-400"
                      : "border-emerald-300 bg-slate-950",
                  )}
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-400/[0.1] text-sm font-extrabold text-emerald-100">
                  B{index + 1}
                </span>
                <span className="min-w-0 flex-1 font-semibold text-slate-100">
                  {cleanMatchLabel(right)}
                </span>
                {matchedLeft ? (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-100">
                    A{pairs.indexOf(matchedLeft) + 1}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function NumericalQuestion({ question, value, onChange }: QuestionInputProps) {
  const answer = objectValue(value);
  const set = (key: string, next: string) => onChange({ ...answer, [key]: next });

  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />
      {["Step 1", "Step 2", "Step 3"].map((label) => (
        <input
          key={label}
          value={answer[label] ?? ""}
          onChange={(event) => set(label, event.target.value)}
          className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-white outline-none focus:border-blue-300/70"
          placeholder={label}
        />
      ))}
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <input
          value={answer.final ?? ""}
          onChange={(event) => set("final", event.target.value)}
          className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-white outline-none focus:border-blue-300/70"
          placeholder="Final answer"
        />
        <input
          value={answer.unit ?? ""}
          onChange={(event) => set("unit", event.target.value)}
          className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-white outline-none focus:border-blue-300/70"
          placeholder="Unit"
        />
      </div>
    </div>
  );
}

export function CaseBasedQuestion(props: QuestionInputProps) {
  return <ScenarioQuestion {...props} />;
}

export function SourceBasedQuestion(props: QuestionInputProps) {
  return <ScenarioQuestion {...props} />;
}

export function ParagraphQuestion({ question, value, onChange }: QuestionInputProps) {
  return (
    <div className="space-y-4">
      <ScenarioBox scenario={"scenario" in question ? question.scenario : undefined} />
      <TextAnswer question={question} value={value} onChange={onChange} rows={5} />
    </div>
  );
}

export function DiagramQuestion({ question, value, onChange }: QuestionInputProps) {
  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />
      <div className="rounded-lg border border-slate-400/30 bg-slate-800/60 p-5 text-slate-200">
        <div className="mono-label mb-2 text-xs uppercase text-slate-400">Diagram</div>
        {"diagramDescription" in question && question.diagramDescription
          ? question.diagramDescription
          : "Diagram description"}
      </div>
      <TextAnswer question={question} value={value} onChange={onChange} rows={5} />
    </div>
  );
}

export function PracticalQuestion({ question, value, onChange }: QuestionInputProps) {
  const answer = objectValue(value);
  const set = (key: string, next: string) => onChange({ ...answer, [key]: next });

  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />
      {["Observation", "Inference", "Precaution"].map((label) => (
        <label key={label} className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-300">
            {label}
          </span>
          <textarea
            value={answer[label] ?? ""}
            onChange={(event) => set(label, event.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 p-3 text-white outline-none focus:border-blue-300/70"
          />
        </label>
      ))}
    </div>
  );
}

export function LongAnswerQuestion({
  question,
  value,
  onChange,
}: QuestionInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const text = typeof value === "string" ? value : "";

  const applyFormat = React.useCallback(
    (command: LongAnswerCommand) => {
      const textarea = textareaRef.current;
      const selectionStart = textarea?.selectionStart ?? text.length;
      const selectionEnd = textarea?.selectionEnd ?? text.length;
      const next = formatLongAnswerText(text, command, selectionStart, selectionEnd);

      onChange(next.text);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    },
    [onChange, text],
  );

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["bold", "Bold"],
          ["bullets", "Bullets"],
          ["underline", "Underline"],
          ["differenceTable", "Page Break"],
        ] as const
      ).map(([command, label]) => (
        <Button
          key={command}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyFormat(command)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  return (
    <TextAnswer
      question={question}
      value={value}
      onChange={onChange}
      rows={8}
      hint="Recommended: 150-200 words."
      textareaRef={textareaRef}
      toolbar={toolbar}
    />
  );
}

export function NCERTQuestion(props: QuestionInputProps) {
  const rows = "marks" in props.question && props.question.marks > 2 ? 5 : 3;
  return <TextAnswer rows={rows} {...props} />;
}

function ScenarioQuestion({ question, value, onChange }: QuestionInputProps) {
  const answer = objectValue(value);
  const subQuestions = "subQuestions" in question ? question.subQuestions ?? [] : [];

  return (
    <div className="space-y-5">
      <ScenarioBox scenario={"scenario" in question ? question.scenario : undefined} />
      <QuestionText text={question.text} />
      {subQuestions.map((subQuestion, index) => (
        <div
          key={`${subQuestion.text}-${index}`}
          className="rounded-lg border border-white/10 bg-white/[0.025] p-4"
        >
          <div className="mb-3 text-sm font-bold text-blue-100">
            Sub-question {index + 1} ({subQuestion.marks} marks)
          </div>
          <QuestionRenderer
            question={subQuestion}
            value={answer[String(index)]}
            onChange={(next) =>
              onChange({ ...answer, [String(index)]: serializeAnswer(next) })
            }
          />
        </div>
      ))}
    </div>
  );
}

function formatLongAnswerText(
  text: string,
  command: LongAnswerCommand,
  selectionStart: number,
  selectionEnd: number,
): TextFormatResult {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));

  if (command === "bullets") {
    return formatBulletLines(text, start, end);
  }

  if (command === "differenceTable") {
    return insertDifferenceTable(text, start, end);
  }

  const wrapper =
    command === "bold"
      ? { before: "**", after: "**", placeholder: "bold text" }
      : { before: "<u>", after: "</u>", placeholder: "underlined text" };
  const selected = text.slice(start, end);
  const content = selected || wrapper.placeholder;
  const nextText =
    text.slice(0, start) + wrapper.before + content + wrapper.after + text.slice(end);
  const nextStart = start + wrapper.before.length;

  return {
    text: nextText,
    selectionStart: nextStart,
    selectionEnd: nextStart + content.length,
  };
}

function insertDifferenceTable(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TextFormatResult {
  const table = [
    "",
    "--- Page Break ---",
    "",
    "| Basis of Difference | Point 1 | Point 2 |",
    "| --- | --- | --- |",
    "| 1. |  |  |",
    "| 2. |  |  |",
    "| 3. |  |  |",
    "",
  ].join("\n");
  const prefix = selectionStart > 0 && !text.slice(0, selectionStart).endsWith("\n")
    ? "\n"
    : "";
  const nextText =
    text.slice(0, selectionStart) + prefix + table + text.slice(selectionEnd);
  const cursor = selectionStart + prefix.length + table.length;

  return {
    text: nextText,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

function formatBulletLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TextFormatResult {
  if (selectionStart === selectionEnd) {
    const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextText = `${text.slice(0, lineStart)}- ${text.slice(lineStart)}`;
    const cursor = selectionStart + 2;

    return {
      text: nextText,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const selected = text.slice(selectionStart, selectionEnd);
  const formatted = selected
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;

      const indent = line.match(/^\s*/)?.[0] ?? "";
      const content = line.slice(indent.length);
      if (/^([-*]\s+|\d+\.\s+)/.test(content)) return line;

      return `${indent}- ${content}`;
    })
    .join("\n");

  return {
    text: text.slice(0, selectionStart) + formatted + text.slice(selectionEnd),
    selectionStart,
    selectionEnd: selectionStart + formatted.length,
  };
}

function TextAnswer({
  question,
  value,
  onChange,
  rows,
  hint,
  textareaRef,
  toolbar,
}: QuestionInputProps & {
  rows: number;
  hint?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  toolbar?: React.ReactNode;
}) {
  const text = typeof value === "string" ? value : "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <QuestionText text={question.text} />
      {toolbar}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 p-3 leading-7 text-white outline-none focus:border-blue-300/70"
        placeholder="Write your answer here"
      />
      <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-400">
        <span>{words} words</span>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

function QuestionText({ text }: { text: string }) {
  return <h2 className="text-xl font-bold leading-8 text-white">{text}</h2>;
}

function ScenarioBox({ scenario }: { scenario?: string }) {
  return (
    <div className="rounded-lg border-l-4 border-blue-300 bg-blue-900/30 p-4">
      <div className="mono-label mb-2 text-xs uppercase text-blue-100">
        Read the following
      </div>
      <p className="leading-7 text-slate-200">{scenario ?? "Scenario text"}</p>
    </div>
  );
}

function OptionButton({
  option,
  selected,
  onClick,
}: {
  option: MCQOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left font-semibold transition",
        selected
          ? "border-blue-300 bg-primary text-white"
          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-blue-300/40",
      )}
    >
      {option.id}. {option.text}
    </button>
  );
}

function objectValue(value: AnswerValue) {
  return typeof value === "object" && value ? value : {};
}

function cleanMatchLabel(text: string) {
  return text.replace(/^\s*[AB]?\d+\s*[\).:-]\s*/i, "").trim();
}

function serializeAnswer(value: AnswerValue) {
  return typeof value === "string" ? value : JSON.stringify(value ?? {});
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
