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
  const since = Number(window.localStorage.getItem("prime-admin-alert-since") || 0) || 0;
  const response = await fetch(`${GATEWAY}/v1/notifications?since=${since}`, { headers, cache: "no-store" });
  const events = (await response.json().catch(() => ({})))?.data || [];
  for (const event of events) {
    await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 2147483647), title: event.title || "PRIME Admin Update", body: event.body || "New activity requires review.", channelId: "prime-admin", schedule: { at: new Date(Date.now() + 250) }, extra: event.payload || {} }] }).catch(() => undefined);
  }
  if (events.length) window.localStorage.setItem("prime-admin-alert-since", String(Math.max(...events.map((event: { createdAt?: number }) => Number(event.createdAt) || 0))));
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
