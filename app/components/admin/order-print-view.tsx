"use client";

import React from "react";
import { formatPHP } from "@/lib/currency";

interface OrderPrintViewProps {
  order: any;
  deliveryAddressText: string;
  gpsStreetAddressText: string;
  format: "standard" | "thermal";
  isModalPreview?: boolean;
}

export default function OrderPrintView({
  order,
  deliveryAddressText,
  gpsStreetAddressText,
  format = "standard",
  isModalPreview = false,
}: OrderPrintViewProps) {
  if (!order) return null;

  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

  const printTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Calculate items summary if totals are missing
  const subtotal = order.subtotal ?? (order.items?.reduce((acc: number, item: any) => {
    if (item.isFree) return acc;
    return acc + (Number(item.price) || 0) * (Number(item.quantity) || 1);
  }, 0) || 0);

  const deliveryFee = Number(order.deliveryFee) || 0;
  const discount = Number(order.discount) || 0;
  const totalAmount = order.totalAmount ?? (subtotal + deliveryFee - discount);

  // =========================================================================
  // 1. 80MM THERMAL RECEIPT FORMAT (Compact, dashed lines, mono typography)
  // =========================================================================
  if (format === "thermal") {
    return (
      <div
        id="printable-order-thermal"
        className={`${
          isModalPreview
            ? "w-full max-w-[320px] mx-auto bg-white p-4 text-slate-900 border border-slate-300 shadow-md font-mono text-[11px] leading-tight"
            : "hidden print:block print:w-[80mm] print:max-w-[80mm] print:mx-auto print:p-2 print:text-black print:bg-white font-mono text-[11px] leading-tight"
        }`}
      >
        {/* Thermal Header */}
        <div className="text-center pb-2 border-b border-dashed border-black">
          <p className="font-bold text-sm tracking-wider uppercase">PRIME STORE</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-600">Official Order Slip</p>
          <div className="mt-1 font-bold text-xs">
            ORDER #{order.orderNumber}
          </div>
          <div className="text-[10px] text-slate-600">
            {orderDate}
          </div>
        </div>

        {/* Customer & Fulfillment Info */}
        <div className="py-2 border-b border-dashed border-black space-y-1">
          <div className="flex justify-between">
            <span className="font-bold">STATUS:</span>
            <span className="uppercase font-bold">{order.status || "Pending"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">CUSTOMER:</span>
            <span className="font-bold truncate max-w-[170px]">{order.customerName || "N/A"}</span>
          </div>
          {order.customerUsername && (
            <div className="flex justify-between">
              <span className="text-slate-600">HANDLE:</span>
              <span>{order.customerUsername.startsWith("@") ? order.customerUsername : `@${order.customerUsername}`}</span>
            </div>
          )}
          {order.customerId && (
            <div className="flex justify-between">
              <span className="text-slate-600">TG ID:</span>
              <span>{order.customerId || order.tgUserId}</span>
            </div>
          )}
          {order.primeMemberId && (
            <div className="flex justify-between">
              <span className="text-slate-600">PRIME ID:</span>
              <span className="font-bold">{order.primeMemberId}</span>
            </div>
          )}

          <div className="pt-1 mt-1 border-t border-dotted border-slate-400">
            <div className="flex justify-between">
              <span className="font-bold">RECEIVER:</span>
              <span className="font-bold">{order.receiverName || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">PHONE:</span>
              <span className="font-bold">{order.receiverPhone || "None"}</span>
            </div>
            <div className="mt-1">
              <span className="text-slate-600 block">ADDRESS:</span>
              <span className="font-bold break-words">{deliveryAddressText || "None"}</span>
            </div>
            {gpsStreetAddressText && gpsStreetAddressText !== "Not captured" && (
              <div className="mt-1">
                <span className="text-slate-600 block">GPS LOCATION:</span>
                <span className="break-words text-[10px]">{gpsStreetAddressText}</span>
              </div>
            )}
            {order.notes && (
              <div className="mt-1 bg-slate-100 p-1 rounded text-[10px]">
                <span className="font-bold block">NOTES:</span>
                <span className="italic">{order.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-2 border-b border-dashed border-black">
          <div className="flex justify-between text-[10px] font-bold border-b border-dotted border-slate-400 pb-1 mb-1">
            <span>ITEM</span>
            <span>QTY x PRICE</span>
          </div>

          <div className="space-y-1.5">
            {order.items?.map((item: any, idx: number) => {
              const itemPrice = Number(item.price) || 0;
              const itemQty = Number(item.quantity) || 1;
              const lineTotal = item.isFree ? 0 : itemPrice * itemQty;

              return (
                <div key={idx} className="flex justify-between items-start gap-1">
                  <div className="flex-1 pr-1">
                    <div className="font-bold truncate">
                      {item.name || item.title || `Product #${idx + 1}`}
                      {item.isFree && <span className="ml-1 text-[9px] bg-slate-200 px-1 rounded">[FREE]</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {itemQty} x {item.isFree ? "₱0.00" : formatPHP(itemPrice)}
                    </div>
                  </div>
                  <span className="font-bold text-right shrink-0">
                    {item.isFree ? "FREE" : formatPHP(lineTotal)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Totals */}
        <div className="py-2 border-b border-dashed border-black space-y-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatPHP(subtotal)}</span>
          </div>

          {Array.isArray(order.charges) && order.charges.map((c: any, i: number) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span>+ {c.name || "Fee"}:</span>
              <span>{formatPHP(c.amount || 0)}</span>
            </div>
          ))}

          {deliveryFee > 0 && (
            <div className="flex justify-between">
              <span>Delivery Fee:</span>
              <span>{formatPHP(deliveryFee)}</span>
            </div>
          )}

          {discount > 0 && (
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>Discount:</span>
              <span>-{formatPHP(discount)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-bold pt-1 border-t border-dotted border-black mt-1">
            <span>TOTAL:</span>
            <span>{formatPHP(totalAmount)}</span>
          </div>
        </div>

        {/* Payment & Footer */}
        <div className="pt-2 text-center text-[10px] space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-600">Payment:</span>
            <span className="font-bold">{order.paymentMethod || "GCash"} ({order.paymentStatus || "Verified"})</span>
          </div>
          {order.paymentReference && (
            <div className="flex justify-between">
              <span className="text-slate-600">Ref #:</span>
              <span className="font-mono">{order.paymentReference}</span>
            </div>
          )}
          <div className="pt-2 border-t border-dotted border-slate-300">
            <p className="font-bold uppercase tracking-wider">THANK YOU FOR YOUR ORDER</p>
            <p className="text-[9px] text-slate-500 mt-0.5">Printed on {printTime}</p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. STANDARD A4 / LETTER INVOICE & DISPATCH SLIP FORMAT
  // =========================================================================
  return (
    <div
      id="printable-order-standard"
      className={`${
        isModalPreview
          ? "w-full max-w-2xl mx-auto bg-white p-6 sm:p-8 text-slate-900 border border-slate-300 shadow-xl rounded-xl font-sans text-xs"
          : "hidden print:block print:w-full print:max-w-none print:p-6 print:text-black print:bg-white font-sans text-xs"
      }`}
    >
      {/* Official Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-black tracking-widest uppercase text-slate-900">
              PRIME STORE
            </h1>
            <span className="text-[9px] font-mono border border-slate-900 px-1.5 py-0.5 rounded font-bold uppercase">
              Official Invoice
            </span>
          </div>
          <p className="text-xs font-mono text-slate-600 mt-1">
            Customer Fulfillment & Dispatch Document
          </p>
        </div>

        <div className="text-right font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Order Number</span>
          <span className="text-lg font-bold text-slate-900 block">#{order.orderNumber}</span>
          <span className="text-[11px] text-slate-600 block mt-0.5">Placed: {orderDate}</span>
          <div className="mt-1">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              order.status === "Completed"
                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                : order.status === "Processing"
                ? "bg-blue-100 text-blue-900 border border-blue-300"
                : "bg-amber-100 text-amber-900 border border-amber-300"
            }`}>
              Status: {order.status || "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Dossier: Customer & Fulfillment */}
      <div className="grid grid-cols-2 gap-4 mb-6 print-break-inside-avoid">
        {/* Customer Box */}
        <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/60">
          <h2 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-900 mb-2 pb-1 border-b border-slate-200">
            Customer & Account Identity
          </h2>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Telegram Name:</span>
              <span className="font-bold text-slate-900">{order.customerName || "Customer"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Handle:</span>
              <span className="font-bold text-slate-900">
                {order.customerUsername 
                  ? (order.customerUsername.startsWith("@") ? order.customerUsername : `@${order.customerUsername}`) 
                  : "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Telegram ID:</span>
              <span className="font-bold text-slate-900">{order.customerId || order.tgUserId || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Prime Member ID:</span>
              <span className="font-bold text-slate-900">{order.primeMemberId || "Unassigned"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">IP Address:</span>
              <span className="text-slate-700">{order.ip || order.deviceSnapshot?.ip || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Dispatch & Delivery Box */}
        <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/60">
          <h2 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-900 mb-2 pb-1 border-b border-slate-200">
            Recipient & Dispatch Logistics
          </h2>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Receiver's Name:</span>
              <span className="font-bold text-slate-900">{order.receiverName || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Contact Phone:</span>
              <span className="font-bold text-slate-900">{order.receiverPhone || "None"}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Delivery Address:</span>
              <span className="font-bold text-slate-900 leading-tight block mt-0.5">
                {deliveryAddressText || "None"}
              </span>
            </div>
            {gpsStreetAddressText && gpsStreetAddressText !== "Not captured" && (
              <div>
                <span className="text-slate-500 block">GPS Street Address:</span>
                <span className="text-slate-800 text-[11px] block mt-0.5">
                  {gpsStreetAddressText}
                </span>
              </div>
            )}
            {order.notes && (
              <div className="mt-1 pt-1 border-t border-slate-200">
                <span className="text-slate-500 block">Delivery Notes:</span>
                <span className="italic text-slate-800">{order.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Itemized Table */}
      <div className="mb-6 print-break-inside-avoid">
        <h2 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-900 mb-2">
          Order Line Items
        </h2>
        <table className="w-full border-collapse border border-slate-300 text-xs font-mono">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
              <th className="py-2 px-3 text-left w-8">#</th>
              <th className="py-2 px-3 text-left">Item Description</th>
              <th className="py-2 px-3 text-center w-16">Qty</th>
              <th className="py-2 px-3 text-right w-24">Unit Price</th>
              <th className="py-2 px-3 text-right w-28">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {order.items?.map((item: any, idx: number) => {
              const itemPrice = Number(item.price) || 0;
              const itemQty = Number(item.quantity) || 1;
              const lineTotal = item.isFree ? 0 : itemPrice * itemQty;

              return (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-3 font-bold text-slate-900">
                    {item.name || item.title || `Item #${idx + 1}`}
                    {item.isFree && (
                      <span className="ml-2 inline-block px-1.5 py-0.2 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded">
                        FREE PROMO
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-bold text-slate-900">{itemQty}</td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {item.isFree ? "₱0.00" : formatPHP(itemPrice)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-slate-900">
                    {item.isFree ? "FREE" : formatPHP(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Financials & Sign-off Footer */}
      <div className="grid grid-cols-2 gap-6 pt-2 border-t border-slate-200 print-break-inside-avoid">
        {/* Payment Verification & Receiver Signature Box */}
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 font-mono text-xs">
            <span className="font-heading font-bold text-xs uppercase tracking-wider text-slate-900 block mb-1">
              Payment Settlement
            </span>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Method:</span>
              <span className="font-bold text-slate-900">{order.paymentMethod || "GCash"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold text-emerald-700">{order.paymentStatus || "Verified"}</span>
            </div>
            {order.paymentReference && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">Ref Code:</span>
                <span className="font-bold text-slate-900">{order.paymentReference}</span>
              </div>
            )}
          </div>

          <div className="border border-slate-300 rounded-lg p-3">
            <p className="text-[10px] font-mono text-slate-600 mb-6">
              Received in complete, sealed, and undamaged condition:
            </p>
            <div className="border-t border-slate-400 pt-1 flex justify-between font-mono text-[10px] text-slate-600">
              <span>Receiver Signature</span>
              <span>Date</span>
            </div>
          </div>
        </div>

        {/* Total Calculation Box */}
        <div className="space-y-2 font-mono text-xs">
          <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-bold text-slate-900">{formatPHP(subtotal)}</span>
            </div>

            {Array.isArray(order.charges) && order.charges.map((c: any, i: number) => (
              <div key={i} className="flex justify-between text-slate-600">
                <span>+ {c.name || "Charge"}:</span>
                <span className="font-bold text-slate-900">{formatPHP(c.amount || 0)}</span>
              </div>
            ))}

            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee:</span>
              <span className="font-bold text-slate-900">{formatPHP(deliveryFee)}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Discount Applied:</span>
                <span>-{formatPHP(discount)}</span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline">
              <span className="font-heading font-black text-sm uppercase text-slate-900">
                Grand Total:
              </span>
              <span className="text-base font-bold text-slate-950 font-mono">
                {formatPHP(totalAmount)}
              </span>
            </div>
          </div>

          <p className="text-[9px] text-slate-400 text-center font-mono pt-2">
            System generated document • Printed: {printTime}
          </p>
        </div>
      </div>
    </div>
  );
}
