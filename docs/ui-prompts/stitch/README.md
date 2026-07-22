# GreenHome Kitchen: Stitch prompt pack

This folder contains the complete prompt sequence for redesigning all 42 current frontend routes in desktop and mobile form.

## Recommended execution order

1. Create **one new Stitch project** named `GreenHome Kitchen Responsive UI`.
2. Attach current screenshots of Home desktop/mobile and About desktop/mobile as visual references when available.
3. Paste `MASTER DESIGN DNA` from `01-master-design-and-shell.md` once.
4. Paste `SHARED RESPONSIVE SHELL` once and keep the approved shell in the same Stitch project.
5. Run P01 through P42 **one prompt at a time**. Do not combine the complete pack into one generation.
6. For every prompt, verify that Stitch returned both required frames and preserved Vietnamese copy.
7. Export each frame as PNG at 1× or provide the Stitch project link, then send the results back to Codex using the naming convention below.

## Frame naming convention

Use:

```text
GH-P<NN>-<ScreenName>-Desktop
GH-P<NN>-<ScreenName>-Mobile
```

Example:

```text
GH-P13-Cart-Desktop
GH-P13-Cart-Mobile
```

State variants append a state name:

```text
GH-P13-Cart-Mobile-Empty
GH-P21-StaffDashboard-Desktop-PartialError
```

## Files and ranges

| File | Prompt range | Scope |
|---|---:|---|
| `01-master-design-and-shell.md` | Foundation | Design tokens and responsive shells |
| `02-public-auth-account.md` | P01–P12 | Public, authentication, profile, notifications |
| `03-customer-staff.md` | P13–P28 | Customer commerce and Staff operations |
| `04-warehouse-admin.md` | P29–P42 | Warehouse and Admin operations |

## Route index

| ID | Route | Screen |
|---:|---|---|
| P01 | `/` | Home |
| P02 | `/products` | Product listing |
| P03 | `/products/:id` | Product detail |
| P04 | `/about` | About |
| P05 | `/contact` | Contact |
| P06 | `/login` | Login |
| P07 | `/register` | Register |
| P08 | `/unauthorized` | Authentication required |
| P09 | `/forbidden` | Access forbidden |
| P10 | `/profile` | Profile and address book |
| P11 | `/notifications` | Notification inbox |
| P12 | `/notifications/:id` | Notification detail |
| P13 | `/cart` | Cart |
| P14 | `/checkout` | Checkout |
| P15 | `/orders` | Customer order history |
| P16 | `/orders/:id` | Customer order detail |
| P17 | `/orders/:id/payment` | Payment action |
| P18 | `/payments/result/:id` | Payment result |
| P19 | `/return-refunds` | Customer return/refund requests |
| P20 | `/support` | Customer support requests |
| P21 | `/staff` | Staff dashboard |
| P22 | `/staff/orders` | Staff order queue |
| P23 | `/staff/orders/:id` | Staff order detail |
| P24 | `/staff/orders/:id/invoice` | Invoice print |
| P25 | `/staff/return-refunds` | Staff return/refund queue |
| P26 | `/staff/return-refunds/:id` | Staff return/refund detail |
| P27 | `/staff/support-requests` | Staff support queue |
| P28 | `/staff/support-requests/:id` | Staff support detail |
| P29 | `/warehouse` | Warehouse dashboard |
| P30 | `/warehouse/inventory` | Inventory list |
| P31 | `/warehouse/low-stock` | Low-stock alerts |
| P32 | `/warehouse/stock-exports` | Stock export queue |
| P33 | `/warehouse/stock-exports/:id` | Stock export detail |
| P34 | `/warehouse/replenishments` | Warehouse replenishment |
| P35 | `/warehouse/return-refunds` | Warehouse return queue |
| P36 | `/warehouse/return-refunds/:id` | Return inspection |
| P37 | `/admin` | Admin dashboard |
| P38 | `/admin/products` | Product management |
| P39 | `/admin/audit-logs` | Audit logs |
| P40 | `/admin/categories` | Category management |
| P41 | `/admin/replenishments` | Replenishment approvals |
| P42 | `/admin/settings` | System settings |

## What to send back to Codex

- The Stitch project link if sharing is enabled.
- All exported desktop and mobile PNG files.
- Any alternate state frames Stitch generated.
- A note for any frame where Stitch changed a field, action, status, or Vietnamese label.
- Font and image assets suggested by Stitch, including license/source information if external.

Do not send generated frontend code yet. The visual set will be reviewed against the current business logic before implementation.
