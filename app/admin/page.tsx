"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Boxes, ChevronRight, CreditCard, Film, Layers, Package, Receipt, Send, ShoppingBag, Sliders, Tag, Truck, User, Users, ClipboardList } from "lucide-react";
import TelegramServerlessCatalogPanel from "@/app/components/admin/telegram-serverless-catalog-panel";
import TelegramServerlessCustomersPanel from "@/app/components/admin/telegram-serverless-customers-panel";
import TelegramServerlessLogisticsPanel from "@/app/components/admin/telegram-serverless-logistics-panel";
import TelegramServerlessMediaPanel from "@/app/components/admin/telegram-serverless-media-panel";
import TelegramServerlessOrdersPanel from "@/app/components/admin/telegram-serverless-orders-panel";
import TelegramServerlessPaymentsPanel from "@/app/components/admin/telegram-serverless-payments-panel";
import TelegramServerlessPosPanel from "@/app/components/admin/telegram-serverless-pos-panel";
import TelegramServerlessRulesPanel from "@/app/components/admin/telegram-serverless-rules-panel";
import TelegramServerlessSystemPanel from "@/app/components/admin/telegram-serverless-system-panel";
import TelegramServerlessVisitorsPanel from "@/app/components/admin/telegram-serverless-visitors-panel";
import TelegramSecretaryConfigurator from "@/app/components/admin/telegram-secretary-configurator";
import SplashScreen from "@/app/components/splash-screen";
import PrimeIdentityHeader from "@/app/components/prime-identity-header";
import PrimeOrderQueue, { type PublicOrderQueue } from "@/app/components/prime-order-queue";
import { callServerless, getTelegramServerlessSession } from "@/lib/telegram-serverless-client";

type ModuleId = "orders" | "pos" | "customers" | "visitors" | "inventory" | "products" | "warehouse" | "couriers" | "payments" | "charges" | "promos" | "media" | "broadcast" | "system";
type Screen = { module: ModuleId; orderId?: string } | null;
const modules: Array<{ id: ModuleId; name: string; icon: any; accent: string; description: string }> = [
  { id: "orders", name: "Orders", icon: ClipboardList, accent: "#b67935", description: "Payment proofs and order flow" }, { id: "pos", name: "POS", icon: ShoppingBag, accent: "#12805c", description: "Store and delivery sales" }, { id: "customers", name: "Customers", icon: Users, accent: "#27385f", description: "Accounts, credits and tiers" }, { id: "visitors", name: "Visitors", icon: User, accent: "#8a704c", description: "Enrolled app visitors" }, { id: "inventory", name: "Inventory", icon: Boxes, accent: "#384e6d", description: "Stock and reservations" }, { id: "products", name: "Products", icon: Package, accent: "#248078", description: "Live product catalog" }, { id: "warehouse", name: "Warehouse", icon: Layers, accent: "#ad7942", description: "Warehouse configuration" }, { id: "couriers", name: "Couriers", icon: Truck, accent: "#d2615e", description: "Delivery options and rates" }, { id: "payments", name: "Payments", icon: CreditCard, accent: "#357c9d", description: "Methods and receipts" }, { id: "charges", name: "Charges", icon: Receipt, accent: "#4e5965", description: "Checkout fee rules" }, { id: "promos", name: "Promos", icon: Tag, accent: "#51859b", description: "Vouchers and rules" }, { id: "media", name: "Media", icon: Film, accent: "#1d7b66", description: "R2-backed assets" }, { id: "broadcast", name: "Secretary", icon: Send, accent: "#3978a0", description: "Telegram automation" }, { id: "system", name: "System", icon: Sliders, accent: "#43556a", description: "Diagnostics and settings" },
];

