# Production Reconstruction Audit

Date: 2026-11-06

## Worktrees created

- `Prime-TGCloud-Checkout`, branch `prime/tgcloud-checkout`
- `Prime-TGCloud-Sandbox`, branch `prime/tgcloud-sandbox`

Both started from commit `402f30b` and the current production-linked source was copied into the checkout for classification. The legacy worktrees were not modified.

## Evidence captured

- TGCloud app: `app8830494959`
- TGCloud local revision reported by CLI: `335`
- Webhook: in sync
- The linked local tree reports deleted handlers that remain in the deployed snapshot, including `createOrder.js`, `getMyAccount.js`, `getMyTier.js`, `getTelegramSession.js`, `uploadPaymentReceipt.js`, `credits.js`, `inventory.js`, `orders.js`, and related order lifecycle files.
- The linked local tree also contains modified backend files and uncommitted frontend changes.

## Immediate defects found

1. Checkout reads customer credits through `/api/account` instead of the live `getMyAccount` Serverless handler.
2. Checkout retains multiple `/api/*` fallback paths for charges, promos, order submission, Maya, and order history.
3. The local linked source is not a safe deployment source because its missing handlers are still present remotely.

## Release gate

No deployment from this checkout is authorized until the endpoint set is reconstructed, the client integration boundary is Serverless-only, the build is clean, and the live artifact is compared after deployment.
