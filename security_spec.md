# Security Specification for PRIME App

## Data Invariants
1. A user can ONLY read/write their own profile in `/users/{userId}`.
2. A user can ONLY read/write their own fingerprints in `/users/{userId}/fingerprints/{fingerprintId}`.
3. Admins can read all profiles and fingerprints.
4. `primeMemberId` is immutable once created.

## Dirty Dozen Payloads (Security Test Cases)
1. Unauthorized read of another user profile.
2. Unauthorized write to another user profile.
3. Attempt to update `primeMemberId` of existing user.
4. Attempt to create fingerprint in another user's path.
5. Attempt to create user profile with invalid characters in ID.
6. Attempt to write PII without verification.
... (etc)
