# CI Ephemeral Staging Design

**Status:** Approved

**Date:** 2026-07-23

## 1. Decision

GreenHome Kitchen will use GitHub Actions to create a disposable integration
environment for every pull request and every push to `main`.

This is intentionally **CI with ephemeral staging**, not continuous deployment.
The workflow does not publish a persistent URL and does not deploy to Azure,
MongoDB Atlas, or another hosting provider. The environment exists only while
the GitHub Actions job is running.

This choice minimizes setup risk before the team defence while still producing
repeatable evidence that the merged code can start against a transaction-capable
MongoDB replica set and that the SL-001 and SL-002 workflows execute successfully.

## 2. Goals

- Run backend tests, frontend tests, dependency audits, and the production build
  on pull requests and pushes to `main`.
- Start an isolated MongoDB replica set for each workflow run.
- Run the current database migrations against the disposable database.
- Exercise the SL-001 return/refund and SL-002 exchange verification scripts
  against the real MongoDB topology required by checkout transactions.
- Start the backend and built frontend inside the runner.
- Verify the frontend, API health contract, CORS policy, authentication, and
  role boundaries through the running HTTP services.
- Capture logs, machine-readable reports, and browser screenshots as workflow
  artifacts even when a smoke step fails.
- Leave no shared database records, credentials, payment operations, email
  messages, or carrier events after the job ends.

## 3. Non-goals

- A persistent staging website or API URL.
- Azure, MongoDB Atlas, Render, Railway, Vercel, or other cloud provisioning.
- Production deployment, production rollback, load testing, or availability
  testing.
- Real PayOS payment or payout calls.
- Real SMTP delivery, carrier callbacks, or evidence-scanner calls.
- Replacing manual defence rehearsal on the team's laptop.

## 4. Trigger and Gate Model

One workflow named `CI and ephemeral staging` will run on:

- `pull_request` targeting `main`;
- `push` to `main`;
- `workflow_dispatch` for an explicit rerun.

The workflow uses one concurrency group per branch or pull request. A new run
may cancel an older run for the same ref, but runs for different refs remain
independent.

The repository-level permission is `contents: read`. No write permission,
cloud credential, repository secret, or environment secret is required.

A run is successful only when every required phase succeeds:

1. dependency installation;
2. backend and frontend unit/contract tests;
3. dependency audits;
4. frontend production build;
5. MongoDB replica-set initialization;
6. database migrations;
7. SL-001 and SL-002 service verification;
8. live backend/frontend smoke checks;
9. browser smoke checks.

## 5. Runtime Architecture

```text
GitHub-hosted Ubuntu runner
├── MongoDB container
│   └── single-node replica set rs0
├── Express API on 127.0.0.1:5000
├── Vite preview of the production build on 127.0.0.1:4173
├── Node smoke runner
└── Playwright Chromium smoke runner
```

The MongoDB container uses an official MongoDB 8 image pinned to an immutable
digest. The workflow starts it with `--replSet rs0 --bind_ip_all`, initializes
`rs0`, and polls `rs.status().ok` until the primary is ready. Fixed sleeps are
not used as readiness evidence.

The disposable URI is:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0
```

The database name remains `greenhome_kitchen` because the existing SL-001 and
SL-002 verification guards accept only this local database. Safety comes from
the disposable container, the loopback host requirement, and `NODE_ENV=test`.

## 6. Environment and Integration Safety

Secrets required by application security contracts are generated inside each
job and written only to the job environment. They are never committed, printed,
uploaded, or reused:

- `JWT_SECRET`;
- `RESET_OTP_SECRET`;
- `CARRIER_WEBHOOK_SECRET`;
- `REFUND_DESTINATION_ENCRYPTION_KEY`;
- `RETURN_EVIDENCE_CLAIM_SECRET`.

External integrations use these settings:

```dotenv
NODE_ENV=test
MAIL_PROVIDER=fake
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
RETURN_EVIDENCE_SCANNER_URL=
RETURN_EVIDENCE_SCANNER_API_KEY=
```

PayOS remains deliberately unconfigured so any attempted real payment or payout
fails closed with the application's existing `PAYOS_NOT_CONFIGURED` contract.
Email uses the existing in-process fake provider. Carrier verification uses only
the generated job secret. No external webhook is sent.

## 7. Database Preparation and Migrations

The workflow runs these commands against the empty disposable replica set:

```text
npm run migrate:product-sku-index
npm run migrate:cod-reconciliation
npm run migrate:sl002
```

Each migration must complete successfully before application startup. The
workflow then reruns the three commands once to prove that they are idempotent
on the resulting schema.

A dedicated CI fixture command creates only the minimum stable actors required
by verification and live authentication:

- Customer: `khachhang@greenhome.test`;
- Staff: `nhanvien@greenhome.test`;
- Warehouse Manager: `quanlykho@greenhome.test`.

The fixture command:

- rejects non-loopback MongoDB hosts;
- rejects any database name other than `greenhome_kitchen`;
- rejects `NODE_ENV=production`;
- upserts only the named CI actors and their canonical roles;
- hashes one job-generated password;
- never calls `dropDatabase`;
- emits counts and actor identifiers, never credentials.

The whole MongoDB container is discarded after the job, so no shared data reset
or cleanup command is needed.

## 8. SL-001 and SL-002 Verification

After the actors exist, the workflow runs:

```text
npm run verify:sl001
npm run verify:sl002
```

These scripts create uniquely marked records, execute the approved business
services, assert lifecycle and inventory facts, and remove the records they
created. A failure blocks the workflow.

The verification output is captured in separate log files so the team can show
which slice failed without searching the complete Actions log.

## 9. Live HTTP Smoke Tests

The client production build uses:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:5000/api
```

