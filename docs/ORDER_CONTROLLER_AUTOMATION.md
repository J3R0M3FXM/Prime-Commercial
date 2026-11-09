# Order Controller And Automation

The controller lives in Admin → Orders → Order Details → Fulfillment. Customer
Edit and Cancel actions submit requests; they do not immediately change or cancel
an order. Only verified staff may approve those requests.

## State And Payment Safety

- Submitted orders require a payment method and attached receipt. They remain
  Pending Payment Validation; image-analysis findings never confirm payment and
  scan errors do not prohibit submission of an otherwise valid receipt.
- Review → Confirm Payment requires the amount and an explicit provider-verification
  acknowledgment. Confirmation sets Confirmed, not Processing. Staff then select
  Processing → Ready → Dispatched → Completed.
- The first failed receipt enables Hold and one staff-requested Resubmit. That
  request starts a fixed 3,600-second deadline. Repeated requests never extend it.
  A late upload is rejected by a SQLite trigger, independent of scheduler timing.
  A second failed receipt, or no replacement before the deadline, cancels the order.
- Modify is limited to Pending/Confirmed outside Held/Failed. Stock increases,
  duplicate SKU lines and bill increases require a new order. Reservation reductions,
  the order update and any verified-payment refund share one SQLite transaction.
- Customer cancellation is permitted before Ready and requires approval. Staff may
  override cancellation at Ready with a reason. Dispatched/completed orders cannot
  be cancelled. Uncollected courier pay-on-arrival is never refunded by the store.
- Verified overpayments, reductions and paid cancellations use a cent-based,
  idempotent Store Credit ledger. Returned transferred credits retain their original
  non-transferable classification. A busy credit account aborts the whole write.
- Cancelled unverified payments require explicit provider revalidation. Staff may
  select Store Credits or the original method. Original-method refunds are not
  automatically sent to a provider: staff process them externally and record the
  provider reference. Settlement is described as 3–5 banking days, subject to the
  financial institution, not falsely reported as completed.
- Dispatch requires HTTPS tracking, shown as TRACK RIDER. Customer ORDER RECEIVED,
  staff Completed, or the six-hour fallback makes purchasing/referral rewards
  eligible immediately. Existing exactly-once reward ledgers and referral delivery
  eligibility checks are retained.

## Additive Preparation

The schema now declares existing order/payment lifecycle fields omitted by the old
typed schema. `ensureOrderWorkflow()` adds missing columns only; existing values are
not overwritten. It creates three sidecar tables, a ledger lookup index and guarded
triggers using metadata checks. Existing trigger/table DDL is not rerun as a no-op.

TGCloud only accepts its reserved Telegram handler names. The two owner-only
runner templates live outside the deployable `tgcloud/` tree, under `automation/`.
They are never published as public endpoints. After Sandbox validation and promotion,
temporarily copy the readiness template into Checkout's `tgcloud/endpoints/`, run it
with the authenticated owner CLI, and immediately remove that temporary copy:

```sh
npm exec --yes --package=@tgcloud/cli -- tgcloud run endpoints/orderWorkflowReadiness '{prepare:true}'
```

The preparation handler reports schema names only and does not enroll or mutate
customer orders. It must return `ready: true`. Deploy the changed schema, order
libraries/endpoints and the exact validated `dist/` from Checkout. Do not push the
temporary readiness or milestone entry points.

## GitHub Activation

Repository: `J3R0M3FXM/Prime-Commercial`. Existing secret: `TGCLOUD_TOKEN` (never print
or copy its value). The scheduler uses the supported owner CLI, not a public HTTP
endpoint and not fabricated Telegram init data.

Scheduled workflows must exist on the default branch, `main`. Publish only
`.github/workflows/prime-order-milestones.yml` there, without merging unrelated local
history. Publish `automation/order-milestones.js` and
`automation/order-milestones.sha256` in the same commit; the latter pins the
six backend files in the scheduler's dependency closure. No application source or
local history needs to be published for the scheduler, only this small owner runner
and its workflow/manifest. Then set:

- `PRIME_AUTOMATION_REF`: the full validated/deployed source commit SHA.
- `PRIME_ORDER_AUTOMATION_ENABLED`: `true` only after the matching backend is live.

The workflow checks out its manifest, downloads deployed backend modules into a
fresh ephemeral directory using `tgcloud pull`, and verifies their SHA-256 hashes.
It refuses changed/unvalidated code or a token targeting any app other than
`app8830494959`. Every five minutes, at minute 2/7/12/etc., it runs
the temporary, non-deployed `endpoints/orderMilestones`, sharing the same bounded
reconciler as existing refreshes. The runner is copied into the ephemeral pull only
after checking that no deployed endpoint has the same name. No `push` is ever used.
Runtime output is captured only in the ephemeral runner, not printed or uploaded as
an artifact, because the repository is public. Actions report success/failure without
publishing customer-related notification errors. Concurrency prevents overlapping
GitHub jobs; database guards also protect retries.
One invocation processes at most five batches of twenty records per work category.

GitHub schedules can be delayed. Upload eligibility stops at exactly one hour;
background cancellation and completion occur on the first successful reconciliation
after their deadline, not under an exact-time delivery guarantee. Manual dispatch
provides recovery. The first enabled run will also reconcile existing overdue paid
Dispatched orders and eligible pending rewards; it never verifies a payment itself.

Disable with `PRIME_ORDER_AUTOMATION_ENABLED=false`. Do not change the pinned ref to
unvalidated or undeployed source. Verify a successful manual workflow run before
reporting the scheduler as active. Aggregate counts may be inspected privately with
the owner CLI. Actual customer interactions and
provider refunds still require phone/provider checks; local fixtures are not live sales.
