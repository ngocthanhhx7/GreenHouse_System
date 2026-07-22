# Responsive Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the approved responsive GreenHome Kitchen redesign through one foundation gate followed by four owner-scoped parallel workstreams, then complete Thành-led review, merge, regression and push.

**Architecture:** The Foundation branch owns global tokens, import order and shared shells. After it is merged, Catalog, Customer Purchase, Staff Operations and Warehouse/Admin worktrees branch from the same updated `main` and edit disjoint page/CSS modules. Nguyễn Ngọc Thành reviews and merges each feature branch with `--no-ff`; Stitch exports remain untracked design input.

**Tech Stack:** React 19, React Router 7, Vite 6, Bootstrap 5 legacy compatibility, modular CSS, Node test runner, PowerShell, Git worktrees.

---

## Plan Set and Dependency Graph

- Foundation: `docs/superpowers/plans/2026-07-22-responsive-foundation.md`
- Catalog: `docs/superpowers/plans/2026-07-22-responsive-catalog.md`
- Customer purchase: `docs/superpowers/plans/2026-07-22-responsive-customer-purchase.md`
- Staff operations: `docs/superpowers/plans/2026-07-22-responsive-staff-operations.md`
- Warehouse/Admin: `docs/superpowers/plans/2026-07-22-responsive-warehouse-admin.md`

```text
Approved spec + plans
          |
          v
Foundation / shared shell
          |
          v
   updated main baseline
     /      |      |      \
 Catalog Customer Staff Warehouse/Admin
     \      |      |      /
          Thành reviews
               |
               v
        full regression + QA
               |
               v
       push main + cleanup
```

Only the Foundation gate is sequential. The four module workstreams start together after Foundation is merged.

### Task 1: Land the approved design documentation

**Files:**
- Verify: `docs/superpowers/specs/2026-07-22-responsive-stitch-frontend-integration-design.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-foundation.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-catalog.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-customer-purchase.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-staff-operations.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-warehouse-admin.md`
- Verify: `docs/superpowers/plans/2026-07-22-responsive-frontend-integration.md`

- [ ] **Step 1: Confirm the documentation branch contains only approved docs**

Run from `D:\WW\GreenHouse_System\.worktrees\feature-thanh-stitch-ui-prompts`:

```powershell
git status --short --branch
git diff --cached --name-only
git diff --check
```

Expected: only files under `docs/superpowers/specs`, `docs/superpowers/plans` and `docs/ui-prompts/stitch`; no `thiết kế stitch`, client asset or server script is staged.

- [ ] **Step 2: Commit the plan set as Nguyễn Ngọc Thành**

```powershell
git add -- docs/superpowers/plans
git diff --cached --check
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "docs: add responsive frontend execution plans"
```

Expected: one documentation commit authored and committed by Nguyễn Ngọc Thành.

- [ ] **Step 3: Review the complete documentation diff**

```powershell
git diff main...feature/thanh-stitch-ui-prompts --check
git diff --stat main...feature/thanh-stitch-ui-prompts
git log --format="%h %an <%ae> %s" main..feature/thanh-stitch-ui-prompts
```

Expected: clean whitespace check; prompt pack, approved spec and implementation plans only.

- [ ] **Step 4: Merge the documentation branch into main**

Run from `D:\WW\GreenHouse_System`:

```powershell
git switch main
git merge --no-ff feature/thanh-stitch-ui-prompts -m "merge: add responsive Stitch frontend plans"
git push origin main
```

Expected: merge commit on `main`; push succeeds without force.

- [ ] **Step 5: Remove the merged documentation worktree and branch**

```powershell
git -C "D:\WW\GreenHouse_System\.worktrees\feature-thanh-stitch-ui-prompts" status --porcelain
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-thanh-stitch-ui-prompts"
git branch -d feature/thanh-stitch-ui-prompts
```

Expected: the worktree status command is empty before removal; the merged branch deletes safely.

### Task 2: Establish and merge the Foundation gate

**Files:**
- Implement according to: `docs/superpowers/plans/2026-07-22-responsive-foundation.md`
- Worktree: `D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation`

- [ ] **Step 1: Confirm main keeps unrelated local files unstaged**

