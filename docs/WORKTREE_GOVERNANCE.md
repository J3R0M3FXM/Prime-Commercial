# Prime TGCloud Checkout Governance

This checkout is the production-linked source of truth for the Telegram Mini App.

## Required worktree policy

- Production checkout: `/data/data/com.termux/files/home/Prime-TGCloud-Checkout`
- Future work and verification: `/data/data/com.termux/files/home/Prime-TGCloud-Sandbox`
- Do not resume work in `Prime-Commercial-header-preview` or `Prime-Serverless-Final`.
- Never deploy from a dirty worktree.
- Every release must be committed, built from this checkout, and verified against the deployed TGCloud artifact.
- The sandbox must be clean before a release is promoted into the production checkout.
- Do not copy a whole dirty worktree. Promote files only after review and tests.

## Integration boundary

The live app uses TGCloud Serverless endpoints. Client checkout/order/payment/account/credit flows must not fall back to Vercel, Next API routes, Supabase, or preview fixtures.

Before release, search the production client bundle/source for `/api/`, Supabase environment names, Vercel references, and preview markers. Any remaining match requires a documented exception or blocks deployment.

## Audit requirement

Before each release record:

1. source commit and worktree status;
2. live TGCloud revision and deployed asset hashes;
3. endpoint inventory and whether each endpoint is present locally and deployed;
4. build, syntax, and focused flow test results;
5. device/live verification status and known limitations.

## Current reconstruction warning

The initial audit found that the old linked tree had locally deleted Serverless handlers that TGCloud still reported as deployed. This is an incomplete migration state. Do not deploy this checkout until those handlers are restored from an audited source or replaced and verified.
