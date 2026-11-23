import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { callServerless } from "@/lib/telegram-serverless-client";

let initialized = false;

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
}
