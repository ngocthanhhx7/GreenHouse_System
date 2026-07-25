# Operational Evidence Upload Release Audit

## Security boundary

- Anonymous and Customer actors cannot call the endpoint.
- Admin may review evidence but cannot upload through the operational endpoint.
- UUID filenames, MIME/content verification, malware scan and signed claims are required.
- Responses are private/no-store with `nosniff` and sandbox CSP.
- Production fails closed without the claim secret or malware scanner.

## Verification

Focused server evidence: `16/16`. Focused client evidence: `2/2`.
Full regression/build evidence is recorded by the final integration owner.
Runtime evidence files and secrets are intentionally excluded from Git.