```powershell
git status --short --branch
```

Expected: `main` is current; any of the following may remain untracked and must not be staged:

```text
client/public/assets/icon/contact/
client/public/assets/icon/home/
server/src/scripts/createAccounts.js
thiết kế stitch/
```

- [ ] **Step 2: Create the isolated Foundation worktree**

```powershell
git worktree add "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation" -b feature/thanh-responsive-foundation main
```

Expected: new worktree on `feature/thanh-responsive-foundation`.

- [ ] **Step 3: Run the baseline client verification**

```powershell
Set-Location "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation\client"
npm test
npm run build
```

Expected: all existing client tests pass and Vite production build exits 0 before edits.

- [ ] **Step 4: Execute every Foundation plan checkbox**

Use `superpowers:subagent-driven-development` with `2026-07-22-responsive-foundation.md`. The final Foundation result must include canonical CSS tokens/imports, self-hosted fonts, shared Header/Footer/Internal shell, P01/P04–P12/P39 responsive pages and updated shared tests.

Expected commits use:

```text
Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>
```

- [ ] **Step 5: Run Foundation verification**

```powershell
Set-Location "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation\client"
npm test
npm run build
git -C "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation" diff main...HEAD --check
```

Expected: tests/build pass; whitespace check is clean.

- [ ] **Step 6: Review the Foundation branch against the spec**

Review must explicitly confirm:

```text
Guest has no cart/bell/avatar.
Customer has cart/bell/avatar.
Internal topbar has bell/account but no cart/public navigation.
Internal pages have no storefront Footer.
Sidebar links remain role-specific.
P04 About body is preserved.
No Stitch export or demo data is committed.
```

- [ ] **Step 7: Merge and push Foundation**

```powershell
Set-Location "D:\WW\GreenHouse_System"
git switch main
git merge --no-ff feature/thanh-responsive-foundation -m "merge: integrate responsive frontend foundation"
git push origin main
```

Expected: `main` contains the shared contract all parallel modules consume.

- [ ] **Step 8: Remove the Foundation worktree and branch**

```powershell
git -C "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation" status --porcelain
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-thanh-responsive-foundation"
git branch -d feature/thanh-responsive-foundation
```

Expected: clean worktree removed; merged branch deleted.

### Task 3: Create four parallel owner worktrees from the Foundation baseline

**Worktrees:**
- `D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog`
- `D:\WW\GreenHouse_System\.worktrees\feature-huy-responsive-customer`
- `D:\WW\GreenHouse_System\.worktrees\feature-nhat-responsive-staff`
- `D:\WW\GreenHouse_System\.worktrees\feature-cuong-responsive-warehouse-admin`

- [ ] **Step 1: Verify all worktrees will start from updated main**

```powershell
git switch main
git status --short --branch
git log -1 --oneline
```

Expected: the latest commit is the Foundation merge; unrelated untracked inputs remain unstaged.

- [ ] **Step 2: Create all module worktrees**

```powershell
git worktree add "D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog" -b feature/chung-responsive-catalog main
git worktree add "D:\WW\GreenHouse_System\.worktrees\feature-huy-responsive-customer" -b feature/huy-responsive-customer main
git worktree add "D:\WW\GreenHouse_System\.worktrees\feature-nhat-responsive-staff" -b feature/nhat-responsive-staff main
git worktree add "D:\WW\GreenHouse_System\.worktrees\feature-cuong-responsive-warehouse-admin" -b feature/cuong-responsive-warehouse-admin main
```

Expected: four branches point to the same Foundation merge commit.

- [ ] **Step 3: Confirm CSS ownership is disjoint**

```powershell
Get-Item "D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog\client\src\styles\modules\catalog.css"
Get-Item "D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog\client\src\styles\modules\admin-catalog.css"
Get-Item "D:\WW\GreenHouse_System\.worktrees\feature-huy-responsive-customer\client\src\styles\modules\customer-purchase.css"
Get-Item "D:\WW\GreenHouse_System\.worktrees\feature-nhat-responsive-staff\client\src\styles\modules\staff.css"
Get-Item "D:\WW\GreenHouse_System\.worktrees\feature-cuong-responsive-warehouse-admin\client\src\styles\modules\warehouse-admin.css"
```

