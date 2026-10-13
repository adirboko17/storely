import type { FulfillmentStatus } from "@/types/commerce";

const FULFILLMENT: Record<FulfillmentStatus, [string, string, string]> = {
  unfulfilled: ["לא נשלח", "#ffeb78", "#4f4700"],
  fulfilled: ["נשלח", "#ebebeb", "#303030"],
  partial: ["נשלח חלקית", "#ffeb78", "#4f4700"],
  onhold: ["בהמתנה", "#ffeb78", "#4f4700"],
};

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  const [label, background, color] = FULFILLMENT[status];
  return (
    <span
      className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-lg px-2 text-[13px] font-medium"
      style={{ background, color }}
    >
      <span className="size-1.5 rounded-full border-[1.5px] border-current" />
      {label}
    </span>
  );
}