The workflow starts the API and the production build preview as background
processes, stores their process identifiers, and polls:

- `http://127.0.0.1:5000/api/health`;
- `http://127.0.0.1:4173/`.

The Node smoke runner verifies:

- frontend response status and application root markup;
- API health status and response contract;
- allowed CORS headers for `http://127.0.0.1:4173`;
- absence of an allow-origin header for an untrusted origin;
- successful login for Customer, Staff, and Warehouse Manager;
- the role returned for each actor;
- an unauthenticated protected request is rejected;
- authenticated requests respect the existing actor boundary.

The smoke runner writes `artifacts/ephemeral-staging/smoke-report.json` with
step name, outcome, duration, HTTP status, and request ID. It never writes
tokens or passwords.

## 10. Browser Smoke Tests

Playwright Chromium opens the built frontend, records the browser console, and:

- verifies that the home page renders without an uncaught page error;
- opens the login page;
- authenticates as the CI Customer actor;
- verifies the signed-in customer shell;
- captures desktop screenshots of the public home page and signed-in shell.

Browser testing is intentionally small. Business lifecycle depth remains in the
SL-001 and SL-002 verification scripts so the pre-defence workflow stays fast
and deterministic.

## 11. Failure Handling and Evidence

Every background process writes to a separate file:

- `api.log`;
- `frontend.log`;
- `sl001-verification.log`;
- `sl002-verification.log`;
- `browser-console.log`;
- `smoke-report.json`;
- Playwright HTML report and screenshots.

An `if: always()` artifact step uploads the evidence with seven-day retention.
Sensitive environment values are masked and excluded from artifacts.

The cleanup step stops the frontend, API, and MongoDB container even after a
failure. The job has a finite timeout so a readiness or browser failure cannot
consume an unbounded runner.

The workflow summary reports each phase as passed or failed and links to the
artifact bundle. No step uses `continue-on-error` for a required gate.

## 12. Developer Reproduction

The reusable fixture and smoke logic lives in repository scripts rather than
inline workflow YAML. Developers with a local MongoDB replica set can run the
same commands by supplying the documented test environment variables.

GitHub-specific orchestration remains in the workflow:

- starting and discarding the MongoDB container;
- generating job-only secrets;
- starting background processes;
- uploading artifacts and the job summary.

## 13. Acceptance Criteria

- A pull request to `main` automatically receives the workflow status.
- A push to `main` automatically runs the same workflow.
- Backend and frontend tests report exact pass/fail counts.
- The production client build completes.
- Dependency audits report no known production vulnerability.
- MongoDB reports an initialized writable primary before migrations start.
- All three migrations pass twice on the disposable database.
- SL-001 and SL-002 verifiers pass against that replica set.
- The live API, built frontend, CORS, authentication, and role smoke checks pass.
- Browser smoke produces screenshots without uncaught page errors.
- Evidence artifacts are available on both success and failure.
- The workflow requires no repository secret and leaves no persistent service.

## 14. Known Limitation

Passing this workflow proves build, integration, migration, and selected
business-flow behavior inside a GitHub runner. It does not prove that a public
cloud deployment, DNS, TLS certificate, production-sized database, or external
PayOS/email/carrier integration works. Those require a future persistent
staging or production deployment.
