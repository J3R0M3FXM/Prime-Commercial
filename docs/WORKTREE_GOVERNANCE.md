# Prime TGCloud Checkout Governance

Future work belongs in `/data/data/com.termux/files/home/Prime-TGCloud-Sandbox`.
Read the production audit in the sibling `Prime-TGCloud-Checkout` before beginning work. Never deploy from a dirty worktree. Promote only committed, built, verified changes into `Prime-TGCloud-Checkout`.

The live app uses TGCloud Serverless endpoints. Do not add Vercel, Next API, Supabase, or preview fallbacks to production client flows.

## Release gates

- Production checkout: `/data/data/com.termux/files/home/Prime-TGCloud-Checkout`.
- Sandbox and verification: `/data/data/com.termux/files/home/Prime-TGCloud-Sandbox`.
- Do not resume in legacy dirty worktrees. Never deploy from a dirty worktree.
- Promote only reviewed, committed, built, and verified changes from sandbox; do not copy an entire worktree blindly.
- Reconcile local TGCloud endpoint inventory against the deployed project and resolve the documented handler mismatch before any release.
- Audit source and production bundle for `/api/`, Supabase, Vercel, and preview-only paths; document exceptions or block release.
- Record source commit/status, live revision and asset hashes, endpoint parity, build/syntax/focused tests, and actual device verification limits.
