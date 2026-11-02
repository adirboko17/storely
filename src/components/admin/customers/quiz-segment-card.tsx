"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity } from "@/data/live/store-identity";
import { saveCampaign } from "@/lib/marketing/campaigns";
import { customerSegmentDetail, listQuizResponses, saveQuizSegment, type CustomerSegment, type QuizAnswer, type QuizResponse } from "@/lib/marketing/customer-segments";
import { loadQuiz, type QuizQuestion } from "@/lib/marketing/quiz";
import { OLI_STORE_OWNER } from "@/types/commerce";

const FORM = "form";

function buildTrail(entry: string, questions: QuizQuestion[], picks: Record<string, string[]>) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  if (!byId.has(entry)) return questions[0] ? [questions[0].id] : [];
  const trail = [entry];
  const seen = new Set([entry]);
  for (let index = 0; index < trail.length; index += 1) {
    const question = byId.get(trail[index]);
    for (const choiceId of picks[trail[index]] ?? []) {
      const next = question?.choices.find((choice) => choice.id === choiceId)?.next;
      if (next && next !== FORM && byId.has(next) && !seen.has(next)) {
        seen.add(next);
        trail.push(next);
      }
    }
  }
  return trail;
}

function responseMatches(response: QuizResponse, rules: QuizAnswer[]) {
  if (!rules.length) return false;
  const allowed = new Map<string, Set<string>>();
  for (const rule of rules) {
    const choices = allowed.get(rule.questionId) ?? new Set<string>();
    choices.add(rule.choiceId);
    allowed.set(rule.questionId, choices);
  }
  const entry = response.answers.find((answer) => answer.questionId === rules[0]?.questionId);
  if (!entry || !allowed.get(entry.questionId)?.has(entry.choiceId)) return false;
  return response.answers.every((answer) => {
    const choices = allowed.get(answer.questionId);
    return !choices || choices.has(answer.choiceId);
  });
}

