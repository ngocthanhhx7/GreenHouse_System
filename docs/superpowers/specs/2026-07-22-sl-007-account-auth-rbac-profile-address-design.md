# SL-007 Account, Authentication, RBAC, Profile, and Address Design

**Date:** 2026-07-22

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `d6a0f75f9dd3904f78585eb031c042ccda4518f2`

**SRS baseline:** Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23

## 1. Scope and Gate Status

`SL-007` governs Customer registration and email verification, internal-account invitation, login and failed-login handling, server-side authenticated sessions, logout and revocation, password change/reset, fixed role authorization, Admin account administration, self-profile/avatar management, and the Customer-owned address book.

The slice begins when a Guest requests registration verification, an Admin sends an internal-account invitation or account command, or an existing User submits an authentication/profile/address command. It ends when identity ownership, account state, single-role authority, session state, security effects, address ownership/default state, audit evidence, and downstream business continuity are deterministic and traceable.

This package includes:

- verified two-step Customer registration without a delivery address;
- expiring Staff/Warehouse Manager invitations without Admin-selected passwords;
- exactly one fixed current role and server-authoritative role enforcement;
- guarded Admin disable/reactivate and Staff/Warehouse role-transfer commands;
- generic failed-login handling, bounded throttling, and security audit;
- server-side sessions delivered through protected cookies, with expiry and revocation;
- one password policy for registration, invitation, change, and reset;
- self-owned profile, managed avatar, and Customer-only structured addresses;
- atomic, idempotent security commands and privacy-safe audit/outbox evidence;
- continuity rules when an account is disabled while another approved business process remains active.

This package does not define social login, multi-factor authentication, direct email change, dynamic runtime editing of role permissions, Customer self-service account closure, legal-erasure policy, Admin creation or role assignment through the application, Staff impersonation, or a full device/session-management screen. Those require separate approved packages.

`SL-007` preserves the runtime actor boundaries already approved by `SL-001` through `SL-006`. In particular, CSKH remains the `Staff` actor; authentication does not grant Staff access to Customer-owned financial/address input, grant Admin physical-stock authority, or let Warehouse Manager perform commercial/account administration.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-007 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Complete exact G3 API/interface/code/test/release-evidence mapping against the reconciled SRS revision |

