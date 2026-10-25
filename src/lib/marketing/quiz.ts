import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type QuizChoice = {
  id: string;
  label: string;
  next: string;
  products: string[];
};

export type QuizQuestion = {
  id: string;
  title: string;
  choices: QuizChoice[];
};

export type QuizDocument = {
  introEyebrow: string;
  introTitle: string;
  introText: string;
  pills: string[];
  startLabel: string;
  image: string;
  mediaPercent: string;
  mediaEyebrow: string;
  mediaLabel: string;
  formTitle: string;
  formText: string;
  submitLabel: string;
  legal: string;
  doneEyebrow: string;
  doneTitle: string;
  doneText: string;
  recoTitle: string;
  shopLabel: string;
  entry: string;
  questions: QuizQuestion[];
};

export type QuizStatus = "draft" | "active";

export type StoreQuiz = {
  status: QuizStatus;
  updatedAt: string;
  document: QuizDocument;
};

export type QuizProductOption = {
  id: string;
  title: string;
  handle: string;
};

const FORM = "form";
const LIMITS = { questions: 40, choices: 12, products: 4, pills: 6 };

const NEED: Record<string, string> = {
  belly: "טיפוח עור הבטן וסימני מתיחה",
  legs: "הקלה על תחושת כבדות ברגליים",
  face: "טיפוח עור הפנים",
  birth: "הכנת הגוף ללידה",
  post: "טיפוח והקלה אחרי לידה",
  baby: "טיפוח עור התינוק",
  self: "פינוק וטיפוח עצמי",
};

const RECOMMEND: Record<string, string[]> = {
  belly: ["olilastic", "olineum"],
  legs: ["olilax", "olilastic"],
  face: ["facioli", "oliglow"],
  birth: ["olineum", "olilastic"],
  post: ["nippoli", "olineum"],
  baby: ["babyspa", "bottle"],
  self: ["bestof", "oliglow"],
};

function choice(id: string, label: string, next: string, products: string[] = []): QuizChoice {
  return { id, label, next, products };
}

function need(ids: string[]): QuizChoice[] {
  return ids.map((id) => choice(id, NEED[id] ?? id, FORM, RECOMMEND[id] ?? []));
}

function question(id: string, title: string, choices: QuizChoice[]): QuizQuestion {
  return { id, title, choices };
}

