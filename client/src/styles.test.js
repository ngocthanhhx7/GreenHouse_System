import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
const main = readFileSync(join(process.cwd(), 'src/main.jsx'), 'utf8');
const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const base = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
const index = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const provenance = readFileSync(join(process.cwd(), 'public/fonts/PROVENANCE.md'), 'utf8');

const readCssTree = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return readCssTree(path);
  return entry.name.endsWith('.css') ? readFileSync(path, 'utf8') : [];
});

const loadedCss = readCssTree(join(process.cwd(), 'src')).join('\n');
const requiredVietnameseCodePoints = [
  [0x20, 0x7e],
  [0xc0, 0xff],
  [0x102, 0x103],
  [0x110, 0x111],
  [0x128, 0x129],
  [0x168, 0x169],
  [0x1a0, 0x1a1],
  [0x1af, 0x1b0],
  [0x1ea0, 0x1ef9],
].flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, offset) => start + offset));

const relativeLuminance = (hex) => {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};

const contrastRatio = (first, second) => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
};

const tokenHex = (name) => tokens.match(new RegExp(`${name}:\\s*(#[0-9A-F]{6})`, 'i'))?.[1];

describe('responsive style foundation', () => {
  it('loads the canonical cascade immediately after legacy styles', () => {
    assert.match(
      main,
      /import '\.\/styles\.css';\s*import '\.\/styles\/tokens\.css';\s*import '\.\/styles\/base\.css';\s*import '\.\/styles\/shared-shell\.css';\s*import '\.\/styles\/storefront\.css';\s*import '\.\/styles\/operations\.css';/
    );
  });

  it('defines local GreenHouse tokens without legacy forest', () => {
    assert.match(tokens, /--gh-forest:\s*#173E31/);
    assert.match(tokens, /--gh-paper:\s*#FFFDF8/);
    assert.match(tokens, /--gh-font-display:\s*'Fraunces'/);
    assert.match(tokens, /--gh-font-ui:\s*'Be Vietnam Pro'/);
    assert.doesNotMatch(tokens, /#00281C/);
  });

  it('contains no remote font import or URL anywhere in the loaded CSS', () => {
    assert.doesNotMatch(loadedCss, /fonts\.(?:googleapis|gstatic)\.com/i);
    assert.doesNotMatch(loadedCss, /@import\s+(?:url\()?\s*['"]?https?:\/\//i);
    assert.doesNotMatch(loadedCss, /@font-face[\s\S]*?src:\s*url\(\s*['"]?https?:\/\//i);
    assert.doesNotMatch(loadedCss, /Outfit/i);
  });

  it('sets the canonical page and heading typography', () => {
    const bodyBlock = base.match(/body\s*\{[^}]+\}/)?.[0] || '';
    const headingBlock = base.match(/h1,[\s\S]*?\.brand-name\s*\{[^}]+\}/)?.[0] || '';

    assert.match(bodyBlock, /background:\s*var\(--gh-ivory\)/);
    assert.match(bodyBlock, /color:\s*var\(--gh-ink\)/);
    assert.match(bodyBlock, /font-family:\s*var\(--gh-font-ui\)/);
    assert.match(bodyBlock, /line-height:\s*1\.5/);
    assert.match(headingBlock, /color:\s*var\(--gh-forest-deep\)/);
    assert.match(headingBlock, /font-family:\s*var\(--gh-font-display\)/);
  });

  it('keeps dark-surface headings at accessible contrast', () => {
    const footerHeadingBlock = base.match(/\.site-footer h1,[\s\S]*?\.site-footer \.brand-name\s*\{[^}]+\}/)?.[0] || '';
    const ctaHeadingBlock = styles.match(/\.premium-final-cta h2\s*\{[^}]+\}/g)?.at(-1) || '';

    assert.match(footerHeadingBlock, /color:\s*var\(--gh-paper\)/);
    assert.match(ctaHeadingBlock, /color:\s*#ffffff/i);
    assert.ok(contrastRatio(tokenHex('--gh-paper'), '#064f3c') >= 4.5);
    assert.ok(contrastRatio('#ffffff', '#0d725c') >= 4.5);
  });

  it('uses a two-tone focus indicator with contrast on light and dark surfaces', () => {
    const focusBlock = base.match(/:focus-visible\s*\{[^}]+\}/)?.[0] || '';

    assert.match(focusBlock, /outline:\s*3px solid var\(--gh-gold\)/);
    assert.match(focusBlock, /outline-offset:\s*3px/);
    assert.match(focusBlock, /box-shadow:\s*0 0 0 3px var\(--gh-forest-deep\)/);
    assert.ok(contrastRatio(tokenHex('--gh-forest-deep'), tokenHex('--gh-ivory')) >= 3);
    assert.ok(contrastRatio(tokenHex('--gh-gold'), '#064f3c') >= 3);
  });

  it('registers the full supported weight range for both variable fonts', () => {
    const frauncesFace = tokens.match(/@font-face\s*\{[^}]*font-family:\s*'Fraunces';[^}]+\}/)?.[0] || '';
    const uiFace = tokens.match(/@font-face\s*\{[^}]*font-family:\s*'Be Vietnam Pro';[^}]+\}/)?.[0] || '';

    assert.match(frauncesFace, /font-weight:\s*100 900/);
    assert.match(uiFace, /font-weight:\s*100 900/);
  });

  it('preloads only the canonical local font files', () => {
    const preloads = [...index.matchAll(/<link\s+rel="preload"[^>]+>/g)].map(([tag]) => tag);
    const hrefs = preloads.map((tag) => tag.match(/href="([^"]+)"/)?.[1]).sort();

    assert.deepEqual(hrefs, [
      '/fonts/be-vietnam-pro-latin-vietnamese.woff2',
      '/fonts/fraunces-latin-vietnamese.woff2',
    ]);
    for (const preload of preloads) {
      assert.match(preload, /\sas="font"/);
      assert.match(preload, /\stype="font\/woff2"/);
      assert.match(preload, /\scrossorigin(?:\s|\/|>)/);
    }
  });

  it('pins the complete local font artifacts by hash', () => {
    const expectedFonts = new Map([
      ['fraunces-latin-vietnamese.woff2', '0928daeeeafa6ff0e512e333651a2a8a716dca56578dc7355460f0a812bc2415'],
      ['be-vietnam-pro-latin-vietnamese.woff2', '7eac7000f8156452c799ba630a0b71153a9cd5001a95c56dd15468670e247d0a'],
    ]);

    for (const [fileName, expectedHash] of expectedFonts) {
      const path = join(process.cwd(), 'public/fonts', fileName);
      assert.ok(existsSync(path), `${fileName} must be self-hosted`);
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      assert.equal(hash, expectedHash, `${fileName} must match the glyph-verified artifact`);
    }

    assert.equal(existsSync(join(process.cwd(), 'public/fonts/outfit-latin-vietnamese.woff2')), false);
  });

  it('covers ordinary Latin and Vietnamese glyphs in both local fonts', async () => {
    const fontkit = await import('fontkit').catch(() => null);
    assert.ok(fontkit, 'fontkit must be installed for repeatable glyph verification');

    for (const fileName of ['fraunces-latin-vietnamese.woff2', 'be-vietnam-pro-latin-vietnamese.woff2']) {
      const font = fontkit.create(readFileSync(join(process.cwd(), 'public/fonts', fileName)));
      const missing = requiredVietnameseCodePoints.filter((codePoint) => !font.hasGlyphForCodePoint(codePoint));
      assert.deepEqual(missing, [], `${fileName} is missing required Latin/Vietnamese glyphs`);
      assert.equal(font.variationAxes.wght?.min, 100, `${fileName} must support weight 100`);
      assert.equal(font.variationAxes.wght?.max, 900, `${fileName} must support weight 900`);
    }
  });

  it('records official sources, conversion, licenses, and the UI-font decision', () => {
    const plan = readFileSync(join(process.cwd(), '../docs/member-plans/01_NGUYEN_NGOC_THANH_PLAN.md'), 'utf8');

    assert.match(provenance, /Copyright 2018 The Fraunces Project Authors/);
    assert.match(provenance, /Copyright 2021 The Be Vietnam Pro Project Authors/);
    assert.match(provenance, /ttf2woff2@8\.0\.1/);
    assert.match(provenance, /804e62d81abbbcdcce5686069c69b41b8c245192/);
    assert.match(provenance, /2E7F074803B2252224A55EBC3112D19E2E844B5EDEE4DCF1E91E254F78E69F4C/);
    assert.doesNotMatch(provenance, /Outfit Project Authors/);
    assert.match(plan, /Design DNA Decision[^\n]*2026-07-22/);
    assert.match(plan, /Fraunces[^\n]+Be Vietnam Pro/);
  });
});

describe('admin dashboard styles', () => {
  it('defines stable metric grid and metric box styles', () => {
    assert.match(styles, /\.metrics-grid\s*\{/);
    assert.match(styles, /\.metric-box\s*\{/);
    assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
  });
});

describe('premium storefront CTA styles', () => {
  it('keeps the Home CTA visually separate from the footer without letting the footer cover it', () => {
    const ctaBlock = styles.match(/\.premium-final-cta\s*\{[^}]+\}/)?.[0] || '';
    const footerBlock = styles.match(/\.site-footer\s*\{[^}]+\}/g)?.at(-1) || '';
    const homeBlock = styles.match(/\.home-premium\s*\{[^}]+\}/)?.[0] || '';

    assert.match(ctaBlock, /background:\s*#0d725c/);
    assert.doesNotMatch(ctaBlock, /background:\s*#064f3c/);
    assert.match(ctaBlock, /margin:\s*34px auto 0/);
    assert.match(ctaBlock, /position:\s*relative/);
    assert.match(ctaBlock, /z-index:\s*2/);
    assert.match(footerBlock, /background:\s*#064f3c/);
    assert.match(footerBlock, /padding-top:\s*64px/);
  });
});

describe('Vietnamese storefront typography', () => {
  it('uses a Vietnamese-safe heading stack for About and Contact pages', () => {
    const headingBlock = styles.match(/\.about-story-page h1,[\s\S]*?\.contact-story-page h2\s*\{[^}]+\}/)?.[0] || '';

    assert.match(headingBlock, /font-family:\s*var\(--font-vietnamese-display\)/);
    assert.doesNotMatch(headingBlock, /Georgia|Times New Roman/);
  });
});