No unresolved business decision remains inside the approved `SL-007` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-040 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Google Docs revision `AIroW372r8j-BncuGRhIEqFwCQa2PLXsnMT53H_cxn5r7E_t-NkRjh2gJg2UEves9dhsAFtoTr0qoSWM8Lt1qYAOQzSFBEWVaj2Ap2eXHQI`; one tab `t.0`; read back 2026-07-23 | Candidate identity/RBAC/profile/address text; CR-001 v2.1 adds no new account lifecycle | Candidate source only where adopted by this approved package | SRS contributors; Project Business Approver approves policy | Full SL-007 lifecycle still needs its own G3 mapping; shared evidence/destination constraints from CR-001 apply where referenced |
| SRC-041 | Explicit fast-track approval, “duyệt gói SL-007” | 2026-07-22 | BD-075 through BD-086 and this complete bounded package | Normative business authority for SL-007 | Project Business Approver | Approver display name is not recorded |
| SRC-042 | Repository `D:\GreenHouse_System-main` | HEAD `d6a0f75f9dd3904f78585eb031c042ccda4518f2`; inspected 2026-07-22 | Current User/Role/OTP/address models, auth/profile/address/upload services, routes, UI, and tests | `observed-behavior` only | Engineering team | Direct Active registration, localStorage JWT, response-only logout, missing Admin account management, inconsistent password rules, duplicate profile/address fields, and non-atomic address default handling conflict with this design |
| SRC-043 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-22 | Requirements completeness/consistency/verifiability and explicit state/event/guard/action modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse business policy |
| SRC-044 | Approved `SL-001` through `SL-006` designs | Approved 2026-07-22 | Staff/CSKH identity, Customer ownership, secure refund input, Order/payment continuity, Inventory authority, catalog/Cart permissions, idempotency, and immutable snapshots | Normative for referenced cross-slice rules | Project Business Approver | Current account/session implementation cannot yet enforce every approved continuity and revocation boundary |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-075 | SL-007 | Which lifecycle separates pre-account proof from a real User? | Create Active immediately; create a pending User; use separate registration/invitation states and only Active/Disabled Users | Registration verification and internal invitation are separate pre-account state machines. A persisted User exists only after successful completion and has `Active` or `Disabled` status. A real User and transaction history are never hard-deleted | Avoid unverified login-capable accounts and ambiguous reactivation while retaining stable business identity | Project Business Approver | 2026-07-22 | BR-071, BR-082 |
| BD-076 | SL-007 | How does a Guest become a Customer and what data is required? | Current one-step Active registration with address; manual approval; verified two-step registration | Guest first requests a six-digit email OTP. A valid latest OTP plus full name, phone, password, and confirmation atomically creates one Active Customer. No delivery address is accepted or required during registration | Prove email control before creating the account and eliminate duplicate free-form address authority | Project Business Approver | 2026-07-22 | BR-072 |
| BD-077 | SL-007 | How are Staff and Warehouse Manager accounts provisioned? | Admin chooses a password; Admin creates Active directly; expiring invitation | Admin invites one unused normalized email with exactly one `Staff` or `WarehouseManager` role. The invitation expires after 24 hours. The recipient supplies own profile and password during acceptance. Resend invalidates the former invitation; Admin may revoke a pending invitation | Keep passwords private, roles attributable, and unused invitations reversible | Project Business Approver | 2026-07-22 | BR-073 |
| BD-078 | SL-007 | What is the role authority and which role changes are permitted? | Editable permission arrays; multiple roles; fixed single-role matrix | The current release uses one centrally approved, server-enforced role matrix and exactly one role per User. Customer is never converted to an internal actor. Admin may transfer `Staff <-> WarehouseManager` only with reason, no active assignment, and all-session revocation. Application commands cannot create or assign `Admin` | Prevent privilege drift, combined duties, and history ambiguity | Project Business Approver | 2026-07-22 | BR-074 |
| BD-079 | SL-007 | What account administration may Admin perform? | Full profile/password control; status only; least-privilege administration | Admin may search/view minimum account-security metadata, invite/revoke/resend internal invitations, disable/reactivate Customer/Staff/Warehouse accounts with reason, and perform the guarded internal role transfer. Admin cannot set/reset a password, edit another User's personal profile/address, impersonate, hard-delete, create/assign Admin, or disable self through this feature | Give Admin operational control without ownership of personal credentials or Customer data | Project Business Approver | 2026-07-22 | BR-075, BR-082 |
| BD-080 | SL-007 | How do login failures, status feedback, and brute-force controls behave? | Detailed pre-password status errors; global IP limit only; generic credentials plus bounded account/IP throttling | Unknown email and wrong password receive the same generic response and create no session. Status is evaluated only after password success. Five failed attempts for one normalized email within 15 minutes block further login attempts for 15 minutes; an IP ceiling of 30 attempts per 15 minutes also applies. A successful login clears the email counter. Throttling never changes User status | Limit enumeration and automated guessing without turning an attacker into a permanent account administrator | Project Business Approver | 2026-07-22 | BR-076 |
| BD-081 | SL-007 | Where does authenticated-session authority live? | Browser localStorage JWT; stateless protected cookie; revocable server session | Create a server-side revocable session and deliver only an opaque credential in an `HttpOnly`, production-`Secure`, `SameSite=Lax` cookie. Validate current User status and role on every protected request. Permit multiple devices. Default expiry is 24 hours idle and seven days absolute, snapshotted at session creation | Remove script-readable bearer tokens and provide deterministic expiry/revocation | Project Business Approver | 2026-07-22 | BR-077 |
| BD-082 | SL-007 | Which events revoke which sessions? | Client-only logout; password-version JWT; explicit server revocation | Logout revokes the current session. Password change/reset, role transfer, and account disable revoke every session for that User in the same business operation. Reactivation never restores a revoked session. Expired/revoked cookies cannot authenticate | Make every security boundary observable instead of relying on client deletion | Project Business Approver | 2026-07-22 | BR-078 |
| BD-083 | SL-007 | What password/reset policy applies consistently? | Registration minimum only; different per-flow complexity; one bounded policy and OTP lifecycle | Registration, invitation acceptance, change, and reset require 8–72 bytes with at least one letter and one digit plus confirmation. Change requires the current password and a different new password. Reset uses the same six-digit, ten-minute, latest-only OTP with five attempts and 60-second resend cooldown. No forced periodic rotation applies | Remove contradictory validation and bcrypt-truncation ambiguity while preserving usable recovery | Project Business Approver | 2026-07-22 | BR-079 |
| BD-084 | SL-007 | Which self-profile data may each role manage? | Customer only and mutable email; Admin-managed profiles; all Active Users own limited profile | Every Active User may view/update own full name and canonical `phoneNumber`, manage own password, and manage one system-owned avatar. Email, role, and status are read-only in this release. Remove legacy `phone` and free-form `User.address`; Admin cannot edit another User's personal data | Align ownership across all runtime actors and avoid an unverified login-identity change or second address authority | Project Business Approver | 2026-07-22 | BR-080 |
| BD-085 | SL-007 | How does the Customer address book behave? | Unlimited addresses and silent default promotion; one profile address; bounded structured owner-only addresses | Only Customer may hold up to ten structured addresses. If at least one exists, exactly one is default; the first is default automatically and default switching is atomic. A default cannot be deleted while another address remains; Customer selects a replacement first. Deleting the sole address leaves zero. Checkout may use a saved or one-time address and always stores an immutable Order snapshot | Keep delivery input owned, bounded, explicit, and independent of historical Orders | Project Business Approver | 2026-07-22 | BR-081 |
| BD-086 | SL-007 | What happens to ongoing business processes when an account is disabled? | Cancel active work; let Staff impersonate; preserve business facts and recover account access | Disable revokes access immediately but never cancels or rewrites Order, Payment, Refund, Return/Exchange, Inventory, Cart history, or assigned-work evidence. A blocked Customer action is flagged for Staff/CSKH contact and Admin-controlled reactivation; Staff cannot submit Customer-owned address, credential, or financial-destination data. Internal active work enters a reassignment/escalation path without weakening disable | Preserve security and legal/commercial rights without granting impersonation | Project Business Approver | 2026-07-22 | BR-075, BR-078, BR-082 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Guest | Establish a verified Customer identity or regain an existing Active account | Request/resend registration OTP; submit valid OTP plus profile/password; login; request/complete password reset | Access protected data; select role/status; supply registration address; create an internal/Admin account; create a session before successful authentication | Initiates registration-challenge creation/consumption; User creation is the System's guarded action | Own submitted registration/reset data and generic results only | Verified registration to System account creation; credentials to authentication; email delivery to Email Service | Invalid/expired/repeated OTP changes no User; duplicate/unknown requests return safe feedback; throttled login creates no session |
| Customer | Use one verified account for owned commerce and after-sales activity | Login/logout; update own profile/password/avatar; create/update/default/delete own saved addresses; initiate only approved Customer operations in other slices | Change email/role/status; read another User/address/session; administer accounts; make Staff/Warehouse/Admin decisions | Own profile/address intent; no account-status/role transition ownership | Own profile, sessions, structured addresses, and data already authorized by SL-001 through SL-006 | Confirmed checkout address to `SL-003`; owned support/refund inputs to Staff/CSKH | Foreign/protected input is denied; disable blocks access without deleting business facts; duplicate command returns prior outcome |
| Staff / CSKH | Operate Customer service and approved order/after-sales work under one Staff identity | Login/logout; manage own profile/password/avatar; perform approved Staff commands in SL-001 through SL-005 | Administer User/role/status; edit Customer profile/address/password/financial input; impersonate Customer; perform Warehouse/Admin authority | Own profile intent and Staff-owned business decisions only; no account-state transition | Own account plus minimum Staff operational data; never Customer credentials or address-book mutation | Blocked Customer account issue to Admin; operational handoffs to Customer/Warehouse/payOS under prior slices | Disabled session is revoked; active work is escalated/reassigned; forbidden direct endpoint stays denied |
| Warehouse Manager | Perform physical Inventory work using one verified warehouse identity | Login/logout; manage own profile/password/avatar; perform approved Warehouse commands in SL-001/SL-002/SL-004/SL-005 | Administer accounts; access Customer address book/credentials/refund destination; perform Staff/Admin/commercial commands | Own profile intent and Warehouse physical-state decisions only | Own account plus authorized Product/Inventory/inspection context | Inventory/inspection evidence to System and Staff under prior slices | Disabled session is revoked; active work is escalated/reassigned; wrong-role commands remain denied |
| Admin | Keep legitimate runtime accounts and role assignment operable | Invite/resend/revoke Staff/Warehouse invitations; search/read minimum account metadata; disable/reactivate with reason; guarded Staff/Warehouse transfer | Set or see passwords/OTP/tokens; edit another profile/address; impersonate; hard-delete; convert Customer; create/assign Admin; bypass active-assignment guard; mutate physical stock | Invitation lifecycle, `Active <-> Disabled`, and eligible `Staff <-> WarehouseManager` role transfer after guards | Minimum identity/security metadata, status, role, invitation, last-login, and relevant audit; no personal address-book or credential values | Invitation to Email Service/recipient; disabled active-work flag to Staff/Warehouse reassignment | Invalid/stale/duplicate command changes nothing; security disable takes effect even when work requires later reassignment |
| Email Service | Deliver already-authorized security and account messages | Process queued verification, invitation, password, and security-notification deliveries | Decide eligibility, activate/disable User, consume token, create session, or roll back business state | Delivery result only | Minimum recipient/template payload; never raw password, stored OTP hash, or session secret | Delivery evidence to outbox retry/audit | Failure remains retryable and never produces a false account/session transition |
| GreenHouse System | Enforce identity, authorization, session, ownership, and consistency rules | Validate and execute commands; generate/hash/consume tokens; create/revoke sessions; audit and persist outbox events | Invent Guest/Admin approval, bypass actor guards, expose secrets, restore a revoked session, or rewrite downstream history | Mechanical transition after valid event/current state/guard; throttle and expiry transitions | Minimum joined User/Role/session/challenge/invitation/address/audit data needed for each command | Actor results and safe next actions; post-commit delivery to Email Service; blocked work to owning slice | Grouped writes roll back; stale/idempotent retry returns current/prior result; delivery retries do not duplicate security effect |

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-007 | A verified person receives exactly one least-privilege account/session and can manage only own profile/address, while Admin safely governs runtime availability | Registration/invitation/authentication/password/profile/address/Admin account command | Authorized actor or valid latest token; valid current state; normalized unique email; exactly one approved role; valid current/expected command identity | Execute UC-REG-01, UC-INV-01, UC-AUT-01, UC-ADM-01, UC-PRO-01, or UC-ADR-01 | Apply AF-007 branches without partial User/session/default-address effects, privilege leakage, secret logging, impersonation, or downstream-history rewrite | OTP 6 digits/10 minutes/5 attempts/60-second cooldown; invitation 24 hours; password 8–72 bytes with letter+digit; login limits 5/email and 30/IP per 15 minutes; session idle 24 hours/absolute 7 days; maximum 10 addresses | Pre-account proof is not a User; User is Active/Disabled with one role; revoked never reactivates; one default when addresses exist; history is not hard-deleted | Actor matrix above | AT-125 through AT-149 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Normative requirement | Source decision |
|---|---|---|
| BR-071 | RegistrationChallenge and InternalInvitation shall remain distinct from User. A User shall be created only by successful registration completion or invitation acceptance and shall have exactly one normalized unique email, one approved role, and `Active` status. Thereafter User status shall be only `Active` or `Disabled`; no runtime operation shall hard-delete the User or transaction/audit references. | BD-075 |
| BR-072 | Guest registration shall first create or resend one latest email-verification challenge without creating a User. The challenge shall use a cryptographically generated six-digit OTP stored only as a protected hash, expire after ten minutes, permit at most five failed attempts, and enforce a 60-second resend cooldown. One valid latest OTP submitted with valid full name, canonical Vietnamese phone, password and confirmation shall atomically consume the challenge, create exactly one Active Customer, and audit the result. Registration shall neither require nor accept an address. | BD-076 |
| BR-073 | Admin shall create an InternalInvitation only for one unused normalized email and exactly one `Staff` or `WarehouseManager` role. It shall expire after 24 hours and contain no Admin-selected password. Valid acceptance with recipient-owned full name, phone, password, and confirmation shall atomically consume the invitation, create one Active User, and audit the result. Resend shall invalidate the former invitation; revoke, expiry, duplicate/concurrent acceptance, Customer/Admin role input, and existing-email conflict shall create no User or privilege. | BD-077 |
| BR-074 | Every protected operation shall use one centrally approved server-side role matrix and the current persisted single role; UI visibility is not authorization. Missing/unknown/multiple role data shall fail closed and be audited. Customer shall never be converted to Staff/Warehouse/Admin. Admin may transfer only `Staff <-> WarehouseManager` with mandatory reason, no active assignment in owning slices, expected current version, audit, and all-session revocation. No application command may create or assign Admin. | BD-078 |
| BR-075 | Admin may page/search and read minimum Customer/Staff/Warehouse account-security metadata; manage pending internal invitations; disable/reactivate an Active/Disabled Customer, Staff, or Warehouse User with mandatory reason and idempotency; and request the guarded internal role transfer. Admin shall not view/set/reset credentials, edit another User's personal profile/avatar/address, impersonate, hard-delete, convert Customer, create/assign Admin, or disable self through this feature. Disable is immediate; internal active work is flagged for reassignment/escalation rather than weakening the security transition. | BD-079, BD-086 |
| BR-076 | Login shall normalize email, verify password before disclosing status, require `Active` plus exactly one valid role, and create no session on any failure. Unknown email and wrong password shall return the same generic response. Disabled after correct password shall return the safe action to contact Staff/CSKH without granting a session. Five failed attempts for one normalized email within 15 minutes shall block that email's login for 15 minutes; 30 attempts from one IP within 15 minutes shall block that source. Successful login clears the email counter. Throttling shall not set `Disabled`. Every outcome shall be audit/security evidence without raw password or unnecessary email disclosure. | BD-080 |
| BR-077 | Successful login shall atomically create one revocable server-side session, rotate any pre-authentication identifier, and deliver only an opaque credential in an `HttpOnly`, production-`Secure`, `SameSite=Lax` cookie. The server shall revalidate current User status and role on every protected request and enforce CSRF/origin protections on state-changing cookie-authenticated operations. Multiple device sessions are permitted. Each session shall snapshot a default 24-hour idle deadline and seven-day absolute deadline; an expired or revoked session shall not authenticate. Client code shall not store or read an access bearer token. | BD-081 |
| BR-078 | Logout shall revoke the exact current server session and clear its cookie. Password change, password reset, role transfer, and account disable shall atomically revoke every active session for the User together with the triggering security change. Reactivation shall create no session and shall not restore a revoked credential. A repeated logout/revocation command shall return an already-processed result without repeating business effects. | BD-082, BD-086 |
| BR-079 | Registration completion, invitation acceptance, password change, and password reset shall enforce one password policy: 8–72 bytes, at least one letter and one digit, and matching confirmation. Change shall require the correct current password and a different new password. Forgot-password shall always return a generic response and issue no OTP for unknown or Disabled Users. Reset OTP shall be six digits, latest-only, ten-minute, five-attempt, single-use, and subject to the 60-second resend cooldown. Successful change/reset shall atomically update hash and password-change evidence and revoke all sessions; confirmation email is delivered from a retryable outbox after commit and delivery failure does not undo the password. No periodic rotation applies. | BD-083, BD-082 |
| BR-080 | Every Active Customer, Staff, Warehouse Manager, or Admin may read and update only own full name and canonical `phoneNumber`, change own password, and set/remove one system-managed avatar. Email, role, and status are read-only in this release. `phone` and free-form `User.address` shall not remain parallel authorities. Avatar shall be an owner-bound generated managed path, one JPEG/PNG/WebP file at most 5 MB, validated by declared type and actual content; arbitrary external/path input is denied, replacement/deletion preserves one current reference and safe cleanup. Audit records field names/events, not secret or full sensitive values. | BD-084 |
| BR-081 | Only authenticated Customer may list or mutate addresses owned by that Customer, with a maximum of ten. Each address contains label, receiver name, canonical phone, province, district, ward, and address line. The first address is default. When any address exists, exactly one shall be default and an atomic switch shall never expose zero/two defaults. A default cannot be deleted while another address remains; Customer must choose the replacement first. The sole address may be deleted, leaving zero. A saved or one-time checkout address shall be explicitly confirmed and copied into an immutable `SL-003` Order snapshot; later saved-address mutation never rewrites an Order. | BD-085 |
| BR-082 | Registration completion, invitation acceptance, Admin status/role commands, password changes/resets, session revocations, and address-default transitions shall be concurrency-safe and atomic for their grouped business/audit/outbox effects. Mutating commands that can be retried shall carry an idempotency identity and expected version where state can race; a retry returns the prior/current result with clear feedback. UI shall disable a pending submission and show processing/already-processed feedback. Audit/outbox payloads shall never contain raw password, OTP, token, cookie, or full address. Disabling an account shall not cancel/rewrite Cart/Order/Payment/Refund/Return/Exchange/Inventory or historical assignments; Customer-owned sensitive input still requires the Customer after reactivation, never Staff impersonation. | BD-075 through BD-086 |