function AdminGate() { return <main className="admin-shell mx-auto flex min-h-screen max-w-[430px] flex-col bg-slate-50 p-3 text-slate-900"><div className="m-auto w-full border border-slate-200 bg-white p-4 text-center"><PrimeIdentityHeader accessLabel="CORE ADMIN ACCESS" /><h1 className="mt-5 font-heading text-xl font-semibold">Open Admin in Telegram</h1><p className="mt-2 text-sm text-slate-600">Verified Telegram staff access is required. Reopen PRIME from Telegram to continue.</p><a className="mt-5 inline-flex min-h-11 w-full items-center justify-center bg-slate-900 px-4 text-sm font-bold text-white" href="https://t.me/primenetworkphbot?startapp=admin">OPEN PRIME IN TELEGRAM</a></div></main>; }

export default function AdminPage() {
  const [checking, setChecking] = useState(true); const [authorized, setAuthorized] = useState(false); const [screen, setScreen] = useState<Screen>(null); const [logisticsSection, setLogisticsSection] = useState<"warehouse" | "courier">("warehouse");
  const [publicOrderQueue, setPublicOrderQueue] = useState<PublicOrderQueue | null>(null);
  const [dashboardOrders, setDashboardOrders] = useState<any[] | null>(null);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  useEffect(() => { let cancelled = false; void getTelegramServerlessSession().then(async (session) => { if (cancelled) return; if (session?.authenticated && session.isAdmin) { setAuthorized(true); void callServerless("setShopMenuButton").catch(() => undefined); } }).catch(() => undefined).finally(() => { if (!cancelled) setChecking(false); }); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    const refreshQueue = async () => {
      try {
        const result = await callServerless<Partial<PublicOrderQueue>>("getPublicOrderQueue", {}, 10_000);
        if (!cancelled) setPublicOrderQueue({
          ordersInQueue: Math.max(0, Number(result?.ordersInQueue) || 0),
          ordersInProcessing: Math.max(0, Number(result?.ordersInProcessing) || 0),
          averageReadyMinutes: result?.averageReadyMinutes == null ? null : Math.max(0, Number(result.averageReadyMinutes) || 0),
          trafficFlowStatus: String(result?.trafficFlowStatus || "UNKNOWN"),
        });
      } catch { if (!cancelled) setPublicOrderQueue(null); }
    };
    void refreshQueue();
    const timer = window.setInterval(() => void refreshQueue(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [authorized]);
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    void Promise.all([
      callServerless<{ orders?: any[] }>("manageOrders", { action: "list" }, 20_000),
      callServerless<any[]>("manageProducts", { action: "list" }, 20_000),
    ]).then(([orderResult, products]) => {
      if (cancelled) return;
      setDashboardOrders(Array.isArray(orderResult?.orders) ? orderResult.orders : []);
      setLowStockCount(Array.isArray(products)
        ? products.filter((product) => product.isActive && Number(product.stock) <= 5).length
        : null);
    }).catch(() => {
      if (!cancelled) { setDashboardOrders(null); setLowStockCount(null); }
    });
    return () => { cancelled = true; };
  }, [authorized]);
  const pathOrder = useMemo(() => { const params = new URLSearchParams(window.location.search); return params.get("view") === "order-detail" ? params.get("order") || undefined : undefined; }, []);
  useEffect(() => { if (authorized && pathOrder) setScreen({ module: "orders", orderId: pathOrder }); }, [authorized, pathOrder]);
  if (checking) return <SplashScreen title="ADMIN ACCESS" subtitle="VERIFYING TELEGRAM ADMIN SESSION..." />; if (!authorized) return <AdminGate />;
  const back = () => setScreen(null); const open = (id: ModuleId) => { if (id === "warehouse" || id === "couriers") setLogisticsSection(id === "warehouse" ? "warehouse" : "courier"); setScreen({ module: id }); };
  const withAdminShell = (content: ReactNode) => <div className="prime-admin-app"><header className="prime-admin-global-header"><PrimeIdentityHeader accessLabel="CORE ADMIN ACCESS" /><PrimeOrderQueue queue={publicOrderQueue} /></header>{content}</div>;
  if (screen?.module === "orders") return withAdminShell(<TelegramServerlessOrdersPanel initialOrderId={screen.orderId || null} onBack={back} />);
  if (screen?.module === "products") return withAdminShell(<TelegramServerlessCatalogPanel inventoryMode={false} onBack={back} />);
  if (screen?.module === "inventory") return withAdminShell(<TelegramServerlessCatalogPanel inventoryMode onBack={back} />);
  if (screen?.module === "customers") return withAdminShell(<TelegramServerlessCustomersPanel onBack={back} />);
  if (screen?.module === "visitors") return withAdminShell(<TelegramServerlessVisitorsPanel onBack={back} />);
  if (screen?.module === "warehouse" || screen?.module === "couriers") return withAdminShell(<TelegramServerlessLogisticsPanel initialSection={logisticsSection} onBack={back} />);
  if (screen?.module === "payments") return withAdminShell(<TelegramServerlessPaymentsPanel onBack={back} />);
  if (screen?.module === "charges" || screen?.module === "promos") return withAdminShell(<TelegramServerlessRulesPanel mode={screen.module} onBack={back} />);
  if (screen?.module === "media") return withAdminShell(<TelegramServerlessMediaPanel onBack={back} />);
  if (screen?.module === "broadcast") return withAdminShell(<TelegramSecretaryConfigurator serverless onBack={back} />);
  if (screen?.module === "system") return withAdminShell(<TelegramServerlessSystemPanel onBack={back} />);
  if (screen?.module === "pos") return withAdminShell(<TelegramServerlessPosPanel onBack={back} />);

  const activeOrders = (dashboardOrders || []).filter((order) => !["completed", "cancelled", "expired"].includes(String(order.status || "").toLowerCase()));
  const paymentReviewCount = activeOrders.filter((order) => ["pending review", "pending_review", "payment review"].includes(String(order.paymentStatus || "").toLowerCase())).length;
  const readyCount = activeOrders.filter((order) => String(order.status || "").toLowerCase() === "ready").length;
  const moduleGroups: Array<{ title: string; ids: ModuleId[] }> = [
    { title: "Commerce", ids: ["orders", "pos", "products", "inventory"] },
    { title: "Fulfillment", ids: ["warehouse", "couriers"] },
    { title: "Customers & content", ids: ["customers", "visitors", "media", "broadcast"] },
    { title: "Rules & system", ids: ["payments", "charges", "promos", "system"] },
  ];
  const dashboard = <main className="admin-shell mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-slate-50 text-slate-900"><section className="admin-content admin-command-home flex-1"><div className="admin-module-launcher__heading"><div><div className="admin-eyebrow">COMMAND CENTER</div><h1>Admin Operations</h1><p>Live operational signals and workspaces.</p></div><span className="admin-module-launcher__count">LIVE</span></div><div className="prime-admin-kpis" aria-label="Live operations"><button type="button" onClick={() => open("orders")}><span>Payment review</span><strong>{dashboardOrders === null ? "—" : paymentReviewCount}</strong><small>Open orders · server data</small></button><button type="button" onClick={() => open("orders")}><span>Ready to dispatch</span><strong>{dashboardOrders === null ? "—" : readyCount}</strong><small>Open orders · server data</small></button><button type="button" onClick={() => open("inventory")}><span>Low stock ≤5</span><strong>{lowStockCount ?? "—"}</strong><small>Active products · server data</small></button></div>{moduleGroups.map((group) => <section className="prime-admin-tool-group" key={group.title}><h2>{group.title}</h2><div className="prime-admin-tool-list">{group.ids.map((id) => { const item = modules.find((module) => module.id === id); if (!item) return null; const Icon = item.icon; return <button key={id} type="button" onClick={() => open(id)}><span className="prime-admin-tool-icon" style={{ color: item.accent }}><Icon aria-hidden="true" /></span><span><strong>{item.name}</strong><small>{item.description}</small></span><ChevronRight aria-hidden="true" /></button>; })}</div></section>)}</section></main>;
  return withAdminShell(dashboard);
}
