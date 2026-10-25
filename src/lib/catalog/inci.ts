const LABEL = /^(?:full\s+ingredients?|ingredients?|inci(?:\s+list)?|composition|רשימת\s+inci|רשימת\s+רכיבים|רכיבים)/i;

export function parseInciPaste(raw: string): string[] {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .trim();
  if (!cleaned) return [];

  const text = stripLabel(cleaned);
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  const chars = [...text];

  function push() {
    const name = cleanInciPart(current);
    current = "";
    if (name) parts.push(name);
  }

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    if (char === "(" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }
    if (depth === 0 && (char === "," || char === ";" || char === "\n" || char === "•" || char === "·" || char === "、" || char === "，" || char === "،")) {
      push();
      continue;
    }
    if (depth === 0 && char === " " && chars[index + 1] === "/" && chars[index + 2] === " ") {
      push();
      index += 2;
      continue;
    }
    if (depth === 0 && char === " " && chars[index + 1] === "|" && chars[index + 2] === " ") {
      push();
      index += 2;
      continue;
    }
    if (depth === 0 && chars.slice(index, index + 5).join("").toLowerCase() === " and ") {
      push();
      index += 4;
      continue;
    }
    if (char === "\r") continue;
    current += char;
  }
  push();

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of parts) {
    const key = inciKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(part);
  }
  return names;
}

export function inciKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function takeInciPaste(existing: string[], raw: string, room: number) {
  const parsed = parseInciPaste(raw);
  const seen = new Set(existing.map(inciKey));
  const added: string[] = [];
  let skipped = 0;
  let overflow = 0;
  const space = Math.max(0, room);
  for (const name of parsed) {
    if (seen.has(inciKey(name))) {
      skipped += 1;
      continue;
    }
    if (added.length >= space) {
      overflow += 1;
      continue;
    }
    seen.add(inciKey(name));
    added.push(name);
  }
  return { parsed: parsed.length, added, skipped, overflow };
}

function stripLabel(value: string) {
  const match = LABEL.exec(value);
  if (!match || match.index !== 0) return value;
  const after = value.slice(match[0].length);
  const separator = /^\s*([:：])?\s*/.exec(after);
  const rest = after.slice(separator?.[0].length ?? 0).trim();
  if (separator?.[1] || /[,;،，\n•·]/.test(rest)) return rest;
  return value;
}

function cleanInciPart(value: string) {
  let text = value.replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:and|&)\s+/i, "");
  text = text.replace(/^\d{1,3}[.)]\s+/, "");
  text = text.replace(/^[-–—*•·]+\s*/, "");
  text = text.replace(/[.,;:*]+$/g, "").trim();
  text = text.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
  if (text.length < 2) return "";
  if (/^(?:ingredients?|inci|composition|רכיבים)$/i.test(text)) return "";
  return text;
}
