# Legacy route migration register

This register prevents accidental deletion of code that is still referenced by the Vite admin screen.

## Safe to retire after deployment verification

- Next API webhook and cron routes: `app/api/webhooks/**`, `app/api/telegram/business/webhook/route.ts`, `app/api/cron/**`.
- Next Maya checkout/webhook routes: `app/api/maya/**`, `app/api/webhooks/maya/**`.
- Next download and Supabase media routes: `app/api/download/route.ts`, `app/api/media/**`, `app/api/storage/upload/route.ts`.
- Next OCR route: `app/api/ocr/analyze-receipt/route.ts`; receipt analysis is now performed in the checkout proof flow.

These routes are not imported by the Vite entry, but remain in the source tree until the TGCloud replacement is live-verified.

## Still referenced and not safe to delete yet

The following legacy dashboard data functions still call `/api/*` directly and require migration or removal before the remaining routes can be deleted:

- `app/admin/page.tsx` legacy dashboard actions
- `app/components/admin/telegram-secretary-configurator.tsx` legacy non-Serverless branch
- `app/components/admin/modify-order-modal.tsx` legacy order-detail branch

The replaced legacy modules were isolated outside the sandbox under `/data/data/com.termux/files/usr/tmp/prime-tgcloud-legacy-admin-modules-20261106`:

- `charges-module.tsx`, `payments-module.tsx`, `promos-module.tsx`
- `logistics-module.tsx`, `media-module.tsx`, `automation-module.tsx`

The new checkout and the `TelegramServerless*Panel` components already use TGCloud. The migration should be completed by panel, with a build and source-reference audit after each group; no fallback to Supabase or Vercel should be added.