/** The homepage 5% quiz, written as an editable graph. */
export function defaultQuiz(): StoreQuiz {
  return {
    status: "draft",
    updatedAt: new Date().toISOString(),
    document: {
      introEyebrow: "מתנת הצטרפות",
      introTitle: "ענו על 3 שאלות\nוקבלו 5% הנחה",
      introText: "לרכישה הקרובה שלכן באתר. ובדרך נתאים לכן את המוצרים שהכי מתאימים לתקופה שלכן.",
      pills: ["3 שאלות קצרות", "פחות מדקה", "המלצות אישיות"],
      startLabel: "בואו נתחיל",
      image: "https://static.wixstatic.com/media/db159b_023efbddb9054a1695b0af97979b8d28f000.jpg",
      mediaPercent: "5%",
      mediaEyebrow: "מתנת הצטרפות",
      mediaLabel: "על ההזמנה הראשונה",
      formTitle: "יש לנו משהו במיוחד בשבילך 🤎",
      formText: "השאירי פרטים, קבלי 5% הנחה וגלי את המוצרים שמתאימים לך.",
      submitLabel: "קבלי את ההטבה שלי",
      legal: "בהשארת הפרטים את מאשרת לקבל מאיתנו עדכונים והטבות. אפשר להסיר בכל עת.",
      doneEyebrow: "ברוכה הבאה, {name}",
      doneTitle: "ההטבה שלך מוכנה",
      doneText: "שלחנו את הקוד גם למייל. מזינים אותו בקופה.",
      recoTitle: "המוצרים שמתאימים לך",
      shopLabel: "לכל המוצרים",
      entry: "q1",
      questions: [
        question("q1", "למי אנחנו מתאימות את שגרת הטיפוח?", [
          choice("preg", "אני בהריון", "q_preg"),
          choice("post", "אני אחרי לידה", "q_post"),
          choice("plan", "אני מתכננת הריון", "q_plan"),
          choice("baby", "אני מחפשת מוצרים לתינוק שלי", "q_baby"),
          choice("gift", "אני מחפשת מתנה", "q_gift"),
          choice("self", "אני מחפשת טיפוח לעצמי", "q_self"),
        ]),
        question("q_preg", "באיזה שלב את נמצאת?", [
          choice("t1", "שליש ראשון – שבועות 1–13", "q3_preg"),
          choice("t2", "שליש שני – שבועות 14–27", "q3_preg"),
          choice("t3", "שליש שלישי – שבוע 28 ומעלה", "q3_preg_late"),
        ]),
        question("q_post", "כמה זמן עבר מהלידה?", [
          choice("w6", "עד 6 שבועות", "q3_post"),
          choice("m6", "6 שבועות עד חצי שנה", "q3_post"),
          choice("y1", "יותר מחצי שנה", "q3_post"),
        ]),
        question("q_plan", "מתי את מתכננת להיכנס להריון?", [
          choice("soon", "בחודשים הקרובים", "q3_plan"),
          choice("year", "במהלך השנה הקרובה", "q3_plan"),
          choice("unk", "עוד לא בטוח", "q3_plan"),
        ]),
        question("q_baby", "בן או בת כמה התינוק?", [
          choice("nb", "יילוד, עד 3 חודשים", "q3_baby"),
          choice("b12", "3–12 חודשים", "q3_baby"),
          choice("b1", "מעל שנה", "q3_baby"),
        ]),
        question("q_gift", "למי המתנה?", [
          choice("gpreg", "לאישה בהריון", "q3_gift_preg"),
          choice("gpost", "ליולדת טרייה", "q3_gift_post"),
          choice("gbaby", "לתינוק החדש", "q3_gift_baby"),
        ]),
        question("q_self", "איך היית מתארת את העור שלך?", [
          choice("dry", "יבש ומבקש לחות", "q3_self"),
          choice("sens", "רגיש", "q3_self"),
          choice("norm", "רגיל", "q3_self"),
        ]),
        question("q3_preg", "מה הכי חשוב לך כרגע?", need(["belly", "legs", "face", "self"])),
        question("q3_preg_late", "מה הכי חשוב לך כרגע?", need(["belly", "birth", "legs", "face", "self"])),
        question("q3_post", "מה הכי חשוב לך כרגע?", need(["post", "belly", "face", "baby", "self"])),
        question("q3_plan", "מה הכי חשוב לך כרגע?", need(["belly", "face", "self"])),
        question("q3_baby", "מה הכי חשוב לך כרגע?", need(["baby", "post", "self"])),
        question("q3_gift_preg", "מה הכי חשוב לך כרגע?", need(["belly", "legs", "self"])),
        question("q3_gift_post", "מה הכי חשוב לך כרגע?", need(["post", "baby", "self"])),
        question("q3_gift_baby", "מה הכי חשוב לך כרגע?", need(["baby", "self"])),
        question("q3_self", "מה הכי חשוב לך כרגע?", need(["face", "legs", "belly", "self"])),
      ],
    },
  };
}

export function newQuizId(prefix: "q" | "a") {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function quizStatusLabel(status: QuizStatus) {
  return status === "active" ? "פעיל" : "טיוטה";
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, max) : "";
}

function kept(value: unknown, max: number, fallback: string) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, max) : fallback;
}

function quizId(value: unknown, fallback: string) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z][a-z0-9_]{0,24}$/.test(id) ? id : fallback;
}

