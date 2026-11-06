export type PublicOrderQueue = {
  ordersInQueue: number;
  ordersInProcessing: number;
  averageReadyMinutes: number | null;
  trafficFlowStatus: string;
};

export default function PrimeOrderQueue({ queue }: { queue: PublicOrderQueue | null }) {
  const active = Boolean(queue && queue.ordersInQueue + queue.ordersInProcessing > 0);
  const flow = !queue ? "Updating" : !active ? "--" : queue.trafficFlowStatus;
  const wait = !queue ? "Updating" : !active || queue.averageReadyMinutes == null ? "--" : queue.averageReadyMinutes < 1 ? "<1" : queue.averageReadyMinutes;
  const color = !active ? "text-slate-500" : flow === "LIGHT" ? "text-emerald-700" : flow === "MODERATE" ? "text-orange-600" : flow === "HEAVY" ? "text-red-700" : "text-slate-500";
  return <div aria-label="Live order status" className="prime-queue-monitor grid grid-cols-4 border-t border-gray-100 bg-slate-50">
    {[
      ["On queue", queue?.ordersInQueue ?? "—"],
      ["Processing", queue?.ordersInProcessing ?? "—"],
      ["Est. wait (mins)", wait],
      ["Order flow", flow],
    ].map(([label, value], index) => <div key={label} className={`flex min-w-0 flex-col items-center justify-center px-1 ${index < 3 ? "border-r border-gray-200" : ""}`}>
      <span className="truncate text-[9.5px] font-roboto-condensed-semibold uppercase leading-3 tracking-wide text-slate-500">{label}</span>
      <strong className={`mt-0.5 min-h-4 truncate font-mono font-bold text-[13px] leading-4 ${index === 3 ? color : "text-slate-900"}`}>{value}</strong>
    </div>)}
  </div>;
}
