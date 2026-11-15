import fs from "node:fs";
import path from "node:path";

const configured = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const localProperties = path.resolve("android", "local.properties");
let sdkDir = configured;

if (!sdkDir && fs.existsSync(localProperties)) {
  const line = fs.readFileSync(localProperties, "utf8").split(/\r?\n/)
    .find((value) => /^\s*sdk\.dir\s*=/.test(value));
  sdkDir = line?.split("=").slice(1).join("=").trim();
}

if (!sdkDir) {
  console.error("Android SDK not configured. Set ANDROID_HOME/ANDROID_SDK_ROOT or add sdk.dir=... to android/local.properties.");
  process.exit(1);
}

const resolved = path.resolve(sdkDir.replace(/^~(?=$|[\\/])/, process.env.HOME || "~"));
const required = ["platforms", "build-tools"];
const missing = required.filter((name) => !fs.existsSync(path.join(resolved, name)));
if (missing.length) {
  console.error(`Android SDK at ${resolved} is incomplete; missing ${missing.join(" and ")}.`);
  console.error("Install the Android SDK platform/build-tools required by android/variables.gradle.");
  process.exit(1);
}

console.log(`Android SDK ready: ${resolved}`);
