# PRIME Commercial — Telegram Serverless Integration

This directory contains the native **Telegram Serverless** package for PRIME Commercial, designed for deployment directly onto Telegram's low-latency edge V8 infrastructure.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │      Telegram Edge Infrastructure     │
                      │                                       │
 Telegram User ──────▶│  • V8 Serverless Sandbox (index.js)   │
                      │  • Built-in SQLite DB (schema.js)     │
                      │  • Sub-millisecond Secretary Engine   │
                      └──────────────────┬────────────────────┘
                                         │
                    Taps "Open PRIME"    │
                                         ▼
                      ┌───────────────────────────────────────┐
                      │    PRIME Mini App (Next.js React)     │
                      │                                       │
                      │  • Responsive Storefront & Cart       │
                      │  • Maya Payment Gateway & Webhooks    │
                      │  • Leaflet Interactive Geo-Routing    │
                      │  • Gemini OCR Payment Verification    │
                      │  • Real-time Supabase Database        │
                      └───────────────────────────────────────┘
```

---

## Features

1. **V8 Serverless Bot Engine**:
   - Responds to `/start`, `/orders`, and custom conversational flows.
   - Launches the PRIME Mini App via inline WebApp buttons with dynamic parameters (`start_param`).
   - Handles Telegram Business connections and messages.

2. **Built-in SQLite Database**:
   - `users`: Edge user profile and VIP loyalty balance cache.
   - `business_connections`: Telegram Business linking.
   - `automation_settings` & `automation_flows`: Telegram Secretary dynamic flow and interactive button storage.
   - `chat_states`: Live agent takeover and chat pause status.
   - `orders_edge`: Fast local order lookups.

3. **Telegram Secretary Core**:
   - Handles interactive inline button clicks (`sec:flow:buttonId`) with instantaneous message editing.
   - Zero-latency menu navigation.

---

## Deployment & Setup via `tgcloud`

### 1. Link Your Bot via @BotFather
1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Select your bot: `/mybots` ➡️ Your Bot.
3. Access **Bot Settings** ➡️ **Serverless** (Early Access).
4. Copy your CLI deploy token.

### 2. Configure Environment
Set your Mini App frontend URL:
```bash
# In tgcloud environment settings or local CLI
PRIME_APP_URL="https://your-domain.app"
```

### 3. Run Database Migrations
To initialize the SQLite tables on Telegram's edge infrastructure:
```bash
npx tgcloud migrate
```

### 4. Deploy the Serverless Bot
Push your handlers and schema to Telegram Serverless:
```bash
npx tgcloud push
```

### 5. Check Service Status
```bash
npx tgcloud status
```
