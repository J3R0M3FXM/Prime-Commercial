# Prime Admin Gateway

This Worker is the isolated data gateway for the native Admin Panel. It is
intentionally separate from the customer-facing TGCloud Serverless runtime.

## Migration safety

- `migrations/0001_admin_projection.sql` creates the phase-1 read-only Admin
  projection in D1.
- The D1 database starts empty; no live TGCloud records are copied by this
  migration.
- Import requires a verified TGCloud export, a source-schema hash, row counts,
  and a rollback checkpoint recorded in `admin_import_state`.
- Customer authentication and checkout remain on TGCloud until parity testing
  is complete.
- Payment-method secret keys and media blobs are deliberately excluded from
  the first projection.

Deploy only after the migration is locally validated and the import manifest is
available.
