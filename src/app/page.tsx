"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { AlertOctagon, CheckCircle2, ExternalLink, Send, ShieldCheck, ShoppingBag, Terminal } from "lucide-react";
import { CATALOG, MAX_TRANSACTION_LIMIT_INR, MIN_MERCHANT_MARGIN_FLOOR } from "@/lib/catalog";
import { evaluateCartAndNegotiation } from "@/lib/pricingEngine";

declare global {
  interface Window { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance; }
}

interface RazorpayOptions {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  handler: (response: { razorpay_payment_id: string }) => void;
  modal: { ondismiss: () => void }; theme: { color: string };
}
interface RazorpayInstance { open: () => void; }
interface ApiResponse { success?: boolean; error?: string; reason?: string; orderId?: string; recoveryUrl?: string; amount?: number; shieldTriggered?: boolean; isMock?: boolean; evaluation?: { marginPercent: number }; }
type AuditStatus = "OK" | "WARN" | "BLOCKED";
interface AuditEntry { time: string; step: string; message: string; status: AuditStatus; }
interface ChatMessage { role: "agent" | "user"; text: string; }

const headphonesId = "aura-anc-headphones";
const travelCaseId = "hard-shell-eva-travel-case";
const headphones = CATALOG.find((item) => item.id === headphonesId)!;

const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
const timestamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const entry = (step: string, message: string, status: AuditStatus, time = timestamp()): AuditEntry => ({ time, step, message, status });