## 7. UC-REG-01 — Verify Email and Register Customer

### Preconditions

1. Guest is not authenticated.
2. Registration is available and the email passes syntax/normalization validation.
3. No Active/Disabled User owns the normalized email.

### Main Flow

1. Guest enters an email and requests verification.
2. System applies email/IP request limits and the 60-second resend cooldown.
3. System invalidates the former pending registration code for that email, creates one six-digit ten-minute challenge with only a protected hash, and persists an idempotent outbox event.
4. Email Service delivers the OTP; external failure remains retryable and creates no User.
5. Guest submits the latest OTP together with full name, phone, password, and confirmation.
6. System validates data, OTP state/attempt/expiry, normalized-email uniqueness, Customer role availability, and command identity.
7. One atomic operation consumes the challenge, creates exactly one Active Customer, and records audit.
8. System shows success and directs the new Customer to login; registration does not create a session automatically.

## 8. UC-INV-01 — Invite and Activate Internal User

### Admin Invitation

1. Admin enters one unused work email and selects `Staff` or `WarehouseManager`.
2. System validates authorization, normalized uniqueness, exact role, command identity, and absence of another live invitation.
3. System creates one 24-hour PendingAcceptance invitation and an idempotent delivery event.
4. Resend invalidates the former token and issues one new live invitation; revoke terminates the current invitation.

