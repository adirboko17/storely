const COLORS: Array<[string, Array<[string, string, string]>]> = [
  ["משטחים", [["--bg-app", "#f1f1f1", "רקע אפליקציה"], ["--bg-nav", "#ebebeb", "סרגל צד"], ["--surface", "#ffffff", "כרטיס"], ["--surface-subdued", "#f7f7f7", "כותרת טבלה"], ["--surface-selected", "#f1f1f1", "שורה נבחרת"], ["--topbar", "#1a1a1a", "סרגל עליון"]]],
  ["טקסט וגבולות", [["--text", "#303030", "טקסט ראשי"], ["--text-secondary", "#616161", "טקסט משני"], ["--text-disabled", "#b5b5b5", "מושבת"], ["--border", "#e3e3e3", "גבול / מפריד"], ["--border-input", "#8a8a8a", "גבול שדה"], ["--focus", "#005bd3", "טבעת פוקוס"]]],
  ["סמנטי", [["--success-bg", "#cdfee1", "הצלחה / פעיל"], ["--success-text", "#0c5132", "טקסט הצלחה"], ["--warning-bg", "#ffeb78", "לא נשלח"], ["--attention-bg", "#ffd6a4", "ממתין לתשלום"], ["--critical", "#e51c00", "שגיאה"], ["--critical-bg", "#fedad9", "רקע שגיאה"], ["--info-bg", "#e0f0ff", "טיוטה / מידע"], ["--info-text", "#00527c", "טקסט מידע"]]],
  ["פעולה ונתונים", [["--btn-primary", "#303030", "כפתור ראשי"], ["--btn-primary-hover", "#1a1a1a", "ריחוף ראשי"], ["--link", "#005bd3", "קישור"], ["--chart-1", "#2c6ecb", "סדרה נוכחית"], ["--chart-2", "#9cc3ee", "תקופת השוואה"]]],
];

const TYPE = [
  ["heading-lg", "כותרת עמוד", "22px", 700, "28px"],
  ["heading-md", "כותרת כרטיס", "15px", 700, "20px"],
  ["heading-sm", "כותרת משנה בכרטיס", "14px", 600, "20px"],
  ["body-md", "טקסט גוף, תאי טבלה, שדות", "14px", 400, "20px"],
  ["body-sm", "תוויות טבלה, טקסט עזר", "13px", 500, "18px"],
  ["caption", "כיתוב, חותמות זמן", "12px", 400, "16px"],
  ["metric", "ערכי מדדים", "20px", 700, "24px"],
] as const;

const card = "rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_0_rgba(26,26,26,.07)]";

export function DesignSystemScreen() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6">
      <div>
        <h1 className="m-0 text-[22px] leading-7 font-bold">מערכת עיצוב · מדף</h1>
        <div className="mt-0.5 text-ink-secondary">גרסה 0.1 · שלב 1 · טוקנים, רכיבים וכללי RTL לכל מודולי ה-CMS</div>
      </div>
      <div className={`grid gap-4 ${card} min-[800px]:grid-cols-2 min-[1100px]:grid-cols-4`}>
        {[["מעטפת", "סרגל עליון כהה ונמוך, סרגל צד אפור ניטרלי, ומשטח תוכן בהיר עם פינות מעוגלות. הניווט הראשי קבוע, ותתי-הפריטים נפתחים רק במודול הפעיל."], ["צפיפות", "טקסט גוף 14px, שורות טבלה בגובה 44px, כפתורים ושדות בגובה 32px. כותרות עמוד קטנות (22px) כדי שהנתונים יהיו במרכז."], ["משטחים", "כרטיסים לבנים עם קו מתאר של 7% שחור וצל תחתון של 1px. אין גרדיאנטים ואין צבע רקע לכרטיסי מדדים. הצבע שמור לסטטוסים בלבד."], ["עריכה", "עמודה ראשית ועמודה משנית של 320px. כל שינוי מחליף את הסרגל העליון בסרגל שינויים שלא נשמרו, ויציאה מהדף דורשת אישור."]].map(([title, body]) => (
          <div key={title}><h3 className="m-0 mb-1 text-sm font-bold">{title}</h3><p className="m-0 text-pretty text-ink-secondary">{body}</p></div>
        ))}
      </div>
      <div className={`flex flex-col gap-4 ${card}`}>
        <h2 className="m-0 text-[15px] font-bold">צבעים</h2>
        {COLORS.map(([group, list]) => (
          <div key={group} className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-secondary">{group}</span>
            <div className="grid gap-2 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
              {list.map(([token, value, label]) => (
                <div key={token} className="flex items-center gap-2.5 rounded-[10px] border border-[#ebebeb] p-2">
                  <span className="size-9 shrink-0 rounded-lg" style={{ background: value, boxShadow: value === "#ffffff" || value === "#f7f7f7" || value === "#f1f1f1" ? "inset 0 0 0 1px #e3e3e3" : "none" }} />
                  <span className="flex min-w-0 flex-col leading-4"><span dir="ltr" className="text-right font-mono text-xs font-semibold">{token}</span><span dir="ltr" className="text-right font-mono text-xs text-ink-secondary">{value}</span><span className="text-xs text-ink-secondary">{label}</span></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-4 min-[800px]:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
          <div className="px-4 pt-4 pb-2"><h2 className="m-0 text-[15px] font-bold">טיפוגרפיה · Assistant</h2><div className="text-[13px] text-ink-secondary">משפחה אחת, משקלים 400 / 500 / 600 / 700.</div></div>
          {TYPE.map(([token, label, size, weight, line]) => (
            <div key={token} className="flex items-baseline gap-3 border-t border-[#ebebeb] px-4 py-2.5">
              <span className="flex-1" style={{ fontSize: size, fontWeight: weight, lineHeight: line }}>{label}</span>
              <span dir="ltr" className="font-mono text-xs whitespace-nowrap text-ink-secondary">{token} {size}/{line} · {weight}</span>
            </div>
          ))}
        </div>
        <div className={card}>
          <h2 className="m-0 text-[15px] font-bold">מרווחים וגאומטריה</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {[4, 8, 12, 16, 20, 24, 32, 48].map((value) => (
              <div key={value} className="flex flex-col items-center gap-1 text-xs text-ink-secondary">
                <span className="bg-[#2c6ecb]" style={{ width: value, height: value }} />
                {value}px
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col text-sm">
            {[["סרגל עליון", "56px"], ["רוחב סרגל צד", "240px"], ["ריפוד עמוד", "24px"], ["עמודה משנית", "320px"], ["רדיוס כרטיס", "12px"], ["רדיוס שדה", "8px"]].map(([label, value]) => (
              <div key={label} className="flex justify-between border-t border-[#ebebeb] py-2"><span>{label}</span><span dir="ltr">{value}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
