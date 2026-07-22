# Local font provenance

The design foundation self-hosts its fonts under `/fonts`; it makes no runtime font request. Both sources were downloaded from the official Google Fonts repository at commit `684b69db51d59a3137ec0152fa3a3afc6f1b3814` on 2026-07-22 and are licensed under the bundled [SIL Open Font License 1.1](OFL-1.1.txt).

## Copyright notices

- Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
- Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro)

## Artifacts

| Local file | Official source | Source SHA-256 | Local SHA-256 |
| --- | --- | --- | --- |
| `fraunces-latin-vietnamese.woff2` | [`ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`](https://github.com/google/fonts/blob/684b69db51d59a3137ec0152fa3a3afc6f1b3814/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf) | `177FF6C0F14E5550A3C624247CD1189611D4EB65D000B14944C63D967958ABBB` | `0928DAEEEAFA6FF0E512E333651A2A8A716DCA56578DC7355460F0A812BC2415` |
| `be-vietnam-pro-latin-vietnamese.woff2` | [`ofl/bevietnampro/BeVietnamPro-Regular.ttf`](https://github.com/google/fonts/blob/684b69db51d59a3137ec0152fa3a3afc6f1b3814/ofl/bevietnampro/BeVietnamPro-Regular.ttf) | `CD1EF6E9D7DB28AD5CDB88A65CCBE693870E60D340B791F349D248342B4FE4C3` | `44A0492E5DED22BB3AFB725AE85FE87FFCBAAD1B07A0B60270D0170528B3A567` |

## Deterministic conversion and coverage

Each official TTF was converted, without subsetting or other modification, using `ttf2woff2@8.0.1`:

```text
npx --yes ttf2woff2@8.0.1 < SOURCE.ttf > TARGET.woff2
```

`node --test src/styles.test.js` uses `fontkit@2.0.4` to parse each committed WOFF2 and verify 261 required code points: printable Basic Latin (`U+0020-U+007E`), Latin-1 letters (`U+00C0-U+00FF`), Vietnamese-specific letters (`U+0102-U+0103`, `U+0110-U+0111`, `U+0128-U+0129`, `U+0168-U+0169`, `U+01A0-U+01A1`, `U+01AF-U+01B0`), and all Vietnamese precomposed characters (`U+1EA0-U+1EF9`). The same test pins both local SHA-256 hashes.