### Recipient Acceptance

1. Recipient opens the latest invitation and supplies the token, own full name, phone, password, and confirmation.
2. System validates token signature/hash, current state, expiry, normalized-email uniqueness, role, and command identity.
3. One atomic operation consumes the invitation, creates exactly one Active internal User with the invited role, and records audit.
4. Recipient is directed to login; acceptance does not reuse the invitation as a session.

## 9. UC-AUT-01 — Login, Logout, and Recover Password

### Login

1. User submits normalized email and password.
2. System applies the IP/email limits and performs a constant-behavior credential check for unknown/wrong credentials.
3. After password success, System requires Active status and exactly one recognized role.
4. System creates a new server session with snapshotted idle/absolute deadlines, sets the protected cookie, records success, and returns the role-authorized landing destination.
5. Every protected request reloads/revalidates current status and role before the route's permission and ownership guard.

### Logout

1. Authenticated User submits logout once.
2. System revokes the current session and clears the cookie.
3. Other valid device sessions remain until their own expiry or an all-session security event.

### Password Recovery

1. Guest submits email and always receives the generic anti-enumeration response.
2. For an Active matching User, System creates/resends the bounded latest reset OTP and outbox event.
3. Guest submits email, latest OTP, new password, and confirmation.
4. One atomic operation consumes the OTP, updates password evidence, revokes all User sessions, records audit, and persists confirmation notification.

## 10. UC-ADM-01 — Manage Runtime Accounts and Internal Role

1. Admin pages/searches Customer/Staff/Warehouse accounts using minimum metadata.
2. Admin selects disable or reactivate and enters a mandatory reason; command includes idempotency and expected version.
3. Disable atomically changes `Active -> Disabled`, revokes all sessions, records reason/audit, and flags active internal work or blocked Customer handoffs without changing their business facts.
4. Reactivate atomically changes `Disabled -> Active`, records reason/audit, and creates no session.
5. For eligible Staff/Warehouse transfer, System checks no active owning-slice assignment, exact current role/version, target opposite internal role, and mandatory reason.
6. Successful transfer atomically changes role, revokes all sessions, and records before/after role plus reason.
7. Admin invitation management follows UC-INV-01; prohibited profile/password/Admin/Customer-conversion commands are denied and audited.

## 11. UC-PRO-01 — Manage Own Profile, Password, and Avatar

1. Active authenticated User reads own profile; email, role, status, and security metadata are read-only.
2. User updates own full name and/or canonical phone; System rejects protected/unknown fields.
3. For password change, User supplies current/new/confirmation; System performs BR-079 and all-session revocation atomically and requires a fresh login.
4. For avatar, User submits one bounded supported image; System validates actual content, assigns a generated managed path, updates only the owner, and cleans the former managed file safely after durable replacement.
5. Delete avatar removes only the current owner reference and the corresponding managed file; foreign/arbitrary paths are denied.

## 12. UC-ADR-01 — Manage Customer Address Book

1. Active Customer lists only own saved addresses, ordered with the default first.
2. Customer creates a valid structured address using an idempotency identity; the first becomes default, and the eleventh is rejected.
3. Customer updates only an owned address using current version; an Order snapshot never changes.
4. Customer atomically selects another owned address as default.
5. Customer may delete a non-default address or the sole default address. If other addresses remain, deleting the current default is blocked until Customer explicitly chooses a replacement.
6. Checkout may select an owned saved address or enter a one-time address; final `SL-003` confirmation creates an immutable delivery snapshot and optionally saves the new address under the same owner/max/default rules.

