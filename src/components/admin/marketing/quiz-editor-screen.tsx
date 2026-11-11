"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { popupAreaClass, popupFieldClass } from "@/lib/marketing/popups";
import {
  listQuizProducts,
  loadQuiz,
  newQuizId,
  quizForThisStore,
  quizProblem,
  quizReaches,
  quizStatusLabel,
  saveQuiz,
  type QuizChoice,
  type QuizDocument,
  type QuizProductOption,
  type QuizQuestion,
  type QuizStatus,
  type StoreQuiz,
} from "@/lib/marketing/quiz";

const FORM = "form";

export function QuizEditorScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, () => 0);
  const quizStore = quizForThisStore();
  const [quiz, setQuiz] = useState<StoreQuiz | null>(null);
  const [saved, setSaved] = useState<StoreQuiz | null>(null);
  const [stored, setStored] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"questions" | "copy">("questions");
  const [products, setProducts] = useState<QuizProductOption[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!quizStore) return;
    let alive = true;
    loadQuiz()
      .then((result) => {
        if (!alive) return;
        setQuiz(result.quiz);
        setSaved(structuredClone(result.quiz));
        setStored(result.stored);
      })
      .catch((error: Error) => { if (alive) setFailed(true); toast(error.message); });
    listQuizProducts().then((rows) => { if (alive) setProducts(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [quizStore, toast]);

  const dirty = JSON.stringify(quiz) !== JSON.stringify(saved);

  async function persist(status?: QuizStatus) {
    if (!quiz) return;
    const nextQuiz = status ? { ...quiz, status } : quiz;
    const problem = quizProblem(nextQuiz);
    if (problem) {
      toast(problem);
      return;
    }
    setSaving(true);
    try {
      const next = await saveQuiz(nextQuiz);
      setQuiz(next);
      setSaved(structuredClone(next));
      setStored(true);
      toast(next.status === "active" ? "השאלון פעיל בדף הבית" : "השאלון נשמר כטיוטה");
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  useUnsavedEditor(dirty, saving, () => void persist(), () => setQuiz(saved ? structuredClone(saved) : saved));

  if (!quizStore) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">השאלון לא זמין בחנות הזו.</p>;
  if (failed) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">לא הצלחנו לטעון את השאלון.</p>;
  if (!quiz || !saved) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">טוען שאלון…</p>;
  const draft = quiz;
  const document = draft.document;

  function patchDocument(next: Partial<QuizDocument>) {
    setQuiz((item) => item ? { ...item, document: { ...item.document, ...next } } : item);
  }

  function replaceDocument(next: QuizDocument) {
    setQuiz((item) => item ? { ...item, document: next } : item);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href="/admin/marketing/popups" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">פופאפים /</span>
        <b className="text-[15px]">שאלון</b>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${draft.status === "active" ? "bg-[#e3f1df] text-[#0c5132]" : "bg-[#f1f1f1] text-[#4a4a4a]"}`}>{quizStatusLabel(draft.status)}</span>
        <div className="ms-auto flex items-center gap-2">
          <div className="flex rounded-full bg-[#f1f1f1] p-0.5">
            <button type="button" onClick={() => setTab("questions")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${tab === "questions" ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>שאלות</button>
            <button type="button" onClick={() => setTab("copy")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${tab === "copy" ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>טקסטים</button>
          </div>
          {draft.status === "active" ? (
            <button type="button" className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold" onClick={() => void persist("draft")}>השהיה</button>
          ) : (
            <button type="button" className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white" onClick={() => void persist("active")}>פרסום</button>
          )}
        </div>
      </div>
      <div className="min-h-[calc(100dvh-50px)] flex-1 bg-[#f3f3f3] px-4 py-5">
        <p className="mx-auto mb-4 mt-0 max-w-[1100px] text-sm text-[#4a4a4a]">
          {saved.status === "active" && stored ? "הגרסה האחרונה שנשמרה מוצגת בדף הבית." : "פרסום מציג את השאלון הזה בדף הבית."}
          {" "}הקוד שנשלח ללקוחה נשאר 5% על ההזמנה הראשונה.
        </p>
        {tab === "copy" ? <CopyEditor document={document} onChange={patchDocument} /> : (
          <FlowEditor document={document} products={products} onChange={replaceDocument} />
        )}
      </div>
    </div>
  );
}

const NEW_QUESTION = "__new";
const selectClass = "h-8 rounded-lg border border-[#8a8a8a] bg-white px-2 text-sm";

type Column = { question: QuizQuestion; picked: QuizChoice | null; via: QuizChoice | null; viaQuestionId: string | null };

function FlowEditor({ document, products, onChange }: { document: QuizDocument; products: QuizProductOption[]; onChange: (next: QuizDocument) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const columns: Column[] = [];
  let ending: QuizChoice | null = null;
  let cursor = document.entry;
  let via: QuizChoice | null = null;
  let viaQuestionId: string | null = null;
  const seen = new Set<string>();
  for (let depth = 0; ; depth += 1) {
    const question = document.questions.find((item) => item.id === cursor);
    if (!question || seen.has(question.id)) break;
    seen.add(question.id);
    const choice = question.choices.find((item) => item.id === picked[depth]) ?? null;
    columns.push({ question, picked: choice, via, viaQuestionId });
    if (!choice) break;
    if (choice.next === FORM) {
      ending = choice;
      break;
    }
    via = choice;
    viaQuestionId = question.id;
    cursor = choice.next;
  }
  const endingQuestionId = ending ? columns[columns.length - 1]?.question.id ?? null : null;
  const loose = document.questions.filter((item) => !quizReaches(document, item.id));

  function pick(depth: number, choiceId: string) {
    setPicked((current) => (current[depth] === choiceId && current.length === depth + 1 ? current : [...current.slice(0, depth), choiceId]));
  }

  function updateQuestion(next: QuizQuestion) {
    onChange({ ...document, questions: document.questions.map((item) => (item.id === next.id ? next : item)) });
  }

  function patchChoice(questionId: string, choiceId: string, patch: Partial<QuizChoice>, extra: QuizQuestion[] = []) {
    const questions = document.questions.map((item) => item.id !== questionId ? item : {
      ...item,
      choices: item.choices.map((choice) => {
        if (choice.id !== choiceId) return choice;
        const next = { ...choice, ...patch };
        if (next.next !== FORM) next.products = [];
        return next;
      }),
    });
    onChange({ ...document, questions: [...questions, ...extra] });
  }

  function lead(questionId: string, choice: QuizChoice, value: string) {
    if (value === NEW_QUESTION) {
      if (document.questions.length >= 40) return;
      const created: QuizQuestion = { id: newQuizId("q"), title: "", choices: [{ id: newQuizId("a"), label: "", next: FORM, products: [] }] };
      patchChoice(questionId, choice.id, { next: created.id }, [created]);
      return;
    }
    patchChoice(questionId, choice.id, { next: value });
  }

  function separate(questionId: string, choice: QuizChoice) {
    const source = document.questions.find((item) => item.id === choice.next);
    if (!source || document.questions.length >= 40) return;
    const copy: QuizQuestion = {
      id: newQuizId("q"),
      title: source.title,
      choices: source.choices.map((item) => ({ ...item, id: newQuizId("a"), products: [...item.products] })),
    };
    patchChoice(questionId, choice.id, { next: copy.id }, [copy]);
  }

  function removeQuestion(questionId: string, depth: number) {
    if (questionId === document.entry) return;
    const questions = document.questions
      .filter((item) => item.id !== questionId)
      .map((item) => ({ ...item, choices: item.choices.map((choice) => (choice.next === questionId ? { ...choice, next: FORM } : choice)) }));
    const next = { ...document, questions };
    onChange({ ...next, questions: questions.filter((item) => quizReaches(next, item.id)) });
    setPicked((current) => current.slice(0, depth));
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f1f1f1] text-sm">i</span>
        <p className="m-0 flex-1 text-sm text-[#4a4a4a]">לוחצים על תשובה כדי לפתוח את השלב שבא אחריה. שלבים קודמים מתכווצים, ולחיצה עליהם פותחת אותם שוב.</p>
        <span className="text-[13px] text-ink-secondary">{document.questions.length} שאלות בשאלון</span>
      </div>
      <div className="flex flex-wrap items-start justify-start gap-x-0 gap-y-3 pb-4">
        {columns.map((column, depth) => (
          <div key={`${column.question.id}-${depth}`} className="flex shrink-0 items-start">
          {depth > 0 ? <Connector /> : null}
          {depth < columns.length - 1 ? (
            <button type="button" onClick={() => setPicked((current) => current.slice(0, depth))} className="flex w-[190px] shrink-0 flex-col gap-2 rounded-2xl border-0 bg-white p-3 text-start shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_2px_rgba(26,26,26,.06)] hover:shadow-[0_0_0_1px_#8a8a8a]">
              <span className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#303030] text-[12px] font-bold text-white">{depth + 1}</span>
                <span className="text-[12px] font-semibold text-ink-secondary">{depth === 0 ? "השאלה הראשונה" : `שלב ${depth + 1}`}</span>
              </span>
              <span className="line-clamp-2 text-[13px] leading-5 font-semibold">{column.question.title.trim() || "שאלה בלי נוסח"}</span>
              {column.picked ? <span className="self-start rounded-full bg-[#303030] px-2.5 py-1 text-[12px] font-semibold text-white">{column.picked.label.trim() || "תשובה"}</span> : null}
              <span className="text-[12px] text-ink-secondary">לחיצה לעריכה</span>
            </button>
          ) : (
          <StageColumn
            document={document}
            column={column}
            depth={depth}
            onPick={(choiceId) => pick(depth, choiceId)}
            onUpdate={updateQuestion}
            onPatch={(choiceId, patch) => patchChoice(column.question.id, choiceId, patch)}
            onLead={(choice, value) => lead(column.question.id, choice, value)}
            onSeparate={column.via && column.viaQuestionId ? () => separate(column.viaQuestionId!, column.via!) : undefined}
            onRemove={() => removeQuestion(column.question.id, depth - 1)}
            onDropPick={() => setPicked((current) => current.slice(0, depth))}
          />
          )}
          </div>
        ))}
        {ending && endingQuestionId ? (
          <div className="flex shrink-0 items-start">
            <Connector />
            <section className="flex w-[320px] shrink-0 flex-col gap-3 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_2px_rgba(26,26,26,.06)]">
              <div className="flex items-center gap-2.5 bg-[#f7f7f7] px-4 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#e3f1df] text-sm font-bold text-[#0c5132]">✓</span>
                <div>
                  <b className="block text-sm">טופס הפרטים</b>
                  <span className="block text-[12px] text-ink-secondary">סוף המסלול</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <p className="m-0 text-[13px] leading-5 text-ink-secondary">מי שבחרה «{ending.label.trim() || "התשובה הזו"}» עוברת לטופס ומקבלת את ה-5%. אפשר לבחור מוצרים שיוצגו לה בסוף.</p>
                <ProductPicker products={products} selected={ending.products} onChange={(handles) => patchChoice(endingQuestionId, ending!.id, { products: handles })} />
              </div>
            </section>
          </div>
        ) : (
          <div className="flex shrink-0 items-start">
            <Connector muted />
            <div className="grid h-[180px] w-[260px] shrink-0 place-items-center rounded-2xl border-2 border-dashed border-[#d4d4d4] px-6 text-center text-sm text-[#8a8a8a]">
              בחרו תשובה כדי לראות לאן היא ממשיכה
            </div>
          </div>
        )}
      </div>
      {loose.length ? (
        <section className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
          <p className="m-0 text-sm">{loose.length === 1 ? "שאלה אחת לא מחוברת לאף תשובה." : `${loose.length} שאלות לא מחוברות לאף תשובה.`}</p>
          <button type="button" onClick={() => onChange({ ...document, questions: document.questions.filter((item) => quizReaches(document, item.id)) })} className="mt-2 h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold">מחיקה</button>
        </section>
      ) : null}
    </div>
  );
}

function StageColumn({
  document,
  column,
  depth,
  onPick,
  onUpdate,
  onPatch,
  onLead,
  onSeparate,
  onRemove,
  onDropPick,
}: {
  document: QuizDocument;
  column: Column;
  depth: number;
  onPick: (choiceId: string) => void;
  onUpdate: (next: QuizQuestion) => void;
  onPatch: (choiceId: string, patch: Partial<QuizChoice>) => void;
  onLead: (choice: QuizChoice, value: string) => void;
  onSeparate?: () => void;
  onRemove: () => void;
  onDropPick: () => void;
}) {
  const { question, picked, via } = column;
  const shared = via ? otherAnswers(document, question.id, via.id) : [];

  function move(choiceId: string, direction: -1 | 1) {
    const from = question.choices.findIndex((choice) => choice.id === choiceId);
    const target = from + direction;
    if (from < 0 || target < 0 || target >= question.choices.length) return;
    const choices = [...question.choices];
    const [item] = choices.splice(from, 1);
    if (!item) return;
    choices.splice(target, 0, item);
    onUpdate({ ...question, choices });
  }

  function remove(choiceId: string) {
    if (question.choices.length < 2) return;
    if (picked?.id === choiceId) onDropPick();
    onUpdate({ ...question, choices: question.choices.filter((choice) => choice.id !== choiceId) });
  }


  return (
    <section className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_2px_rgba(26,26,26,.06)]">
      <div className="flex items-center gap-2.5 bg-[#f7f7f7] px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#303030] text-[13px] font-bold text-white">{depth + 1}</span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm">{depth === 0 ? "השאלה הראשונה" : `שלב ${depth + 1}`}</b>
          {via ? <span className="block truncate text-[12px] text-ink-secondary">אחרי «{via.label.trim() || "תשובה"}»</span> : <span className="block text-[12px] text-ink-secondary">כאן כל אחת מתחילה</span>}
        </div>
        {depth > 0 ? <button type="button" onClick={onRemove} className="h-7 rounded-lg border-0 bg-white px-2.5 text-[12px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#e3e3e3]">מחיקה</button> : null}
      </div>
      <div className="flex flex-col gap-3 p-4">
        {shared.length && onSeparate ? (
          <div className="rounded-xl bg-[#fff4d6] px-3 py-2 text-[13px] leading-5 text-[#4f3b00]">
            גם {shared.join(", ")} מגיעות לשאלה הזו, אז שינוי כאן משנה גם אצלן.
            <button type="button" onClick={onSeparate} className="ms-1 border-0 bg-transparent p-0 text-[13px] font-semibold underline">הפרדה לשאלה משלה</button>
          </div>
        ) : null}
        <textarea value={question.title} onChange={(event) => onUpdate({ ...question, title: event.target.value.slice(0, 160) })} placeholder="כתבו את השאלה" rows={2} className="w-full resize-none rounded-xl border border-transparent bg-[#f7f7f7] px-3 py-2.5 text-[15px] leading-6 font-bold outline-none focus:border-[#8a8a8a] focus:bg-white" />
        <span className="text-[12px] font-semibold text-ink-secondary">תשובות</span>
        <div className="flex flex-col gap-2">
          {question.choices.map((choice, index) => {
            const active = picked?.id === choice.id;
            const ends = choice.next === FORM;
            const nextTitle = document.questions.find((item) => item.id === choice.next)?.title.trim();
            const siblings = siblingStages(document, question.id, choice.next);
            return (
              <div key={choice.id} className="overflow-hidden rounded-xl transition-shadow" style={{ boxShadow: active ? "0 0 0 2px #303030" : "0 0 0 1px #e3e3e3", background: active ? "#fff" : "#fcfcfc" }}>
                <div className="flex cursor-pointer items-center gap-2 px-2.5 py-2" onClick={() => onPick(choice.id)}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold" style={{ background: active ? "#303030" : "#f1f1f1", color: active ? "#fff" : "#4a4a4a" }}>{index + 1}</span>
                  <input value={choice.label} onFocus={() => onPick(choice.id)} onChange={(event) => onPatch(choice.id, { label: event.target.value.slice(0, 80) })} placeholder="כתבו תשובה" className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm outline-none" />
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: ends ? "#e3f1df" : "#eef2ff", color: ends ? "#0c5132" : "#2c3e8f" }}>{ends ? "לטופס" : "ממשיכה ‹"}</span>
                </div>
                {active ? (
                  <div className="flex flex-col gap-2 bg-[#f7f7f7] px-3 py-2.5">
                    <label className="text-[12px] font-semibold text-ink-secondary">
                      לאן התשובה מובילה
                      <select aria-label="לאן התשובה מובילה" value={ends ? FORM : choice.next} onChange={(event) => onLead(choice, event.target.value)} className={`${selectClass} mt-1 w-full font-normal`}>
                        <option value={FORM}>מסיימת בטופס</option>
                        {!ends ? <option value={choice.next}>ממשיכה ל: {nextTitle || "שאלה בלי נוסח"}</option> : null}
                        <option value={NEW_QUESTION}>ממשיכה לשאלה חדשה</option>
                        {siblings.map((item) => <option key={item.id} value={item.id}>ממשיכה כמו «{item.via}»</option>)}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="הזזה למעלה" onClick={() => move(choice.id, -1)} disabled={index === 0} className="grid size-7 place-items-center rounded-lg border-0 bg-white text-xs shadow-[0_0_0_1px_#e3e3e3] disabled:opacity-30">↑</button>
                      <button type="button" aria-label="הזזה למטה" onClick={() => move(choice.id, 1)} disabled={index === question.choices.length - 1} className="grid size-7 place-items-center rounded-lg border-0 bg-white text-xs shadow-[0_0_0_1px_#e3e3e3] disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => remove(choice.id)} disabled={question.choices.length < 2} className="ms-auto h-7 border-0 bg-transparent px-1 text-xs font-semibold text-[#8e1f0b] disabled:opacity-30">מחיקת התשובה</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => { if (question.choices.length < 12) onUpdate({ ...question, choices: [...question.choices, { id: newQuizId("a"), label: "", next: FORM, products: [] }] }); }} disabled={question.choices.length >= 12} className="h-9 rounded-xl border border-dashed border-[#c9c9c9] bg-white text-sm font-semibold text-[#4a4a4a] hover:bg-[#f7f7f7] disabled:opacity-40">+ הוספת תשובה</button>
      </div>
    </section>
  );
}

function Connector({ muted = false }: { muted?: boolean }) {
  return (
    <div aria-hidden className="flex h-[68px] w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 32 12" width="32" height="12" fill="none" stroke={muted ? "#c9c9c9" : "#303030"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 6H3M7 2L3 6l4 4" strokeDasharray={muted ? "3 3" : undefined} />
      </svg>
    </div>
  );
}

function otherAnswers(document: QuizDocument, questionId: string, choiceId: string) {
  const labels: string[] = [];
  for (const question of document.questions) {
    for (const choice of question.choices) {
      if (choice.id !== choiceId && choice.next === questionId && choice.label.trim()) labels.push(`«${choice.label.trim()}»`);
    }
  }
  return labels;
}

function siblingStages(document: QuizDocument, questionId: string, currentNext: string) {
  const question = document.questions.find((item) => item.id === questionId);
  if (!question) return [];
  const seen = new Set<string>();
  const items: { id: string; via: string }[] = [];
  for (const choice of question.choices) {
    const via = choice.label.trim();
    if (!via || choice.next === FORM || choice.next === currentNext || seen.has(choice.next)) continue;
    if (leadsTo(document.questions, choice.next, questionId)) continue;
    seen.add(choice.next);
    items.push({ id: choice.next, via });
  }
  return items;
}

function leadsTo(questions: QuizQuestion[], fromId: string, targetId: string) {
  const seen = new Set<string>();
  const pending = [fromId];
  while (pending.length) {
    const id = pending.pop();
    if (!id || id === FORM || seen.has(id)) continue;
    if (id === targetId) return true;
    seen.add(id);
    const question = questions.find((item) => item.id === id);
    if (!question) continue;
    for (const choice of question.choices) pending.push(choice.next);
  }
  return false;
}

function ProductPicker({ products, selected, onChange }: { products: QuizProductOption[]; selected: string[]; onChange: (handles: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = products.filter((product) => !selected.includes(product.handle) && (!needle || product.title.toLowerCase().includes(needle) || product.handle.includes(needle)));
  const name = (handle: string) => products.find((product) => product.handle === handle)?.title ?? handle;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-[#616161]">מוצרים שיופיעו בסוף, אחרי התשובה הזו</span>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((handle) => (
          <button key={handle} type="button" onClick={() => onChange(selected.filter((item) => item !== handle))} className="h-7 rounded-full border-0 bg-white px-2.5 text-xs font-semibold">{name(handle)} ×</button>
        ))}
        {selected.length < 4 ? (
          <button type="button" onClick={() => setOpen((value) => !value)} className="h-7 rounded-full border-0 bg-[#1a1a1a] px-2.5 text-xs font-semibold text-white">הוספת מוצר</button>
        ) : null}
      </div>
      {open && selected.length < 4 ? (
        <div className="rounded-xl bg-white p-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש מוצר" className={popupFieldClass} />
          <div className="mt-2 flex max-h-40 flex-col overflow-y-auto">
            {matches.length === 0 ? <span className="px-2 py-2 text-xs text-[#8a8a8a]">אין מוצרים להוספה</span> : null}
            {matches.map((product) => (
              <button key={product.id} type="button" onClick={() => { onChange([...selected, product.handle]); setQuery(""); }} className="rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f6f6f6]">{product.title}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CopyEditor({ document, onChange }: { document: QuizDocument; onChange: (next: Partial<QuizDocument>) => void }) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <b className="text-sm">מסך הפתיחה</b>
        <Field label="שורה קטנה" value={document.introEyebrow} max={40} onChange={(introEyebrow) => onChange({ introEyebrow })} />
        <Area label="כותרת" value={document.introTitle} max={120} onChange={(introTitle) => onChange({ introTitle })} hint="שורה חדשה שוברת את הכותרת לשתי שורות." />
        <Area label="טקסט" value={document.introText} max={280} onChange={(introText) => onChange({ introText })} />
        <Field label="כפתור" value={document.startLabel} max={40} onChange={(startLabel) => onChange({ startLabel })} />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[#616161]">תוויות</span>
          {document.pills.map((pill, index) => (
            <div key={index} className="flex gap-2">
              <input value={pill} onChange={(event) => onChange({ pills: document.pills.map((item, itemIndex) => itemIndex === index ? event.target.value.slice(0, 40) : item) })} className={popupFieldClass + " mt-0"} />
              <button type="button" onClick={() => onChange({ pills: document.pills.filter((_, itemIndex) => itemIndex !== index) })} className="h-[34px] rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm">×</button>
            </div>
          ))}
          {document.pills.length < 6 ? <button type="button" onClick={() => onChange({ pills: [...document.pills, ""] })} className="h-9 w-fit rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold">תווית חדשה</button> : null}
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <b className="text-sm">התמונה בצד</b>
        <Field label="כתובת תמונה" value={document.image} max={800} onChange={(image) => onChange({ image })} />
        <Field label="אחוז" value={document.mediaPercent} max={8} onChange={(mediaPercent) => onChange({ mediaPercent })} />
        <Field label="שורה קטנה" value={document.mediaEyebrow} max={40} onChange={(mediaEyebrow) => onChange({ mediaEyebrow })} />
        <Field label="שורה מתחת" value={document.mediaLabel} max={80} onChange={(mediaLabel) => onChange({ mediaLabel })} />
      </section>
      <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <b className="text-sm">טופס הפרטים</b>
        <Field label="כותרת" value={document.formTitle} max={120} onChange={(formTitle) => onChange({ formTitle })} />
        <Area label="טקסט" value={document.formText} max={240} onChange={(formText) => onChange({ formText })} />
        <Field label="כפתור" value={document.submitLabel} max={40} onChange={(submitLabel) => onChange({ submitLabel })} />
        <Area label="שורה משפטית" value={document.legal} max={240} onChange={(legal) => onChange({ legal })} />
      </section>
      <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <b className="text-sm">מסך הקוד והמוצרים</b>
        <Field label="ברכה" value={document.doneEyebrow} max={80} onChange={(doneEyebrow) => onChange({ doneEyebrow })} hint="{name} מתחלף בשם הפרטי." />
        <Field label="כותרת" value={document.doneTitle} max={80} onChange={(doneTitle) => onChange({ doneTitle })} />
        <Area label="טקסט" value={document.doneText} max={240} onChange={(doneText) => onChange({ doneText })} />
        <Field label="כותרת המוצרים" value={document.recoTitle} max={80} onChange={(recoTitle) => onChange({ recoTitle })} />
        <Field label="כפתור החנות" value={document.shopLabel} max={40} onChange={(shopLabel) => onChange({ shopLabel })} />
      </section>
    </div>
  );
}

function Field({ label, value, max, hint, onChange }: { label: string; value: string; max: number; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-[#616161]">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value.slice(0, max))} className={popupFieldClass} />
      {hint ? <span className="mt-1 block font-normal text-[#8a8a8a]">{hint}</span> : null}
    </label>
  );
}

function Area({ label, value, max, hint, onChange }: { label: string; value: string; max: number; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-[#616161]">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value.slice(0, max))} className={popupAreaClass} rows={3} />
      {hint ? <span className="mt-1 block font-normal text-[#8a8a8a]">{hint}</span> : null}
    </label>
  );
}
