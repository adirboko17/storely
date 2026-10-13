import { leaveClientStore } from "@/app/platform/actions";

export function PlatformReturnBar({ name }: { name: string }) {
  return (
    <div className="flex h-10 items-center gap-3 border-b border-[#ebebeb] bg-white px-3">
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-[13px] text-[#616161]">ממשק הלקוח</span>
      <form action={leaveClientStore} className="ms-auto">
        <button type="submit" className="text-[13px] font-semibold text-[#005bd3]">
          חזרה לפלטפורמה
        </button>
      </form>
    </div>
  );
}