## 13. Alternative and Failure Paths

| Path | Condition | Required outcome |
|---|---|---|
| AF-007-01 | Registration email already belongs to a User | Create no challenge/User; return safe registration/login-recovery guidance without leaking account metadata |
| AF-007-02 | Verification or reset code is wrong but attempts remain | Increment one attempt atomically, create no User/password/session effect, and show remaining-safe correction feedback |
| AF-007-03 | Code expired, invalidated, used, or reaches five attempts | Deny consumption; require a new code subject to cooldown; repeated use changes nothing |
| AF-007-04 | Email delivery fails | Keep the challenge/invitation/password result in its independently committed state and retry outbox delivery without duplicating account/security effect |
| AF-007-05 | Concurrent registration/invitation acceptance races for one email | Unique normalized identity plus token/idempotency guard permits at most one User; loser receives current result and no partial User |
| AF-007-06 | Invitation role is Customer/Admin, token is former/revoked/expired, or email now exists | Deny acceptance and create no User/session/role effect |
| AF-007-07 | Unknown email or wrong login password | Return identical generic failure, record privacy-safe evidence, and create no session |
| AF-007-08 | Correct password but Disabled account | Return contact-CSKH guidance, record denial, and create no session; do not disclose protected business data |
| AF-007-09 | Missing/unknown/multiple role data | Fail closed, create no session/command effect, and raise auditable configuration/security evidence |
| AF-007-10 | Email/IP login threshold reached | Reject until the approved deadline; do not set Disabled or block the separate password-recovery limit |
| AF-007-11 | Session idle/absolute deadline passes or session is revoked | Reject protected request, clear unusable cookie where applicable, and require login |
| AF-007-12 | Password confirmation/policy/current-password validation fails | Change neither password evidence nor sessions; return field-safe correction feedback |
| AF-007-13 | Grouped password/session/audit operation fails | Roll back password and revocation together; old password/session facts remain consistently valid until a successful retry |
| AF-007-14 | Admin omits reason, targets stale status, self/Admin, or prohibited field | Deny with no account/session/history mutation and audit the forbidden/stale attempt where safe |
| AF-007-15 | Internal role transfer has active assignment | Block and list only safe reassignment prerequisites; retain role and sessions |
| AF-007-16 | Foreign User/address or non-Customer address command | Return not-found/forbidden without revealing ownership; change no address |
| AF-007-17 | Eleventh/invalid address or stale version | Reject with field/current-state feedback; retain prior default and address data |
| AF-007-18 | Customer attempts to delete default while another remains | Block and require explicit replacement; silently promoting an arbitrary address is forbidden |
| AF-007-19 | Concurrent default switches/creates/deletes | One transaction/constraint leaves exactly one default when any address remains; stale command returns current state |
| AF-007-20 | Disabled User has active Order/refund/return/exchange or internal assignment | Preserve every business fact; flag contact/reassignment; never let Staff impersonate or submit Customer-owned sensitive input |
| AF-007-21 | User repeats a completed mutating command | Return the prior/current outcome with `already processed` feedback; do not repeat User/session/address/audit/outbox business effect |

## 14. State Models

### 14.1 Registration Challenge

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Guest request; unused normalized email; limits/cooldown pass | Create hashed six-digit challenge and outbox event | PendingVerification |
| PendingVerification | Resend after 60 seconds | Invalidate former challenge; create new challenge/outbox | Invalidated for former; PendingVerification for new |
| PendingVerification | Wrong OTP; `attemptCount + 1 < 5`; before expiry | Increment attempt once | PendingVerification |
| PendingVerification | Wrong OTP makes attempt count five | Increment and close challenge | Invalidated |
| PendingVerification | Current time reaches ten-minute deadline | No account effect | Expired |
| PendingVerification | Correct latest OTP plus valid registration data; email remains unused | Atomically consume, create Active Customer, audit/outbox | Consumed |
| Consumed/Expired/Invalidated | Any repeated completion | Return current/prior result; no effect | Same terminal state |

### 14.2 Internal Invitation

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Admin invite; unused email; Staff/Warehouse role | Create 24-hour invitation and outbox | PendingAcceptance |
| PendingAcceptance | Admin resend before acceptance | Invalidate former; create new invitation/outbox | Revoked for former; PendingAcceptance for new |
| PendingAcceptance | Admin revoke | Record reason/audit; invalidate token | Revoked |
| PendingAcceptance | Current time reaches 24-hour deadline | No User effect | Expired |
| PendingAcceptance | Recipient accepts latest valid token; data valid; email unused | Atomically consume, create Active invited-role User, audit/outbox | Accepted |
| Accepted/Revoked/Expired | Repeat/old-token acceptance | Return denial/current result; no User effect | Same terminal state |

### 14.3 User Status

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Valid registration completion | Create one Customer role and identity | Active |
| None | Valid internal invitation acceptance | Create exact invited Staff/Warehouse role and identity | Active |
| Active | Admin disable; eligible target; mandatory reason/version | Revoke all sessions; record audit; flag active handoff/work | Disabled |
| Disabled | Admin reactivate; eligible target; mandatory reason/version | Record audit; create no session | Active |
| Active | Valid Staff/Warehouse transfer; no active assignment | Change exact role; revoke all sessions; audit reason | Active |
| Active/Disabled | Delete/Customer conversion/Admin assignment | Deny; preserve identity/history | Same state |

### 14.4 Authenticated Session

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| None | Correct credentials; Active; one valid role; limits pass | Create rotated server session and protected cookie | Active |
| Active | Protected request before deadlines; User still Active with same valid role | Refresh idle activity within absolute deadline | Active |
| Active | Current-session logout | Revoke and clear cookie | Revoked |
| Active | Password change/reset, role transfer, or account disable | Revoke every User session | Revoked |
| Active | Idle or absolute deadline reached | Reject future authentication | Expired |
| Revoked/Expired | Cookie retry | Deny; create no session | Same terminal state |

### 14.5 Address Default State

| Current state | Event and guard | Action | Next state |
|---|---|---|---|
| Zero addresses | Customer creates first valid address | Create as default | One default |
| One default plus fewer than ten total | Create non-default | Add without changing default | One default |
| One default | Select another owned address | Atomically unset former and set target | One default |
| One default plus other addresses | Delete current default | Deny until replacement selected | One default |
| Sole default | Delete sole address | Delete it | Zero addresses |
| One default | Delete non-default | Delete target only | One default |

## 15. State, Security, Data, and Privacy Invariants

