"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { popupAreaClass, popupFieldClass } from "@/lib/marketing/popups";
import {
  listQuizProducts,
  loadQuiz,
  newQuizId,
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
  const [quiz, setQuiz] = useState<StoreQuiz | null>(null);
  const [saved, setSaved] = useState<StoreQuiz | null>(null);
  const [stored, setStored] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"questions" | "copy">("questions");
  const [products, setProducts] = useState<QuizProductOption[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
  }, [toast]);

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
      <div className="bg-[#f3f3f3] px-4 py-5">
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
const selectClass = "h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm";

function FlowEditor({ document, products, onChange }: { document: QuizDocument; products: QuizProductOption[]; onChange: (next: QuizDocument) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const loose = document.questions.filter((question) => !quizReaches(document, question.id));

  function reveal(choiceId: string) {
    setOpen((current) => ({ ...current, [choiceId]: true }));
  }

  function dropLoose() {
    onChange({ ...document, questions: document.questions.filter((question) => quizReaches(document, question.id)) });
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3">
      <p className="m-0 text-sm text-[#4a4a4a]">כל תשובה נפתחת אל השאלה שבאה אחריה. אם שתי תשובות ממשיכות לאותו מקום, כתוב את זה במפורש.</p>
      <QuestionCard document={document} questionId={document.entry} depth={1} products={products} ancestors={[]} open={open} onToggle={(choiceId) => setOpen((current) => ({ ...current, [choiceId]: !current[choiceId] }))} onReveal={reveal} onChange={onChange} />
      {loose.length ? (
        <section className="rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <b className="text-sm">שאלות שאף תשובה לא מגיעה אליהן</b>
          <p className="mb-3 mt-1 text-xs text-[#8a8a8a]">{loose.length === 1 ? "שאלה אחת נותקה מהמסלול." : `${loose.length} שאלות נותקו מהמסלול.`}</p>
          <button type="button" onClick={dropLoose} className="h-9 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold">מחיקה</button>
        </section>
      ) : null}
    </div>
  );
}

function QuestionCard({
  document,
  questionId,
  depth,
  products,
  ancestors,
  open,
  onToggle,
  onReveal,
  onChange,
}: {
  document: QuizDocument;
  questionId: string;
  depth: number;
  products: QuizProductOption[];
  ancestors: string[];
  open: Record<string, boolean>;
  onToggle: (choiceId: string) => void;
  onReveal: (choiceId: string) => void;
  onChange: (next: QuizDocument) => void;
}) {
  const question = document.questions.find((item) => item.id === questionId);
  if (!question) return <p className="m-0 text-sm text-[#8a1f11]">השאלה הבאה נמחקה.</p>;
  if (ancestors.includes(question.id)) return <p className="m-0 text-sm text-[#8a1f11]">המסלול חוזר לשאלה שכבר הופיעה למעלה.</p>;
  const step: QuizQuestion = question;
  const trail = [...ancestors, step.id];

  function update(next: QuizQuestion) {
    onChange({ ...document, questions: document.questions.map((item) => item.id === next.id ? next : item) });
  }

  function patchChoice(choiceId: string, patch: Partial<QuizChoice>, extra: QuizQuestion[] = []) {
    const questions = document.questions.map((item) => item.id !== step.id ? item : {
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

  function moveChoice(choiceId: string, direction: -1 | 1) {
    const from = step.choices.findIndex((choice) => choice.id === choiceId);
    const target = from + direction;
    if (from < 0 || target < 0 || target >= step.choices.length) return;
    const choices = [...step.choices];
    const [item] = choices.splice(from, 1);
    if (!item) return;
    choices.splice(target, 0, item);
    update({ ...step, choices });
  }

  function addChoice() {
    if (step.choices.length >= 12) return;
    update({ ...step, choices: [...step.choices, { id: newQuizId("a"), label: "", next: FORM, products: [] }] });
  }

  function removeChoice(choiceId: string) {
    if (step.choices.length < 2) return;
    update({ ...step, choices: step.choices.filter((choice) => choice.id !== choiceId) });
  }

  function follow(choice: QuizChoice, value: string) {
    if (value === NEW_QUESTION) {
      if (document.questions.length >= 40) return;
      const created: QuizQuestion = { id: newQuizId("q"), title: "", choices: [{ id: newQuizId("a"), label: "", next: FORM, products: [] }] };
      patchChoice(choice.id, { next: created.id }, [created]);
      onReveal(choice.id);
      return;
    }
    patchChoice(choice.id, { next: value });
    if (value !== FORM) onReveal(choice.id);
  }

  function separate(choice: QuizChoice) {
    const source = document.questions.find((item) => item.id === choice.next);
    if (!source || document.questions.length >= 40) return;
    const copy: QuizQuestion = {
      id: newQuizId("q"),
      title: source.title,
      choices: source.choices.map((item) => ({ ...item, id: newQuizId("a"), products: [...item.products] })),
    };
    patchChoice(choice.id, { next: copy.id }, [copy]);
    onReveal(choice.id);
  }

  function removeQuestion() {
    if (step.id === document.entry) return;
    const questions = document.questions
      .filter((item) => item.id !== step.id)
      .map((item) => ({ ...item, choices: item.choices.map((choice) => choice.next === step.id ? { ...choice, next: FORM, products: [] } : choice) }));
    const next = { ...document, questions };
    onChange({ ...next, questions: questions.filter((item) => quizReaches(next, item.id)) });
  }

  return (
    <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
      <div className="flex items-center gap-2">
        <b className="flex-1 text-sm">{depth === 1 ? "השאלה הראשונה" : `שאלה ${depth}`}</b>
        {question.id !== document.entry ? <button type="button" onClick={removeQuestion} className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-xs font-semibold">מחיקת השאלה</button> : null}
      </div>
      <label className="text-xs font-semibold text-[#616161]">
        נוסח השאלה
        <textarea value={question.title} onChange={(event) => update({ ...question, title: event.target.value.slice(0, 160) })} className={popupAreaClass} rows={2} />
      </label>
      <div className="flex flex-col gap-2">
        {question.choices.map((choice, index) => {
          const nextQuestion = document.questions.find((item) => item.id === choice.next);
          const owner = firstAnswer(document.questions, choice.next, choice.id);
          const shared = Boolean(owner) && !ancestors.includes(choice.next);
          const expanded = open[choice.id] === true;
          return (
            <div key={choice.id} className="flex flex-col gap-2 rounded-2xl bg-[#f6f6f6] p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#8a8a8a]">{index + 1}</span>
                <input aria-label={`תשובה ${index + 1}`} value={choice.label} onChange={(event) => patchChoice(choice.id, { label: event.target.value.slice(0, 80) })} placeholder="טקסט התשובה" className="h-[34px] min-w-0 flex-1 rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm" />
                <button type="button" aria-label="הזזה למעלה" onClick={() => moveChoice(choice.id, -1)} disabled={index === 0} className="grid size-7 place-items-center rounded-lg border-0 bg-white text-sm disabled:opacity-30">↑</button>
                <button type="button" aria-label="הזזה למטה" onClick={() => moveChoice(choice.id, 1)} disabled={index === question.choices.length - 1} className="grid size-7 place-items-center rounded-lg border-0 bg-white text-sm disabled:opacity-30">↓</button>
                <button type="button" aria-label="מחיקת תשובה" onClick={() => removeChoice(choice.id)} disabled={question.choices.length < 2} className="grid size-7 place-items-center rounded-lg border-0 bg-white text-sm disabled:opacity-30">×</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="לאן התשובה ממשיכה" value={choice.next === FORM ? FORM : choice.next} onChange={(event) => follow(choice, event.target.value)} className={selectClass}>
                  <option value={FORM}>מסיימים בטופס</option>
                  {choice.next !== FORM ? <option value={choice.next}>ממשיכים לשאלה הבאה</option> : null}
                  <option value={NEW_QUESTION}>פותחים שאלה חדשה</option>
                  {continuations(document, question.id, choice.next).map((item) => (
                    <option key={item.id} value={item.id}>ממשיכים כמו «{item.via}»</option>
                  ))}
                </select>
                {choice.next !== FORM ? (
                  <button type="button" onClick={() => onToggle(choice.id)} className="h-[34px] rounded-lg border-0 bg-white px-3 text-sm font-semibold">
                    {expanded ? "הסתרה" : "השאלה הבאה"}
                  </button>
                ) : null}
              </div>
              {choice.next === FORM ? (
                <ProductPicker products={products} selected={choice.products} onChange={(handles) => patchChoice(choice.id, { products: handles })} />
              ) : (
                <p className="m-0 text-xs text-[#616161]">
                  {shared && owner ? `ממשיכה לאותה שאלה כמו «${owner.label}».` : `השאלה הבאה: ${nextQuestion?.title.trim() || "בלי נוסח"}`}
                </p>
              )}
              {expanded && choice.next !== FORM && !ancestors.includes(choice.next) ? (
                <div className="border-s-2 border-[#e3e3e3] ps-3">
                  {shared && owner ? (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[#8a8a8a]">עריכה כאן משנה גם את «{owner.label}».</span>
                      <button type="button" onClick={() => separate(choice)} className="h-7 rounded-lg border-0 bg-white px-2.5 text-xs font-semibold">הפרדה לשאלה נפרדת</button>
                    </div>
                  ) : null}
                  <QuestionCard document={document} questionId={choice.next} depth={depth + 1} products={products} ancestors={trail} open={open} onToggle={onToggle} onReveal={onReveal} onChange={onChange} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addChoice} disabled={question.choices.length >= 12} className="h-10 rounded-xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white hover:bg-[#303030] disabled:opacity-40">תשובה חדשה</button>
    </section>
  );
}

function firstAnswer(questions: QuizQuestion[], questionId: string, choiceId: string) {
  for (const question of questions) {
    for (const choice of question.choices) {
      if (choice.id === choiceId) return null;
      if (choice.next === questionId && choice.label.trim()) return { choiceId: choice.id, label: choice.label.trim() };
    }
  }
  return null;
}

function continuations(document: QuizDocument, currentQuestionId: string, currentNext: string) {
  const question = document.questions.find((item) => item.id === currentQuestionId);
  if (!question) return [];
  const seen = new Set<string>();
  const items: { id: string; via: string }[] = [];
  for (const choice of question.choices) {
    const via = choice.label.trim();
    if (!via || choice.next === FORM || choice.next === currentNext || seen.has(choice.next)) continue;
    if (reaches(document.questions, choice.next, currentQuestionId)) continue;
    seen.add(choice.next);
    items.push({ id: choice.next, via });
  }
  return items;
}

function reaches(questions: QuizQuestion[], fromId: string, targetId: string) {
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
