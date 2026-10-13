import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div
      data-screen-label="Module placeholder"
      className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6 min-[1000px]:py-6"
    >
      <h1 className="m-0 text-[22px] leading-7 font-bold">{title}</h1>
      <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-14 text-center shadow-[var(--shadow-card)]">
        <div className="grid size-14 place-items-center rounded-full bg-[#f1f1f1] text-[#8a8a8a]">
          <Icon name="placeholder" size={26} strokeWidth={1.5} />
        </div>
        <div className="text-base font-bold">המסך הזה יעוצב בשלב 4</div>
        <div className="max-w-[420px] text-ink-secondary">
          המודול ייבנה על אותה מעטפת, אותם רכיבים ואותם טוקנים של המסכים הקיימים.
        </div>
        <Link
          href="/admin"
          className="mt-1 inline-flex h-8 items-center rounded-lg bg-white px-3 text-sm font-semibold text-ink no-underline shadow-[0_0_0_1px_#d4d4d4,inset_0_-1px_0_#e3e3e3] hover:no-underline"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