1. A pending registration or invitation is not a User and cannot authenticate or own business data.
2. Normalized email is globally unique across Active and Disabled Users; live challenges/invitations cannot bypass final uniqueness.
3. Every User has exactly one recognized role and one `Active` or `Disabled` status.
4. No application path creates/assigns Admin, combines roles, or converts Customer to an internal role.
5. UI route hiding is never authorization; the current persisted role and ownership guard are enforced server-side for every protected command/read.
6. Unknown/wrong credentials produce no session and the same public response.
7. Account/IP throttle state is temporary security state, not User status.
8. No session credential is available to browser JavaScript, logs, URLs, or email payloads.
9. Idle deadline cannot exceed the session's immutable absolute deadline.
10. Logout revokes exactly the current session; password change/reset, role transfer, and disable revoke all User sessions.
11. Reactivation never restores session authority and always requires a new login.
12. Password, OTP, invitation/reset token, cookie, and raw bearer/session secrets never appear in API response, audit description, notification payload, or application log.
13. Registration/invitation/reset stores only protected token evidence; plaintext OTP exists only transiently for delivery construction.
14. Password policy and confirmation are identical at every password-creation boundary.
15. Full name and canonical `phoneNumber` are self-owned; email, role, and status are read-only to ordinary profile commands.
16. User contains no second `phone` or free-form `address` business authority after migration.
17. Avatar is one owner-bound managed file reference; arbitrary remote/path input cannot become trusted profile data.
18. Only Customer may own/read/write UserAddress. Internal/Admin roles have no address-book authority.
19. Each Customer holds at most ten addresses; zero addresses has zero default and one-or-more addresses has exactly one default.
20. Default switch is one atomic state change; a silent arbitrary promotion after deleting a default is forbidden.
21. Saved-address mutation never changes an existing Order delivery snapshot.
22. Critical grouped security/address mutation plus required audit/outbox evidence commits all or none; external email delivery occurs after commit and is retryable.
23. Each retryable command has one business effect; repeated click/retry returns prior/current evidence and visible feedback.
24. Disable does not rewrite or cancel Orders, Payments, Refunds, Returns/Exchanges, Inventory, Cart history, or assignment evidence.
25. Staff/CSKH may coordinate recovery but cannot impersonate or enter Customer-owned credentials, delivery address, or refund destination.
26. Audit records actor, action, target, prior/next status or role where applicable, reason, request/idempotency identity, and timestamp without full sensitive values.

## 16. UI and Interface Contract

### Guest Registration and Recovery

- Registration is a two-step surface: request email code, then submit latest code plus full name, phone, password, and confirmation.
- Registration has no delivery-address field and does not log the Customer in automatically.
- OTP surfaces show expiry/cooldown/attempt-safe feedback without exposing whether unrelated account data exists.
- Resend and completion buttons disable while pending; repeated requests display `đã gửi/đã xử lý` and do not create duplicate User/outbox effects.
- Forgot-password always acknowledges safely; reset shows specific code correction only after a reset attempt without exposing account metadata.

### Login and Session

- Login shows the same invalid-credentials message for unknown email and wrong password.
- Correct credentials for Disabled show `Tài khoản đã bị vô hiệu hóa; liên hệ CSKH` and create no session.
- Rate-limit feedback states when it is safe to retry; it does not claim the account was permanently locked.
- Client uses cookie credentials and contains no localStorage/sessionStorage access token.
- Logout calls the server, waits for revocation, clears local identity state, and treats a repeated logout as already completed.
- Expired/revoked session directs to login without showing a protected page as authenticated.

### Self Profile and Address Book

- Every Active role has own profile, password, and avatar controls; email/role/status are visibly read-only.
- Profile contains only full name and one canonical phone field; no `Địa chỉ cơ bản` duplicate exists.
- Avatar permits one JPEG/PNG/WebP up to 5 MB and exposes pending/success/failure cleanup-safe feedback.
- Only Customer sees or can call the address book. It displays `n/10`, default state, owner-safe validation, and explicit checkout purpose.
- Delete is unavailable for the default while another address remains and instructs Customer to select a replacement first.
- Checkout distinguishes saved versus one-time address, confirms the selected values, and explains that the Order stores a snapshot.

### Admin Accounts

- Admin account list is paged/searchable and shows only minimum name/email/role/status/created/last-login/security state.
- Invite form permits only Staff or Warehouse Manager and never displays a password field.
- Pending invitation supports resend/revoke with expiry and already-processed feedback.
- Disable/reactivate and eligible role transfer require reason, confirmation, current version, pending-state disabling, and current-result refresh on conflict.
- No control exists for editing personal profile/address, setting/resetting another password, converting Customer, creating Admin, or hard-deleting User.
- Active-assignment block identifies the safe reassignment prerequisite without revealing unrelated protected data.

### Staff / CSKH and Warehouse

- Each actor can manage own profile/security but has no account-administration or Customer-address control.
- A disabled Customer with an outstanding owned action appears only as a contact/escalation need; Staff receives no impersonation or sensitive-input control.
- A disabled/role-transferred internal User's active work is identified for the owning queue; security access is not kept open to finish work.

