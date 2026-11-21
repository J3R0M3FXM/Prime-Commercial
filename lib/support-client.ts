import { callServerless } from "./telegram-serverless-client";

export type TicketStatus = "open" | "waiting_customer" | "resolved" | "closed";
export type SupportMessage = { id: string; role: "customer" | "staff"; body: string; type: "message" | "status"; createdAt: number };
export type SupportTicket = { id: string; subject: string; category: string; orderId: string; orderNumber?: string; status: TicketStatus; version: number; lastMessage: string; createdAt: number; updatedAt: number; unread: boolean; customerName?: string; messages?: SupportMessage[] };
export type TicketPage = { tickets: SupportTicket[]; total: number; unread: number; nextCursor: { updatedAt: number; id: string } | null };
export const ticketStatusLabels: Record<TicketStatus, string> = { open: "Open", waiting_customer: "Awaiting Your Reply", resolved: "Resolved", closed: "Closed" };
export const supportPreview = () => import.meta.env?.VITE_UI_PREVIEW === "1";
export async function requestSupport<T = { ticket: SupportTicket }>(admin: boolean, input: Record<string, unknown>): Promise<T> {
  if (supportPreview()) throw new Error("Support tickets require a verified Telegram session.");
  return await callServerless<T>(admin ? "manageSupportTickets" : "supportTickets", input, 20_000);
}

export function newSupportRequestId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
