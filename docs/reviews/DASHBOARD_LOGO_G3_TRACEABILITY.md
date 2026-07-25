# Dashboard Logo — G3 Traceability

Owner: Nguyễn Ngọc Thành

| Requirement | Implementation | Evidence |
|---|---|---|
| Use the approved GreenHome mark | `InternalTopbar.jsx` uses `/assets/icon/favicon.png` | `Layout.test.js` |
| Keep the mark visible on mobile | responsive `internal-brand-logo` sizing in `shared-shell.css` | `Layout.test.js`, production build |
| Avoid placeholder/generated branding | removes the `⌁` glyph and reuses the tracked local asset | source contract test |