## 17. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-125 | Given an unused normalized email, when Guest requests registration, then one latest ten-minute hashed six-digit challenge and idempotent outbox event exist, no User/session/address exists, and plaintext OTP is absent from stored/logged data. | `approved-requirement` |
| AT-126 | Given the latest valid OTP and valid full name/phone/password/confirmation, when registration completes, then exactly one Active Customer commits atomically without a registration address, challenge becomes Consumed, audit evidence exists, and login is still required. | `approved-requirement` |
| AT-127 | Given wrong, fifth-wrong, expired, former, used, or too-early resend OTP, when submitted, then no User is created, the exact bounded challenge state changes at most once, and a new code is required where applicable. | `approved-requirement` |
| AT-128 | Given duplicate normalized email, concurrent final submissions, repeated idempotency key, or injected User/audit/outbox failure, when registration runs, then at most one complete User/effect exists and every failed group leaves no partial account. | `approved-requirement` |
| AT-129 | Given Admin and one unused email, when Staff or Warehouse invitation is submitted, then one 24-hour PendingAcceptance invitation/outbox is created with no User and no Admin-selected/stored password. | `approved-requirement` |
| AT-130 | Given the latest valid invitation and recipient-owned profile/password, when accepted, then exactly one Active User with the exact invited role commits and the invitation cannot be reused; expired/revoked/former input creates none. | `approved-requirement` |
| AT-131 | Given resend, revoke, duplicate/concurrent acceptance, existing email, or Customer/Admin invitation role, when Admin/recipient acts, then former/forbidden effects are denied, one live/outcome state remains, and no unintended role/User is created. | `approved-requirement` |
| AT-132 | Given every protected API and UI route across four roles, when correct and wrong actors call it directly, then the server's current single-role plus ownership matrix permits only the approved actor and missing/unknown/multiple role fails closed. | `approved-requirement` |
| AT-133 | Given Customer conversion, Admin assignment, or Staff/Warehouse transfer with/without active work/reason/current version, when Admin acts, then only the eligible exact internal transfer succeeds with audit and all-session revocation. | `approved-requirement` |
| AT-134 | Given Admin account administration, when list/detail/update operations run, then only minimum metadata/invitation/status/eligible role controls exist; password, OTP, token, personal profile/address, impersonation, hard-delete, self-disable, Customer conversion, and Admin creation are unavailable/denied. | `approved-requirement` |
| AT-135 | Given Active/Disabled target with mandatory reason and command identity, when Admin disables/reactivates or repeats/races the command, then one exact status transition/audit occurs, disable revokes all sessions, reactivate restores none, and history remains. | `approved-requirement` |
| AT-136 | Given unknown email and wrong password, when login is attempted, then both return the same generic response, create no session/cookie, and record privacy-safe failed-attempt evidence. | `approved-requirement` |
| AT-137 | Given correct password for Disabled or missing/unknown/multiple role, when login runs, then no session exists; Disabled gets contact-CSKH guidance only after password proof and role corruption fails closed with security evidence. | `approved-requirement` |
| AT-138 | Given five failed attempts/email or 30 attempts/IP within 15 minutes, when another login occurs, then the exact temporary limit applies without setting Disabled; an eligible success clears the email counter and separate recovery remains governed by its own limit. | `approved-requirement` |
| AT-139 | Given correct credentials for an Active one-role User, when login succeeds, then one server session with protected opaque cookie, snapshotted 24-hour idle/seven-day absolute deadlines, audit, and correct role landing commits; browser storage contains no bearer token. | `approved-requirement` |
| AT-140 | Given multiple device sessions and protected requests around idle/absolute deadlines or a persisted status/role change, when evaluated, then only currently valid sessions with current authorized User facts succeed and expired/revoked/stale authority is denied. | `approved-requirement` |
| AT-141 | Given two device sessions, when logout is submitted/retried from one, then only that session is revoked/cleared once and the other remains valid unless another all-session security event applies. | `approved-requirement` |
| AT-142 | Given correct/incorrect current password and valid/invalid new password, when self-change runs, then only valid input atomically updates hash/password evidence, revokes all sessions including current, audits/queues confirmation, and requires fresh login. | `approved-requirement` |
| AT-143 | Given unknown, Disabled, Active, cooldown, wrong/expired/fifth/used, valid, concurrent, and repeated reset cases, when recovery runs, then requests remain anti-enumerating, only one latest bounded OTP works, valid reset atomically changes password/revokes all sessions once, and delivery failure never undoes it. | `approved-requirement` |
| AT-144 | Given Active Customer/Staff/Warehouse/Admin and a foreign/protected-field attempt, when profile reads/updates run, then each actor changes only own full name/phone while email/role/status and every other User remain unchanged. | `approved-requirement` |
| AT-145 | Given legacy `phone`, `phoneNumber`, free-form `User.address`, and structured addresses during migration/operation, when profile data is written/read, then exactly one canonical phone survives, no free-form address authority remains, and invalid phone/profile input is rejected. | `approved-requirement` |
| AT-146 | Given owner/foreign actor, supported/invalid/oversized/disguised image, arbitrary URL/path, replacement/deletion, and injected storage/profile failure, when avatar changes, then only one valid owner-managed reference commits, unsafe input is denied, and no orphan/current file is lost incorrectly. | `approved-requirement` |
| AT-147 | Given Customer, non-Customer, two Customers, zero/ten addresses, and valid/invalid fields, when address CRUD is called directly, then only the owner accesses own maximum-ten structured addresses and foreign/non-Customer/eleventh input changes nothing. | `approved-requirement` |
| AT-148 | Given zero, one, or many addresses plus concurrent create/default/delete commands, when they run, then zero addresses has zero default, any non-empty set has exactly one, switch is atomic, deleting default with alternatives is blocked, and deleting the sole address leaves zero. | `approved-requirement` |
| AT-149 | Given saved/one-time checkout address, later edits/deletes, repeated address/create/state commands, account disable, and active SL-001–SL-006 records, when flows continue, then Order snapshot/history never changes, retries have one visible effect, blocked Customer work requires contact/reactivation without Staff impersonation, and no secret/full address enters audit. | `approved-requirement` |

## 18. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Confirmed gap | Status |
|---|---|---|---|---|---|---|
| BD-075 | BR-071 | Registration/invitation/User state models | `server/src/models/user.model.js`; password-reset token only; no registration/invitation models | AT-125 through AT-131, AT-135 | Current registration creates an Active User directly; no separate pre-account states or internal invitation lifecycle exist | ready |
| BD-076 | BR-072 | UC-REG-01; Register page/API/email outbox | `auth.service.js`; `auth.routes.js`; `RegisterPage.jsx`; email service/model | AT-125 through AT-128 | Registration requires address, creates Active immediately, has no verification challenge/outbox, and email renderer has no registration event | ready |
| BD-077 | BR-073 | UC-INV-01; Admin invitation UI/API | User/Role models; `createAccounts.js`; no Admin User routes/pages | AT-129 through AT-131 | Internal accounts are only seed/script data; no invitation, expiry, resend, revoke, or recipient-owned activation exists | ready |
| BD-078 | BR-074 | Protected routes; UC-ADM-01 transfer | `role.model.js`; `authorize.middleware.js`; hard-coded `authorizeRoles(...)` routes | AT-132, AT-133 | `Role.permissions` is stored but unused; route strings are distributed; no invalid/multiple-role integrity or guarded transfer workflow exists | ready |
| BD-079 | BR-075 | Admin account list/invite/status/role interfaces | No account-management routes/controllers/services/pages; `user.model.js` | AT-129, AT-131, AT-134, AT-135 | Candidate Must Have Admin account administration is absent | ready |
| BD-080 | BR-076 | UC-AUT-01 login and security feedback | `auth.service.js`; app-wide auth rate limiter; Login page; auth tests | AT-136 through AT-138 | Disabled is checked before password, failure audit/account throttle is missing, one global IP limit covers every auth endpoint, and tests encode explicit Disabled behavior only | ready |
| BD-081 | BR-077 | Login/current-user/protected request interfaces | `jwt.js`; auth middleware; `apiClient.js`; `authService.js`; `AuthContext.jsx` | AT-139, AT-140 | Stateless seven-day JWT is stored in localStorage; fallback secret exists; there is no Session model, cookie authority, CSRF control, idle deadline, or server revocation | ready |
| BD-082 | BR-078 | Logout/password/status/role revocation | `auth.controller.js`; password-reset service; profile service; password-version middleware | AT-135, AT-140 through AT-143 | Logout is response-only; profile password change does not update `passwordChangedAt`; current JWT revocation is incomplete and not server-session based | ready |
| BD-083 | BR-079 | Registration/invitation/change/reset forms and APIs | auth route/service validation; profile service; password-reset service/tests | AT-126, AT-130, AT-142, AT-143 | Registration accepts only minimum length, profile requires letter+digit, reset requires upper+lower+digit, and no consistent 72-byte bound exists | ready |
| BD-084 | BR-080 | UC-PRO-01; Profile/avatar API/UI | User model; profile service/routes/page; upload middleware/controller/service | AT-144 through AT-146 | User persists duplicate phone fields and free-form address; profile writes both; email contract disagrees with candidate SRS; avatar path is managed but complete ownership/atomic cleanup evidence is limited | ready |
| BD-085 | BR-081 | UC-ADR-01; Profile/checkout address interfaces | UserAddress model/service/tests; profile routes/page; Checkout page | AT-147 through AT-149 | Address routes allow any authenticated role, have no max, default switch/delete spans non-transactional writes, and deleting default silently promotes a sorted address | ready |
| BD-086 | BR-075, BR-078, BR-082 | Disable/reactivate and blocked-work handoff | Auth middleware blocks Disabled; no Admin/status UI/service or cross-slice recovery flag | AT-135, AT-149 | Disable is not implemented as a governed command with all-session revocation, reason, active-work escalation, or Customer-action recovery | ready |

