import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { callServerless } from "@/lib/telegram-serverless-client";
import { readNativeAdminSession } from "@/lib/secure-admin-auth";

let initialized = false;
let pollTimer: number | undefined;

const GATEWAY = "https://prime-admin-gateway.jerome-businessplatform.workers.dev";

async function pollAdminAlerts(): Promise<void> {
  const session = await readNativeAdminSession();
  if (!session) return;
  const headers = { Authorization: `Bearer ${session}` };
  const [ordersResponse, ticketsResponse] = await Promise.all([
    fetch(`${GATEWAY}/v1/orders?limit=5`, { headers, cache: "no-store" }),
    fetch(`${GATEWAY}/v1/support-tickets?limit=5`, { headers, cache: "no-store" }),
  ]);
  const orders = (await ordersResponse.json().catch(() => ({})))?.data || [];
  const tickets = (await ticketsResponse.json().catch(() => ({})))?.data?.tickets || [];
  const current = `${orders[0]?.id || ""}:${tickets[0]?.id || ""}`;
  const previous = window.localStorage.getItem("prime-admin-alert-cursor");
  if (previous && previous !== current) {
    await LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title: "PRIME Admin Update", body: "New order or support activity requires review.", channelId: "prime-admin", schedule: { at: new Date(Date.now() + 250) }, extra: { view: orders[0]?.id !== previous.split(":")[0] ? "orders" : "support" } }] }).catch(() => undefined);
  }
  window.localStorage.setItem("prime-admin-alert-cursor", current);
}

export async function initializeAdminPushNotifications(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;
  const permission = await PushNotifications.checkPermissions();
  const granted = permission.receive === "granted"
    ? permission
    : await PushNotifications.requestPermissions();
  if (granted.receive !== "granted") return;
  await PushNotifications.createChannel({
    id: "prime-admin",
    name: "PRIME Admin Alerts",
    description: "Orders, payments, and customer support alerts",
    importance: 5,
    visibility: 1,
    sound: "default",
  }).catch(() => undefined);
  await PushNotifications.addListener("registration", (token: Token) => {
    void callServerless("health", { action: "registerPushToken", token: token.value }).catch(() => undefined);
  });
  await PushNotifications.addListener("registrationError", () => undefined);
  await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = event.notification.data as { view?: string; orderId?: string } | undefined;
    if (data?.view) window.location.assign(`/admin?view=${encodeURIComponent(data.view)}${data.orderId ? `&orderId=${encodeURIComponent(data.orderId)}` : ""}`);
  });
  await PushNotifications.register();
  const localPermission = await LocalNotifications.checkPermissions();
  if (localPermission.display !== "granted") await LocalNotifications.requestPermissions().catch(() => undefined);
  await pollAdminAlerts().catch(() => undefined);
  pollTimer = window.setInterval(() => void pollAdminAlerts().catch(() => undefined), 30_000);
}