Expected: all files exist from Foundation. No module agent needs to edit `main.jsx`, `styles.css`, Header, Footer, InternalTopbar, Sidebar or App layouts.

### Task 4: Dispatch and monitor the four parallel implementations

**Plans:**
- Chung: `2026-07-22-responsive-catalog.md`
- Huy: `2026-07-22-responsive-customer-purchase.md`
- Nhật: `2026-07-22-responsive-staff-operations.md`
- Cường: `2026-07-22-responsive-warehouse-admin.md`

- [ ] **Step 1: Dispatch one agent per worktree**

Use `superpowers:subagent-driven-development`. Each agent receives only its plan, absolute worktree path, exact Git identity and instruction not to edit shared shell/global files.

Identities:

```text
Phạm Thành Chung <chungthanhpham2112@gmail.com>
Nguyễn Quang Huy <quanghuyn267@gmail.com>
Nguyễn Hữu Anh Nhật <nguyenhuuanhnhat2k3@gmail.com>
Lê Vũ Cường <levucuong0319@gmail.com>
```

- [ ] **Step 2: Require a red-green-commit checkpoint for every plan task**

Each agent reports:

```text
Failing test command and expected failure.
Minimal implementation diff.
Passing targeted test command.
Commit hash and author identity.
Files changed.
```

- [ ] **Step 3: Monitor without moving code between worktrees**

Run periodically from the main repository:

```powershell
git worktree list
git log -1 --format="%h %an <%ae> %s" feature/chung-responsive-catalog
git log -1 --format="%h %an <%ae> %s" feature/huy-responsive-customer
git log -1 --format="%h %an <%ae> %s" feature/nhat-responsive-staff
git log -1 --format="%h %an <%ae> %s" feature/cuong-responsive-warehouse-admin
```

Expected: each branch advances only through its assigned worktree and identity.

### Task 5: Review and merge every module branch