## 19. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `auth.service.js` creates an Active Customer immediately and stores both `phone`/`phoneNumber` plus free-form `address`.
2. Registration route/UI requires address, contains no confirmation field, verification step, challenge, or registration-email outbox event.
3. The email renderer supports reset/contact/order events but not registration verification, internal invitation, password confirmation, or account-security notification.
4. Login checks Disabled before comparing the password, reveals status to an unverified credential submitter, logs success only, and does not cleanly guard a missing/invalid role.
5. The auth limiter is a single IP-oriented `/api/auth` limit rather than separate email/IP login and OTP cooldown/attempt policies.
6. Authentication signs a seven-day JWT with a development fallback secret; middleware uses the same fallback.
7. Client stores the bearer token in `window.localStorage`, attaches it to Authorization headers, and derives authentication from readable token presence.
8. Logout returns success without invalidating server authority.
9. Password reset updates `passwordChangedAt`, but self-profile password change updates only `passwordHash`, so prior JWTs remain valid after self-change.
10. Registration, self-change, and reset enforce three different password policies and no consistent 72-byte boundary.
11. User supports only Active/Disabled, which is suitable for real User state, but no separate RegistrationChallenge, InternalInvitation, or server Session models exist.
12. No Admin account-management service, route, or page exists despite candidate SRS Must Have requirements.
13. Role stores a `permissions` array while runtime routes authorize distributed hard-coded role-name strings; no single approved matrix is enforced as one authority.
14. Profile is available to all authenticated roles, but candidate SRS describes Customer only; the approved design intentionally makes limited self-profile available to all Active roles.
15. Candidate SRS expects normalized unique email profile changes, while code makes email read-only; approved SL-007 makes email change explicitly out of scope rather than silently choosing either source.
16. Profile retains `phone`, `phoneNumber`, and free-form `address` while Customer also has structured UserAddress records.
17. Address routes require authentication but no Customer role, so Staff/Warehouse/Admin can call address endpoints directly.
18. UserAddress has a unique partial default index but service unsets and sets in separate non-transactional calls; races can produce conflict/zero-default windows.
19. Address creation has no ten-address limit or command idempotency; deleting default silently promotes the first sorted remainder.
20. Existing tests pass many current behaviors but explicitly expect required registration address and browser token storage and do not cover AT-125 through AT-149.
21. During the SL-007 audit, 34 selected server checks passed while two app-loading suites could not start because local `@payos/node` was unavailable; 10 selected client checks passed. This is environment/observed evidence, not business approval.

## 20. Cross-Slice Consistency Boundaries

1. `SL-001` and `SL-003` secure refund-destination input remains Customer-owned. A disabled Customer must be contacted/reactivated; Staff/CSKH cannot enter or edit the destination.
2. `SL-001`/`SL-002` after-sales cases, deadlines, Warehouse inspection, and payout facts continue unchanged when any account is disabled.
3. `SL-003` checkout uses a saved or one-time delivery input but owns the immutable Order snapshot. UserAddress is convenience data, never Order delivery authority after commit.
4. `SL-003` Order/payment cancellation/refund and payOS state cannot be reopened, cancelled, or reclassified by an account-status command.
5. `SL-004` fulfillment actor transitions remain Staff/CSKH and Warehouse decisions; Admin account authority does not grant operational fulfillment or physical-stock actions.
6. `SL-005` Inventory authority remains Warehouse/System under approved guards. Role administration cannot directly change quantity, reservation, quarantine, damage, or replenishment evidence.
7. `SL-006` Guest catalog stays public; Customer Cart remains Customer-only. A disabled Customer cannot use the Cart, but disable does not delete prior Cart/Order history.
8. Staff remains CSKH everywhere. Admin is not CSKH, Warehouse, Customer proxy, or a super-actor allowed to bypass slice ownership.
9. Internal role transfer is blocked while active owning-slice assignments exist; disable remains immediate and sends such work to an explicit reassignment/escalation path.
10. Notification/email delivery is a supporting integration. Its failure cannot roll back independently committed User/password/status/session/address business state or cause duplicate effects.
11. A future direct email-change flow must prove the new email, preserve global identity uniqueness, decide session revocation, and receive separate approval; ordinary profile update cannot introduce it.
12. A future self-service closure/legal-erasure flow must preserve transaction/audit duties and receive separate policy/legal approval; `Disabled` is not deletion.

## 21. Method Basis and Next Phase

Archived SWR Chapter 17 states that requirements validation checks whether requirements correctly derive from business needs/rules, are complete/feasible/verifiable, are necessary and sufficient, remain consistent across representations, and provide an adequate basis for design/construction. Archived SWD Chapters 9–11 describe state-dependent behavior through current state, input event, optional guard condition, transition action, and next state. GreenHouse policy in this document comes only from SRC-041 and approved cross-slice decisions, not from those method archives, candidate SRS text, passing tests, or current code.

No code change, migration, red test, or implementation plan is authorized by this document alone. CR-001 v2.1 records the completed cross-system closure and COD collection/settlement clarification; the next step is exact G3 mapping before red acceptance tests or implementation.
