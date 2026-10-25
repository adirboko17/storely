import type { Metadata } from "next";
import { QuizEditorScreen } from "@/components/admin/marketing/quiz-editor-screen";

export const metadata: Metadata = { title: "שאלון" };

export default function QuizPage() {
  return <QuizEditorScreen />;
}
