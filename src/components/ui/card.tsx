import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-white shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}