export function QuizSegmentCard({
  editing,
  onSaved,
  onCreate,
}: {
  editing: CustomerSegment | null;
  onSaved: (segment: CustomerSegment) => void;
  onCreate: () => void;
}) {
  const router = useRouter();
  const { toast } = useAdmin();
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [entry, setEntry] = useState("q1");
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [step, setStep] = useState(0);
  const [naming, setNaming] = useState(false);
  const [saveUntil, setSaveUntil] = useState(0);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setOwner(getStoreIdentity().ownerEmail.toLowerCase() === OLI_STORE_OWNER);
  }, []);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    Promise.all([loadQuiz(), listQuizResponses()])
      .then(([quiz, rows]) => {
        if (!alive) return;
        setQuestions(quiz.quiz.document.questions);
        setEntry(quiz.quiz.document.entry);
        setResponses(rows);
      })
      .catch((error: Error) => {
        if (alive) toast(error.message);
      });
    return () => {
      alive = false;
    };
  }, [owner, toast]);

  useEffect(() => {
    if (!editing || editing.source !== "quiz") return;
    const grouped: Record<string, string[]> = {};
    for (const answer of editing.answers) grouped[answer.questionId] = [...(grouped[answer.questionId] ?? []), answer.choiceId];
    setEditingId(editing.id);
    setName(editing.name);
    setPicks(grouped);
    setStep(0);
    setNaming(false);
    setOpen(true);
  }, [editing]);

  const trail = useMemo(() => buildTrail(entry, questions, picks), [entry, questions, picks]);
  const safeStep = Math.min(step, Math.max(trail.length - 1, 0));
  const question = questions.find((item) => item.id === trail[safeStep]);
  const selectedHere = question ? picks[question.id] ?? [] : [];
  const hasNext = trail.length > safeStep + 1;
  const rules = useMemo(() => answersFrom(questions, trail, picks, naming ? saveUntil : safeStep + 1), [questions, trail, picks, naming, saveUntil, safeStep]);
  const matched = useMemo(() => (rules.length ? responses.filter((response) => responseMatches(response, rules)) : []), [responses, rules]);

  if (!owner) return null;

  function start() {
    onCreate();
    setEditingId(null);
    setPicks({});
    setStep(0);
    setNaming(false);
    setName("");
    setOpen(true);
  }

  function toggle(questionId: string, choiceId: string) {
    setPicks((current) => {
      const selected = current[questionId] ?? [];
      const next = selected.includes(choiceId) ? selected.filter((id) => id !== choiceId) : [...selected, choiceId];
      return { ...current, [questionId]: next };
    });
  }

  function cameFrom(questionId: string) {
    const labels: string[] = [];
    for (const item of questions) {
      for (const choice of item.choices) {
        if (choice.next === questionId && (picks[item.id] ?? []).includes(choice.id)) labels.push(choice.label || choice.id);
      }
    }
    return labels;
  }

  async function persist() {
    const saved = await saveQuizSegment({ id: editingId, name, answers: rules });
    onSaved(saved);
    setOpen(false);
    setNaming(false);
    setStep(0);
    setPicks({});
    setName("");
    setEditingId(null);
    return saved;
  }

  const from = question ? cameFrom(question.id) : [];
  const summary = rules.length ? customerSegmentDetail({ source: "quiz", minSpent: 0, minOrders: 0, subscribedOnly: false, answers: rules }) : "";

  return (
    <div id="quiz-segment" className="rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-bold">פלח מהשאלון</h2>
          <p className="m-0 mt-1 text-[13px] leading-5 text-ink-secondary">סגור עד שלוחצים על יצירה. השאלות נפתחות לפי השלבים, ואפשר לסמן כמה תשובות בכל שלב.</p>
        </div>
        {open ? (
          <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => setOpen(false)}>סגירה</button>
        ) : (
          <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={start}>יצירת פלח מהשאלון</button>
        )}
      </div>
      {open && !question && !naming ? <p className="m-0 border-t border-[#ebebeb] px-4 py-3 text-sm text-ink-secondary">טוען את השאלון…</p> : null}
      {open && question && !naming ? (
        <div className="flex flex-col gap-3 border-t border-[#ebebeb] p-4">
          <div>
            <p className="m-0 text-[13px] font-semibold text-ink-secondary">שלב {safeStep + 1}</p>
            <h3 className="m-0 mt-1 text-[15px] font-bold">{question.title || "שאלה"}</h3>
            {from.length ? <p className="m-0 mt-1 text-[13px] text-ink-secondary">בגלל שסימנת: {from.join(" או ")}</p> : null}
            <p className="m-0 mt-1 text-[13px] leading-5 text-ink-secondary">מסמנים את התשובות שנכנסות לפלח. אפשר יותר מאחת. מי שענתה על אחת מהן מתאימה.</p>
          </div>
          {question.choices.map((choice) => {
            const checked = selectedHere.includes(choice.id);
            const count = responses.filter((response) => response.answers.some((answer) => answer.questionId === question.id && answer.choiceId === choice.id)).length;
            return (
              <label key={choice.id} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#e3e3e3] px-3 py-2.5" style={{ background: checked ? "#f7f7f7" : "#fff" }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(question.id, choice.id)} className="size-4 accent-[#303030]" />
                <span className="flex-1 text-sm">{choice.label || choice.id}</span>
                <span className="text-[13px] text-ink-secondary">{count}</span>
              </label>
            );
          })}
          <div className="flex flex-wrap justify-end gap-2">
            {safeStep > 0 ? <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => setStep((current) => Math.max(0, current - 1))}>חזרה</button> : null}
            {rules.length > 0 && hasNext ? <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => { setSaveUntil(safeStep + 1); setNaming(true); }}>שמירה עד כאן</button> : null}
            {hasNext ? (
              <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white disabled:opacity-40" disabled={selectedHere.length === 0} onClick={() => setStep((current) => current + 1)}>לשאלה הבאה</button>
            ) : (
              <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white disabled:opacity-40" disabled={rules.length === 0} onClick={() => { setSaveUntil(trail.length); setNaming(true); }}>המשך לשמירה</button>
            )}
          </div>
        </div>
      ) : null}
      {open && naming ? (
        <div className="flex flex-col gap-3 border-t border-[#ebebeb] p-4">
          <label className="block text-sm font-medium">
            שם הפלח
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-sm font-normal outline-none" />
          </label>
          <p className="m-0 text-sm">{summary}</p>
          <p className="m-0 text-[13px] leading-5 text-ink-secondary">
            {matched.length === 0
              ? "עדיין אין מי שענתה כך. אחרי השמירה, כל מי שתענה על התשובות האלו תיכנס לפלח אוטומטית."
              : `${matched.length} כבר ענו כך. כל מי שתענה על אותן תשובות גם אחר כך תיכנס לפלח אוטומטית.`}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => setNaming(false)}>חזרה</button>
            <button
              type="button"
              className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]"
              onClick={() => void persist().then(async (saved) => {
                const campaign = await saveCampaign({ name: saved.name, messageId: null, audience: "subscribed", lookbackDays: null, savedSegmentId: saved.id });
                router.push(`/admin/marketing/campaigns/${campaign.id}`);
              }).catch((error: Error) => toast(error.message))}
            >
              שליחת קמפיין לפלח
            </button>
            <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={() => void persist().then(() => toast("הפלח נשמר. מי שתענה כך גם אחר כך תיכנס אליו אוטומטית")).catch((error: Error) => toast(error.message))}>שמירת פלח</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function answersFrom(questions: QuizQuestion[], trail: string[], picks: Record<string, string[]>, until: number): QuizAnswer[] {
  const rows: QuizAnswer[] = [];
  for (const questionId of trail.slice(0, until)) {
    const question = questions.find((item) => item.id === questionId);
    for (const choiceId of picks[questionId] ?? []) {
      const choice = question?.choices.find((item) => item.id === choiceId);
      rows.push({ questionId, choiceId, question: question?.title ?? "", choice: choice?.label ?? choiceId });
    }
  }
  return rows;
}
