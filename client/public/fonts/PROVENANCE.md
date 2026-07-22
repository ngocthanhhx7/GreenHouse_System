# Local font provenance

The design foundation self-hosts its fonts under `/fonts`; it makes no runtime font request. Both sources are official OFL releases downloaded on 2026-07-22 and licensed under the bundled [SIL Open Font License 1.1](OFL-1.1.txt).

## Copyright notices

- Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
- Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro)

## Artifacts

| Local file | Official source | Source SHA-256 | Local SHA-256 |
| --- | --- | --- | --- |
| `fraunces-latin-vietnamese.woff2` | Google Fonts commit `684b69db51d59a3137ec0152fa3a3afc6f1b3814`: [`ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`](https://github.com/google/fonts/blob/684b69db51d59a3137ec0152fa3a3afc6f1b3814/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf) | `177FF6C0F14E5550A3C624247CD1189611D4EB65D000B14944C63D967958ABBB` | `0928DAEEEAFA6FF0E512E333651A2A8A716DCA56578DC7355460F0A812BC2415` |
| `be-vietnam-pro-latin-vietnamese.woff2` | Be Vietnam Pro commit `804e62d81abbbcdcce5686069c69b41b8c245192`: [`fonts/variable/BeVietnamPro[wght].ttf`](https://github.com/bettergui/BeVietnamPro/blob/804e62d81abbbcdcce5686069c69b41b8c245192/fonts/variable/BeVietnamPro%5Bwght%5D.ttf) | `2E7F074803B2252224A55EBC3112D19E2E844B5EDEE4DCF1E91E254F78E69F4C` | `7EAC7000F8156452C799BA630A0B71153A9CD5001A95C56DD15468670E247D0A` |

## Deterministic conversion and verification

Each official variable TTF was converted, without subsetting or other modification, using `ttf2woff2@8.0.1`:

```text
npx --yes ttf2woff2@8.0.1 < SOURCE.ttf > TARGET.woff2
```

`node --test src/styles.test.js` uses `fontkit@2.0.4` to parse each committed WOFF2 and verify:

- 261 required code points: printable Basic Latin (`U+0020-U+007E`), Latin-1 letters (`U+00C0-U+00FF`), Vietnamese-specific letters (`U+0102-U+0103`, `U+0110-U+0111`, `U+0128-U+0129`, `U+0168-U+0169`, `U+01A0-U+01A1`, `U+01AF-U+01B0`), and all Vietnamese precomposed characters (`U+1EA0-U+1EF9`);
- a `wght` variation axis spanning 100 through 900 in both files;
- both local SHA-256 hashes and the exact two preload tags used by `index.html`.
