# Operational Evidence Upload — G3 Traceability

Owner: Nguyễn Ngọc Thành

| Requirement | Implementation | Test evidence |
|---|---|---|
| Staff/Warehouse upload internal evidence | `upload.routes.js`, `upload.middleware.js`, `upload.controller.js` | `upload.routes.test.js`, `upload.service.test.js` |
| Maximum 5 JPEG/PNG/WebP images, 5 MB each | Multer boundary and reusable client uploader | upload and client service tests |
| Protected read for Staff/Warehouse/Admin | signed `/api/operational-evidence/:filename` URL and exact RBAC | route and claim tests |
| Tamper resistance and production secret | `operationalEvidenceClaim.js` | `operationalEvidenceClaim.test.js` |
| Malware scan before persistence | shared protected-evidence scanner | `upload.service.test.js` |

COD, Inventory and Replenishment owners remain responsible for persisting and
validating the signed URLs in their own commands.