export default function Home() {
  const [cart, setCart] = useState<string[]>([headphonesId]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "agent", text: `I found the ${headphones.name} for ${money(headphones.retailPrice)}. Add the Hard-Shell Case at its bundled price of ${money(599)}?` }]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([
    entry("SESSION", "Agent session initialized within merchant bounds.", "OK", "00:00:00"),
    entry("CATALOG", "Aura ANC Headphones verified in stock at baseline price.", "OK", "00:00:00"),
    entry("POLICY", "Negotiation guardrails loaded: 20% floor / ₹7,500 cap.", "OK", "00:00:00"),
  ]);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ paymentId: string; orderId: string; marginPercent: number } | null>(null);
  const [mockCheckout, setMockCheckout] = useState<{ orderId: string; amount: number; marginPercent: number } | null>(null);
  const [mockProcessing, setMockProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const mountedAt = timestamp();
      setAuditLog((current) => current.map((item) => item.time === "00:00:00" ? { ...item, time: mountedAt } : item));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const addAudit = (item: AuditEntry) => setAuditLog((current) => [item, ...current]);
  const addMessage = (message: string) => setMessages((current) => [...current, { role: "agent", text: message }]);

  function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    const normalized = message.toLowerCase();
    const amountMatch = message.replace(/,/g, "").match(/(?:₹|inr\s*)?(\d{2,5})/i);
    const detectedAmount = amountMatch ? Number(amountMatch[1]) : undefined;

    if (detectedAmount !== undefined) {
      const evaluation = evaluateCartAndNegotiation(cart, detectedAmount);
      if (evaluation.shieldTriggered) {
        addMessage(`That proposal is rejected: ${evaluation.reason}`);
        addAudit(entry("SHIELD", evaluation.reason, "BLOCKED"));
      } else if (evaluation.allowed) {
        addMessage(`Counter-offer accepted at ${money(detectedAmount)}. The gross merchant margin is ${evaluation.marginPercent}%.`);
        addAudit(entry("NEGOTIATE", `Agreed price ${money(detectedAmount)} remains above the margin floor.`, "OK"));
      } else {
        addMessage(evaluation.reason);
        addAudit(entry("NEGOTIATE", evaluation.reason, "BLOCKED"));
      }
      return;
    }

    if (/bundle|accessor|case|discount|save/.test(normalized)) {
      if (!cart.includes(travelCaseId)) {
        setCart([headphonesId, travelCaseId]);
        addMessage("Absolutely. I added the Hard-Shell Case at its bundled price of ₹599. Your bounded total is ₹4,898.");
        addAudit(entry("BUNDLE", "Accessory added at approved bundled price: ₹599.", "OK"));
      } else addMessage("The Hard-Shell Case is already bundled at ₹599, keeping the total at ₹4,898.");
      return;
    }

    addMessage(`Hello. I can help with the in-stock ${headphones.name} at ${money(headphones.retailPrice)} or the Hard-Shell Case at a ${money(599)} bundle price. Ask about specs, stock, or a bounded offer.`);
    addAudit(entry("ASSIST", "Answered a general catalog inquiry.", "OK"));
  }

  async function callApi(payload: Record<string, unknown>): Promise<ApiResponse> {
    const response = await fetch("/api/razorpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = (await response.json()) as ApiResponse;
    if (!response.ok || result.success === false) {
      throw new Error(result.error ?? `Razorpay request failed with status ${response.status}.`);
    }
    return result;
  }

  function acceptBundle() {
    setCart([headphonesId, travelCaseId]);
    addMessage("Bundle accepted. The travel case is discounted to ₹599, bringing the bounded total to ₹4,898.");
    addAudit(entry("BUNDLE", "Accessory attached at approved bundle price: ₹599.", "OK"));
  }

  async function bargain() {
    setBusy(true);
    try {
      const result = await callApi({ itemIds: cart, proposedTotal: 4600 });
      if (result.success) {
        addMessage(`Counter-offer approved at ₹4,600. Merchant margin remains ${result.evaluation?.marginPercent ?? 0}%.`);
        addAudit(entry("NEGOTIATE", "Counter-offer ₹4,600 accepted above margin floor.", "OK"));
      } else {
        addMessage(result.error ?? "The counter-offer was declined.");
        addAudit(entry("NEGOTIATE", result.error ?? "Counter-offer declined.", "WARN"));
      }
    } catch { addMessage("The negotiation service is temporarily unavailable."); addAudit(entry("NEGOTIATE", "Could not reach the pricing service.", "WARN")); }
    finally { setBusy(false); }
  }

  async function probeShield() {
    setBusy(true);
    try {
      const response = await fetch("/api/razorpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "negotiate", itemIds: cart, proposedTotal: 10 }) });
      const data = (await response.json()) as ApiResponse;
      const message = data.error || data.reason || "Adversarial exploit blocked: 20% merchant margin floor breached.";
      addAudit(entry("SHIELD", message, "BLOCKED"));
      addMessage("🛡️ Exploit Shield Intercept: Dynamic price tampering rejected by merchant guardrails.");
    } catch {
      addAudit(entry("SHIELD", "Adversarial exploit blocked: 20% merchant margin floor breached.", "BLOCKED"));
      addMessage("🛡️ Exploit Shield Intercept: Dynamic price tampering rejected by merchant guardrails.");
    }
    finally { setBusy(false); }
  }

  async function recoverCart() {
    try {
      const result = await callApi({ action: "create_recovery_link", itemIds: cart });
      if (result.success && result.recoveryUrl) { setRecoveryLink(result.recoveryUrl); addAudit(entry("RECOVERY", "15-minute recovery link issued after checkout dismissal.", "WARN")); }
      else addAudit(entry("RECOVERY", result.error ?? "Recovery link could not be created.", "WARN"));
    } catch { addAudit(entry("RECOVERY", "Recovery service could not be reached.", "WARN")); }
  }

  async function checkout() {
    setBusy(true);
    try {
      const result = await callApi({ itemIds: cart });
      if (!result.success || !result.orderId || !result.evaluation) { addMessage(result.error ?? "Checkout was blocked by merchant policy."); addAudit(entry("CHECKOUT", result.error ?? "Checkout blocked by policy.", "BLOCKED")); return; }
      if (result.isMock || !window.Razorpay) {
        setMockCheckout({ orderId: result.orderId, amount: result.amount ?? 0, marginPercent: result.evaluation.marginPercent });
        setMockProcessing(true);
        addAudit(entry("CHECKOUT", `Mock order ${result.orderId} authorized locally.`, "OK"));
        return;
      }
      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey || razorpayKey.includes("placeholder") || razorpayKey.includes("YOUR_KEY_ID") || razorpayKey === "your_key_id") {
        const warning = "Please set real test keys in .env.local and restart the server";
        addMessage(warning);
        addAudit(entry("CHECKOUT", warning, "WARN"));
        return;
      }
      addAudit(entry("CHECKOUT", `Order ${result.orderId} created for ${money(result.amount ?? 0)}.`, "OK"));
      const razorpay = new window.Razorpay({
        key: razorpayKey, amount: (result.amount ?? 0) * 100, currency: "INR", name: "TetherPay", description: "Bounded agentic commerce checkout", order_id: result.orderId,
        handler: (payment) => { setReceipt({ paymentId: payment.razorpay_payment_id, orderId: result.orderId!, marginPercent: result.evaluation!.marginPercent }); addMessage("Payment captured. Your bounded order is settled."); addAudit(entry("SETTLE", `Payment ${payment.razorpay_payment_id} captured successfully.`, "OK")); },
        modal: { ondismiss: recoverCart }, theme: { color: "#e85d3f" },
      });
      razorpay.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout could not be started.";
      addMessage(message);
      addAudit(entry("CHECKOUT", message, "WARN"));
    }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!mockCheckout) return;
    const timer = window.setTimeout(() => {
      const paymentId = `pay_mock_${Math.random().toString(36).substring(2, 9)}`;
      setReceipt({ paymentId, orderId: mockCheckout.orderId, marginPercent: mockCheckout.marginPercent });
      addMessage("Payment captured. Your bounded mock order is settled.");
      addAudit(entry("SETTLE", `Mock payment ${paymentId} captured successfully.`, "OK"));
      setMockCheckout(null);
      setMockProcessing(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [mockCheckout]);

  function cancelMockCheckout() {
    setMockCheckout(null);
    setMockProcessing(false);
    addMessage("Checkout closed. I created a recovery link so the cart is not lost.");
    addAudit(entry("CHECKOUT", "Mock checkout dismissed by customer.", "WARN"));
    void recoverCart();
  }

  function resetDemoSession() {
    setCart([headphonesId]);
    setReceipt(null);
    setRecoveryLink(null);
    setMockCheckout(null);
    setMockProcessing(false);
    addMessage("Agent session reset. The baseline headphones cart is ready.");
    addAudit(entry("SESSION", "Agent session reset", "OK"));
  }

  const total = cart.reduce((sum, itemId) => { const item = CATALOG.find((product) => product.id === itemId)!; return sum + (itemId === travelCaseId ? 599 : item.retailPrice); }, 0);
  const statusStyle = (status: AuditStatus) => status === "OK" ? "bg-[#91d6a6]/10 text-[#91d6a6]" : status === "WARN" ? "bg-[#d9a441]/10 text-[#e9bb60]" : "bg-[#df725f]/10 text-[#f38d7d]";

  return (<>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" />
    {receipt && <button type="button" onClick={resetDemoSession} className="fixed bottom-6 left-5 z-40 flex items-center gap-2 rounded-lg border border-[#17221f]/20 bg-[#eef0eb] px-5 py-4 text-sm font-bold text-[#17221f] shadow-lg transition hover:bg-white sm:left-auto sm:right-8">Reset Demo Session <CheckCircle2 size={16} /></button>}
    {mockCheckout && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17221f]/75 px-5 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="mock-checkout-title" className="w-full max-w-md rounded-xl bg-white p-6 text-[#17221f] shadow-2xl sm:p-8"><div className="mb-8 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e85d3f]">TetherPay Mock Gateway</p><h2 id="mock-checkout-title" className="mt-2 font-serif text-3xl">Secure checkout</h2></div><div className="rounded-full bg-[#e4f1e7] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#287345]">Local mode</div></div><div className="mb-7 flex items-center justify-between border-y border-[#17221f]/10 py-4"><span className="text-sm text-[#17221f]/55">Bounded order</span><span className="font-mono text-sm">{mockCheckout.orderId}</span></div><div className="mb-8 text-center"><p className="text-xs uppercase tracking-wider text-[#17221f]/45">Amount authorized</p><p className="mt-2 font-serif text-5xl">{money(mockCheckout.amount)}</p><div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#17221f]/60">{mockProcessing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#e85d3f]/25 border-t-[#e85d3f]" />}{mockProcessing ? "Authorizing payment..." : "Preparing secure authorization..."}</div></div><button type="button" onClick={cancelMockCheckout} className="w-full rounded-lg border border-[#17221f]/15 px-4 py-3 text-sm font-bold transition hover:border-[#e85d3f]">Cancel checkout</button><p className="mt-4 text-center text-[11px] leading-5 text-[#17221f]/45">This local gateway simulates a verified payment authorization.</p></div></div>}
    <main className="min-h-screen bg-[#f6f4ef] text-[#17221f] lg:grid lg:grid-cols-12">
      <section className="relative overflow-hidden px-5 py-6 sm:px-8 lg:col-span-8 lg:px-14 lg:py-10"><div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#f1c8a9]/40 blur-3xl" /><div className="relative mx-auto max-w-4xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#17221f]/10 pb-6"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#e85d3f]"><span className="h-2 w-2 rounded-full bg-[#e85d3f]" /> Merchant control plane</div><h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">TetherPay</h1><p className="mt-2 max-w-lg text-sm leading-6 text-[#17221f]/60">A bounded checkout agent that negotiates inside your commercial rules.</p></div><div className="flex shrink-0 items-center gap-2"><a href="/api/agent/mcp" target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full border border-[#17221f]/15 px-3 py-2 text-xs font-semibold transition hover:border-[#e85d3f] sm:flex"><Terminal size={14} /> MCP schema <ExternalLink size={13} /></a><button type="button" onClick={probeShield} disabled={busy} className="flex items-center gap-2 rounded-full bg-[#17221f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#e85d3f] disabled:opacity-60"><ShieldCheck size={15} /><span className="hidden sm:inline">Exploit Shield Probe</span><span className="sm:hidden">Probe</span></button></div></header>
  <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_260px]"><div className="flex min-h-[540px] flex-col rounded-[2px] border border-[#17221f]/10 bg-white/75 p-5 shadow-[0_20px_60px_rgba(23,34,31,0.06)] sm:p-7"><div className="mb-7 flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e85d3f] text-white"><ShoppingBag size={17} /></div><div><p className="text-sm font-bold">Agent conversation</p><p className="text-xs text-[#17221f]/45">Live negotiation channel</p></div></div><span className="rounded-full bg-[#e4f1e7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#287345]">Online</span></div><div className="flex-1 space-y-4">{messages.map((message, index) => <div key={`${message.text}-${index}`} className={message.role === "user" ? "ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#17221f] px-4 py-3 text-sm leading-6 text-white" : "max-w-[88%] rounded-2xl rounded-tl-sm bg-[#eef0eb] px-4 py-3 text-sm leading-6"}>{message.text}</div>)}{cart.length === 1 && <div className="rounded-xl border border-[#e85d3f]/25 bg-[#fff9f4] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#e85d3f]">Agent proposal</span><span className="font-serif text-lg">{money(4898)}</span></div><p className="mb-4 text-xs leading-5 text-[#17221f]/60">Bundle the protective case with your headphones and save ₹200.</p><div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={acceptBundle} className="flex-1 rounded-lg bg-[#e85d3f] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#c94d33]">Accept Bundle</button><button type="button" onClick={bargain} disabled={busy} className="flex-1 rounded-lg border border-[#17221f]/15 px-3 py-2.5 text-xs font-bold hover:border-[#e85d3f] disabled:opacity-50">Bargain (Counter-offer ₹4,600)</button></div></div>}</div><div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={acceptBundle} className="rounded-full border border-[#17221f]/15 px-3 py-1.5 text-[11px] font-semibold hover:border-[#e85d3f]">Accept Bundle</button><button type="button" onClick={bargain} disabled={busy} className="rounded-full border border-[#17221f]/15 px-3 py-1.5 text-[11px] font-semibold hover:border-[#e85d3f]">Bargain ₹4,600</button><button type="button" onClick={probeShield} disabled={busy} className="rounded-full border border-[#df725f]/30 px-3 py-1.5 text-[11px] font-semibold text-[#b94e3e] hover:border-[#df725f]">Probe ₹10</button></div><form onSubmit={handleSendMessage} className="mt-3 flex items-center gap-2 rounded-xl border border-[#17221f]/15 bg-white px-3 py-2 focus-within:border-[#e85d3f]"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message or offer, e.g. 'Can I get the case bundled for 4500?'..." aria-label="Message the merchant agent" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[#17221f]/35" /><button type="submit" disabled={!draft.trim() || busy} aria-label="Send message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#17221f] text-white hover:bg-[#e85d3f] disabled:opacity-40"><Send size={16} /></button></form>{recoveryLink && <div className="mt-6 flex items-center justify-between gap-3 border-l-4 border-[#d18b2b] bg-[#fff8e9] p-4"><div><p className="text-xs font-bold text-[#8c5c0d]">Abandoned cart recovered</p><p className="mt-1 text-xs text-[#17221f]/55">A 5% recovery incentive is active for 15 minutes.</p></div><a href={recoveryLink} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-[#8c5c0d] underline">Open link</a></div>}{receipt && <div className="mt-6 border-l-4 border-[#287345] bg-[#edf8ef] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#287345]"><CheckCircle2 size={16} /> Settled receipt</div><div className="grid grid-cols-3 gap-3 text-xs"><div><p className="text-[#17221f]/45">Payment ID</p><p className="mt-1 truncate font-mono font-bold">{receipt.paymentId}</p></div><div><p className="text-[#17221f]/45">Order ID</p><p className="mt-1 truncate font-mono font-bold">{receipt.orderId}</p></div><div><p className="text-[#17221f]/45">Final margin</p><p className="mt-1 font-bold text-[#287345]">{receipt.marginPercent}%</p></div></div></div>}<button type="button" onClick={checkout} disabled={busy} className="mt-7 flex w-full items-center justify-center gap-2 bg-[#e85d3f] px-5 py-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(232,93,63,0.2)] hover:bg-[#c94d33] disabled:opacity-60">{busy ? "Evaluating bounds..." : "Proceed to Bounded Razorpay Checkout"}<ExternalLink size={16} /></button></div>
          <aside className="rounded-[2px] border border-[#17221f]/10 bg-[#e7e8e2] p-5"><div className="mb-5 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-[#17221f]/50">Current cart</p><span className="font-mono text-xs">{cart.length} item{cart.length !== 1 ? "s" : ""}</span></div>{cart.map((itemId) => { const item = CATALOG.find((product) => product.id === itemId)!; return <div key={itemId} className="mb-3 border-b border-[#17221f]/10 pb-3"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{item.name}</span><span className="font-mono">{money(itemId === travelCaseId ? 599 : item.retailPrice)}</span></div><p className="mt-1 text-[11px] uppercase tracking-wider text-[#17221f]/40">{item.category} / in stock</p></div>; })}<div className="mt-5 flex items-end justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#17221f]/50">Bounded total</span><span className="font-serif text-2xl">{money(total)}</span></div></aside></div>
      </div></section>
      <section className="flex min-h-[620px] flex-col bg-[#17221f] px-5 py-6 text-[#eef0eb] sm:px-8 lg:col-span-4 lg:min-h-screen lg:px-8 lg:py-10"><div className="mx-auto flex w-full max-w-md flex-1 flex-col"><header className="border-b border-white/10 pb-6"><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#91d6a6]"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#91d6a6] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#91d6a6]" /></span> Secure runtime</div><h2 className="font-serif text-3xl">Live Agent Audit Trail</h2><p className="mt-2 text-sm text-white/45">Every decision is observable and bounded.</p></header><div className="mt-6 border border-white/10 bg-white/[0.04] p-4"><div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"><ShieldCheck size={15} className="text-[#91d6a6]" /> Active constraints</div><div className="grid grid-cols-2 gap-3"><div><p className="text-[10px] uppercase tracking-wider text-white/35">Max transaction</p><p className="mt-1 font-mono text-lg text-[#91d6a6]">{money(MAX_TRANSACTION_LIMIT_INR)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-white/35">Min margin floor</p><p className="mt-1 font-mono text-lg text-[#91d6a6]">{MIN_MERCHANT_MARGIN_FLOOR * 100}%</p></div></div></div><div className="mt-8 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">Event stream</p><span className="font-mono text-[10px] text-white/30">{auditLog.length.toString().padStart(2, "0")} events</span></div><div className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1">{auditLog.map((item, index) => <div key={`${item.time}-${item.step}-${index}`} className="border-b border-white/[0.07] py-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-white/35">{item.time}</span><span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold tracking-wider ${statusStyle(item.status)}`}>{item.status === "BLOCKED" && <AlertOctagon size={11} />}{item.status}</span></div><p className="text-[10px] font-bold uppercase tracking-wider text-white/45">{item.step}</p><p className="mt-1 text-sm leading-5 text-white/75">{item.message}</p></div>)}</div><div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-white/35"><CheckCircle2 size={14} className="text-[#91d6a6]" /> Audit trail is append-only for this session</div></div></section>
    </main>
  </>);
}
