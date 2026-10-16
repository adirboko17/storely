import assert from "node:assert/strict";
import test from "node:test";
import type { EmailBlock, Flow } from "@/data/mock/marketing-session";
import { renderEmailDocument, sampleEmailProfile } from "./email-document";
import { mockEmailProvider, planDelivery } from "./provider";
import { simulateFlow } from "./simulate";

const profile = sampleEmailProfile("חנות לדוגמה", "https://cdn.example.test/logo.png");

const blocks: EmailBlock[] = [
  { id: "logo", type: "logo" },
  { id: "h", type: "heading", text: "שלום {first_name}", align: "start", color: "#111", font: "Heebo", size: 28, weight: 700, italic: false, underline: false, strike: false },
  { id: "t", type: "text", text: "מאת {store_name}", align: "start", color: "#333", font: "Heebo", size: 16, weight: 400, italic: false, underline: false, strike: false },
  { id: "img", type: "image", src: "https://cdn.example.test/a.png", alt: "באנר", href: "{store_url}" },
  { id: "btn", type: "button", label: "לאתר", href: "{store_url}", align: "center", color: "#111", textColor: "#fff", font: "Heebo", size: 16, weight: 700, italic: false, underline: false, strike: false },
  { id: "cols", type: "columns", left: "ימין", right: "שמאל", color: "#333", font: "Heebo", size: 16, weight: 400, italic: false, underline: false, strike: false },
  { id: "sp", type: "spacer", size: "m" },
  { id: "dv", type: "divider", color: "#eee" },
];

test("renders rtl html and plain text for every block", () => {
  const document = renderEmailDocument({ subject: "נושא {store_name}", preview: "תצוגה", blocks }, profile);
  assert.match(document.html, /dir="rtl"/);
  assert.match(document.html, /max-width:620px/);
  assert.match(document.html, /שלום דנה/);
  assert.match(document.html, /חנות לדוגמה/);
  assert.match(document.html, /https:\/\/cdn.example.test\/logo.png/);
  assert.match(document.html, /class="stack"/);
  assert.match(document.subject, /חנות לדוגמה/);
  assert.match(document.text, /שלום דנה/);
  assert.match(document.text, /לאתר: https:\/\/example.test/);
  assert.equal(document.html.includes("<script"), false);
});

test("escapes html in personalized text", () => {
  const document = renderEmailDocument(
    { subject: "x", preview: "", blocks: [{ id: "t", type: "text", text: "<b>{first_name}</b>", align: "start", color: "#333", font: "", size: 16, weight: 400, italic: false, underline: false, strike: false }] },
    { ...profile, firstName: "<script>" },
  );
  assert.equal(document.html.includes("<script>"), false);
  assert.match(document.html, /&lt;script&gt;/);
});

const flow: Flow = {
  id: 7,
  name: "בדיקה",
  trigger: "הלקוח נטש עגלה",
  on: false,
  stats: null,
  steps: [
    { type: "wait", value: "2", unit: "שעות" },
    {
      type: "cond",
      match: "all",
      rules: [{ field: "subscribed", op: "is", value: "yes" }],
      yes: [{ type: "email", emailId: "mail-1" }],
      no: [{ type: "end" }],
    },
  ],
};

test("simulation follows yes and no without sending", async () => {
  const allow = async () => ({ allowed: true, reason: "allowed" });
  const yes = await simulateFlow(flow, "הלקוח נטש עגלה", {
    email: "a@example.test", phone: "", name: "א", subscribed: true, opened: false, clicked: false, inCart: true, paid: false, orders: 0, spent: 0, segment: "",
  }, allow, { email: () => ({ subject: "שלום", preview: "", html: "<p>שלום</p>", text: "שלום" }), sms: () => "" });
  assert.deepEqual(yes.steps.map((step) => step.outcome), ["wait", "yes", "would_send"]);
  assert.equal(yes.steps[0]?.detail.simulatedElapsed, 0);
  assert.equal(yes.steps[0]?.detail.minutes, 120);
  assert.equal(yes.deliveries.every((delivery) => delivery.dispatched === false), true);

  const no = await simulateFlow(flow, "הלקוח נטש עגלה", {
    email: "b@example.test", phone: "", name: "ב", subscribed: false, opened: false, clicked: false, inCart: false, paid: false, orders: 0, spent: 0, segment: "",
  }, allow);
  assert.deepEqual(no.steps.map((step) => step.outcome), ["wait", "no", "end"]);
  assert.equal(no.wouldSend, false);
});

test("a second logical send is still not dispatched", async () => {
  const first = await mockEmailProvider.deliver(planDelivery({
    storeId: "store", channel: "email", to: "a@example.test", consentAllowed: true, consentReason: "allowed",
    document: { subject: "שלום", preview: "", html: "<p>שלום</p>", text: "שלום" },
  }));
  const second = await mockEmailProvider.deliver(planDelivery({
    storeId: "store", channel: "email", to: "a@example.test", consentAllowed: false, consentReason: "unsubscribe",
    document: { subject: "שלום", preview: "", html: "<p>שלום</p>", text: "שלום" },
  }));
  assert.equal(first.dispatched, false);
  assert.equal(first.reason, "provider_not_connected");
  assert.equal(second.reason, "suppressed");
});

test("ab and both branches stay inside the simulation", async () => {
  const branched: Flow = {
    id: 8,
    name: "פיצול",
    trigger: "הזמנה שולמה",
    on: true,
    stats: null,
    steps: [
      { type: "ab", percent: 100, a: [{ type: "email", emailId: "mail-1" }], b: [{ type: "end" }] },
      { type: "both", mail: [{ type: "email", emailId: "mail-1" }], phone: [{ type: "sms", smsId: "sms-1" }] },
    ],
  };
  const result = await simulateFlow(branched, "הזמנה שולמה", {
    email: "a@example.test", phone: "050", name: "א", subscribed: true, opened: false, clicked: false, inCart: false, paid: true, orders: 1, spent: 10, segment: "",
  }, async () => ({ allowed: true, reason: "allowed" }), {
    email: () => ({ subject: "שלום", preview: "", html: "<p>שלום</p>", text: "שלום" }),
    sms: () => "היי",
  });
  assert.equal(result.steps.some((step) => step.outcome === "a"), true);
  assert.equal(result.steps.filter((step) => step.outcome === "would_send").length, 3);
  assert.equal(result.deliveries.every((delivery) => delivery.dispatched === false && delivery.provider === "mock"), true);
});

test("unmatched trigger does not walk steps", async () => {
  const result = await simulateFlow(flow, "הזמנה שולמה", {
    email: "a@example.test", phone: "", name: "א", subscribed: true, opened: false, clicked: false, inCart: false, paid: true, orders: 1, spent: 10, segment: "",
  }, async () => ({ allowed: true, reason: "allowed" }));
  assert.equal(result.matched, false);
  assert.equal(result.steps[0]?.outcome, "skipped");
});