function cleanImage(value: unknown) {
  const src = clip(value, 800).trim();
  return /^https:\/\/[^\s"'()<>]+$/i.test(src) ? src : "";
}

function cleanHandle(value: unknown) {
  const handle = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(handle) ? handle : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeQuiz(status: unknown, flow: unknown, updatedAt?: string): StoreQuiz {
  const base = defaultQuiz().document;
  const row = asRecord(flow);
  const seenQuestions = new Set<string>();
  const questions: QuizQuestion[] = [];
  const source = Array.isArray(row.questions) ? row.questions : [];
  for (const item of source) {
    if (questions.length >= LIMITS.questions) break;
    const record = asRecord(item);
    let id = quizId(record.id, "");
    if (!id || seenQuestions.has(id)) id = newQuizId("q");
    seenQuestions.add(id);
    const seenChoices = new Set<string>();
    const choices: QuizChoice[] = [];
    const rawChoices = Array.isArray(record.choices) ? record.choices : [];
    for (const raw of rawChoices) {
      if (choices.length >= LIMITS.choices) break;
      const choiceRow = asRecord(raw);
      let choiceId = quizId(choiceRow.id, "");
      if (!choiceId || seenChoices.has(choiceId) || choiceId === FORM) choiceId = newQuizId("a");
      seenChoices.add(choiceId);
      const products: string[] = [];
      if (Array.isArray(choiceRow.products)) {
        for (const product of choiceRow.products) {
          const handle = cleanHandle(product);
          if (!handle || products.includes(handle)) continue;
          products.push(handle);
          if (products.length >= LIMITS.products) break;
        }
      }
      const next = quizId(choiceRow.next, FORM);
      choices.push({ id: choiceId, label: clip(choiceRow.label, 80), next: next === id ? FORM : next, products });
    }
    if (!choices.length) choices.push({ id: newQuizId("a"), label: "", next: FORM, products: [] });
    questions.push({ id, title: clip(record.title, 160), choices });
  }
  if (!questions.length) questions.push({ id: "q1", title: "", choices: [{ id: "a1", label: "", next: FORM, products: [] }] });
  const ids = new Set(questions.map((item) => item.id));
  for (const item of questions) {
    for (const option of item.choices) {
      if (option.next !== FORM && !ids.has(option.next)) option.next = FORM;
    }
  }
  const entryId = quizId(row.entry, questions[0]?.id ?? "q1");
  const pills: string[] = [];
  const hasPills = Array.isArray(row.pills);
  if (hasPills) {
    for (const pill of row.pills as unknown[]) {
      const label = clip(pill, 40).trim();
      if (!label || pills.includes(label)) continue;
      pills.push(label);
      if (pills.length >= LIMITS.pills) break;
    }
  }
  return {
    status: status === "active" ? "active" : "draft",
    updatedAt: updatedAt || new Date().toISOString(),
    document: {
      introEyebrow: kept(row.introEyebrow, 40, base.introEyebrow),
      introTitle: kept(row.introTitle, 120, base.introTitle),
      introText: kept(row.introText, 280, base.introText),
      pills: hasPills ? pills : base.pills,
      startLabel: kept(row.startLabel, 40, base.startLabel),
      image: cleanImage(row.image),
      mediaPercent: kept(row.mediaPercent, 8, base.mediaPercent),
      mediaEyebrow: kept(row.mediaEyebrow, 40, base.mediaEyebrow),
      mediaLabel: kept(row.mediaLabel, 80, base.mediaLabel),
      formTitle: kept(row.formTitle, 120, base.formTitle),
      formText: kept(row.formText, 240, base.formText),
      submitLabel: kept(row.submitLabel, 40, base.submitLabel),
      legal: kept(row.legal, 240, base.legal),
      doneEyebrow: kept(row.doneEyebrow, 80, base.doneEyebrow),
      doneTitle: kept(row.doneTitle, 80, base.doneTitle),
      doneText: kept(row.doneText, 240, base.doneText),
      recoTitle: kept(row.recoTitle, 80, base.recoTitle),
      shopLabel: kept(row.shopLabel, 40, base.shopLabel),
      entry: ids.has(entryId) ? entryId : questions[0]?.id ?? "q1",
      questions,
    },
  };
}

export function quizProblem(quiz: StoreQuiz) {
  const { document } = quiz;
  if (document.image && !/^https:\/\/[^\s"'()<>]+$/i.test(document.image)) return "כתובת התמונה צריכה להתחיל ב-https";
  if (!document.questions.length) return "צריך לפחות שאלה אחת";
  if (!document.questions.some((item) => item.id === document.entry)) return "בחרו את השאלה הראשונה";
  const ids = new Set(document.questions.map((item) => item.id));
  for (const item of document.questions) {
    if (!item.title.trim()) return "לכל שאלה צריכה להיות כותרת";
    if (!item.choices.length) return "לכל שאלה צריכה להיות לפחות תשובה אחת";
    const choiceIds = new Set<string>();
    for (const option of item.choices) {
      if (!option.label.trim()) return "לכל תשובה צריך טקסט";
      if (choiceIds.has(option.id)) return "לכל תשובה צריך מזהה שונה";
      choiceIds.add(option.id);
      if (option.next !== FORM && !ids.has(option.next)) return "יש תשובה שמובילה לשאלה שלא קיימת";
      if (option.next === item.id) return "תשובה לא יכולה להוביל לאותה שאלה";
    }
  }
  const started = new Set<string>();
  const stack = new Set<string>();
  function walk(id: string): string | null {
    if (id === FORM) return null;
    if (stack.has(id)) return "השאלות מפנות אחת לשנייה במעגל";
    if (started.has(id)) return null;
    const item = document.questions.find((question) => question.id === id);
    if (!item) return "יש תשובה שמובילה לשאלה שלא קיימת";
    stack.add(id);
    for (const option of item.choices) {
      const problem = walk(option.next);
      if (problem) return problem;
    }
    stack.delete(id);
    started.add(id);
    return null;
  }
  return walk(document.entry);
}

export function quizReaches(document: QuizDocument, questionId: string) {
  const seen = new Set<string>();
  const pending = [document.entry];
  while (pending.length) {
    const id = pending.pop();
    if (!id || id === FORM || seen.has(id)) continue;
    seen.add(id);
    const item = document.questions.find((question) => question.id === id);
    if (!item) continue;
    for (const option of item.choices) pending.push(option.next);
  }
  return seen.has(questionId);
}

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

type QuizRow = { status: string; flow: unknown; updated_at: string };

export async function loadQuiz(): Promise<{ quiz: StoreQuiz; stored: boolean }> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("store_quizzes")
    .select("status, flow, updated_at")
    .eq("store_id", storeId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { quiz: defaultQuiz(), stored: false };
  const row = data as QuizRow;
  return { quiz: normalizeQuiz(row.status, row.flow, row.updated_at), stored: true };
}

export async function saveQuiz(input: StoreQuiz) {
  const quiz = normalizeQuiz(input.status, input.document, new Date().toISOString());
  const problem = quizProblem(quiz);
  if (problem) throw new Error(problem);
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("store_quizzes")
    .upsert({ store_id: storeId(), status: quiz.status, flow: quiz.document, updated_at: quiz.updatedAt }, { onConflict: "store_id" })
    .select("status, flow, updated_at")
    .single();
  if (error) throw new Error(error.message);
  const row = data as QuizRow;
  return normalizeQuiz(row.status, row.flow, row.updated_at);
}

export async function listQuizProducts(): Promise<QuizProductOption[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, title, handle, status")
    .eq("store_id", storeId())
    .eq("status", "active")
    .order("title");
  if (error) throw new Error(error.message);
  const products: QuizProductOption[] = [];
  for (const row of (data ?? []) as Array<{ id: string; title: string; handle: string | null; status: string }>) {
    const handle = cleanHandle(row.handle);
    const title = clip(row.title, 120).trim();
    if (!handle || !title) continue;
    products.push({ id: row.id, title, handle });
  }
  return products;
}