**Reviewer identity:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`

- [ ] **Step 1: Verify each branch is scoped before review**

```powershell
git diff --name-only main...feature/chung-responsive-catalog
git diff --name-only main...feature/huy-responsive-customer
git diff --name-only main...feature/nhat-responsive-staff
git diff --name-only main...feature/cuong-responsive-warehouse-admin
```

Expected ownership:

```text
Chung: catalog/product/admin product-category pages, their tests, catalog/admin-catalog.css.
Huy: P13-P18 customer pages/tests, customer-purchase.css.
Nhật: P19/P21-P28 pages/tests, staff.css; no supportService contract changes.
Cường: P20/P29-P37/P41-P42 pages/tests, supportService/tests, warehouse-admin.css.
```

- [ ] **Step 2: Run each branch's targeted tests and build in its worktree**

Use the exact commands in the corresponding plan. For every branch, the final command is:

```powershell
npm test
npm run build
```

Expected: all client tests pass and build exits 0.

- [ ] **Step 3: Review prohibited behavior**

Reject a branch if it introduces any of:

```text
Mock product/order/KPI/user data in runtime UI.
Wishlist, fake payment provider, automatic pre-inspection refund.
Cross-role menu or storefront footer in internal screens.
Category/Product delete without API support.
New backend route, schema or state solely to match Stitch.
Remote lh3 image dependency or committed Stitch export.
```

- [ ] **Step 4: Merge accepted branches one at a time with no fast-forward**

```powershell
git switch main
git merge --no-ff feature/chung-responsive-catalog -m "merge: integrate responsive catalog frontend"
git merge --no-ff feature/huy-responsive-customer -m "merge: integrate responsive customer frontend"
git merge --no-ff feature/nhat-responsive-staff -m "merge: integrate responsive staff frontend"
git merge --no-ff feature/cuong-responsive-warehouse-admin -m "merge: integrate responsive warehouse admin frontend"
```

Expected: four explicit merge commits. Resolve no conflict by accepting one side wholesale; any conflict is reviewed against the spec and retested.

- [ ] **Step 5: Push main after all accepted merges**

```powershell
git push origin main
```

Expected: push succeeds without force.

### Task 6: Run full integration regression

**Files:**
- Verify all files under `client/src/`
- Verify API contract through existing server tests only; do not change backend for visual parity

- [ ] **Step 1: Run all client tests**

```powershell
Set-Location "D:\WW\GreenHouse_System\client"
npm test
```

Expected: every client test passes.

- [ ] **Step 2: Run the production build**

```powershell
npm run build
```

Expected: Vite build exits 0 with no unresolved asset or import.

- [ ] **Step 3: Run all server tests as a contract regression**

```powershell
Set-Location "D:\WW\GreenHouse_System\server"
npm test
```

Expected: all server tests pass; no backend file was changed by the frontend redesign branches.

- [ ] **Step 4: Check Git scope and whitespace**

```powershell
Set-Location "D:\WW\GreenHouse_System"
git diff origin/main...main --check
git status --short --branch
```

Expected: whitespace check clean. Only the user's pre-existing untracked design/assets/script may remain.

### Task 7: Perform responsive visual and role QA

**Viewports:** 390px, 768px, 1024px, 1440px.

- [ ] **Step 1: Start the client and API using project scripts**

```powershell
Set-Location "D:\WW\GreenHouse_System\server"
npm run dev
```

In a second terminal:

```powershell
Set-Location "D:\WW\GreenHouse_System\client"
npm run dev
```

Expected: API and Vite development servers start without startup errors.

- [ ] **Step 2: Verify storefront shells**

At all four viewports, check:

```text
Guest Header has public nav/search/login/register only.
Customer Header has cart/bell/avatar and usable mobile drawer.
Footer is identical across Public/Customer pages and absent internally.
P01 data displays API product name/price without mock override.
P04 About body remains visually intact.
```

- [ ] **Step 3: Verify all role shells and representative workflows**

Check:

```text
Customer: P13 Cart, P14 Checkout, P16 conditional actions, P19 history, P20 support.
Staff: P21 Dashboard, P22 queue, P23 detail, P26 refund state, P28 support response.
Warehouse: P29 Dashboard, P30 inventory, P32 export queue, P36 inspection.
Admin: P37 Dashboard, P38 product, P39 audit, P40 category, P42 three canonical settings.
```

Expected: no horizontal clipping, hidden primary action, wrong role navigation, console error or asset 404.

- [ ] **Step 4: Verify accessibility interactions**

Keyboard-test Header drawer, avatar menu, notification dropdown, internal sidebar drawer, forms and modal confirmations. Confirm Escape closes overlays, focus returns to trigger, visible focus remains and reduced-motion avoids nonessential animation.

Expected: every interactive control is reachable and operable without a pointer.

### Task 8: Clean up merged module worktrees and branches

- [ ] **Step 1: Confirm every worktree is clean**

```powershell
git -C "D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog" status --porcelain
git -C "D:\WW\GreenHouse_System\.worktrees\feature-huy-responsive-customer" status --porcelain
git -C "D:\WW\GreenHouse_System\.worktrees\feature-nhat-responsive-staff" status --porcelain
git -C "D:\WW\GreenHouse_System\.worktrees\feature-cuong-responsive-warehouse-admin" status --porcelain
```

Expected: all four commands return no output.

- [ ] **Step 2: Remove the merged worktrees**

```powershell
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-chung-responsive-catalog"
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-huy-responsive-customer"
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-nhat-responsive-staff"
git worktree remove "D:\WW\GreenHouse_System\.worktrees\feature-cuong-responsive-warehouse-admin"
```

Expected: only the main worktree remains for these branches.

- [ ] **Step 3: Delete the merged local feature branches**

```powershell
git branch -d feature/chung-responsive-catalog
git branch -d feature/huy-responsive-customer
git branch -d feature/nhat-responsive-staff
git branch -d feature/cuong-responsive-warehouse-admin
git worktree prune
```

Expected: all four branches delete with the safe `-d` flag.

- [ ] **Step 4: Record final evidence**

```powershell
git log --oneline --decorate -12
git status --short --branch
```

Expected: `main` tracks `origin/main`; merge commits and owner commits are visible; design exports and unrelated local inputs remain uncommitted.
