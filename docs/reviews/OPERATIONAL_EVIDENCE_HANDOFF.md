# Operational Evidence Upload Handoff

- Owner: Nguyễn Ngọc Thành
- Branch: `feature/thanh-operational-evidence`
- Upload roles: Staff, WarehouseManager
- Read roles: Staff, WarehouseManager, Admin
- Limits: 5 images, 5 MB per image, 20 MiB aggregate
- Accepted formats: JPEG, PNG, WebP verified by content signature
- Storage: runtime-only `server/uploads/operational-evidence`; no upload is committed
- Production gate: configure malware scanner and `OPERATIONAL_EVIDENCE_CLAIM_SECRET`

Consumers submit the signed URL returned by `operationalEvidenceService` and
render it through `resolveMediaUrl`. Reusable UI is
`OperationalEvidenceUploader.jsx`.
