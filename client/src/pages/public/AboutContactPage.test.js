import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const aboutPage = readFileSync(join(process.cwd(), 'src/pages/public/AboutPage.jsx'), 'utf8');
const contactPage = readFileSync(join(process.cwd(), 'src/pages/public/ContactPage.jsx'), 'utf8');

describe('about page storefront design contract', () => {
  it('matches the Vietnamese brand story layout from the approved reference', () => {
    assert.match(aboutPage, /about-story-page/);
    assert.match(aboutPage, /about-hero-grid/);
    assert.match(aboutPage, /Câu chuyện về GreenHome Kitchen/);
    assert.match(aboutPage, /Sứ mệnh của chúng tôi/);
    assert.match(aboutPage, /<span className="section-kicker" aria-hidden="true" \/>/);
    assert.doesNotMatch(aboutPage, /<span className="section-kicker">Sứ mệnh<\/span>/);
    assert.match(aboutPage, /Giá trị cốt lõi/);
    assert.match(aboutPage, /Chất lượng tuyển chọn/);
    assert.match(aboutPage, /Minh bạch & Tin cậy/);
    assert.match(aboutPage, /Bền vững/);
    assert.doesNotMatch(aboutPage, /Staff|Warehouse|workflow|demo|About Us/);
  });
});

describe('contact page storefront design contract', () => {
  it('matches the Vietnamese contact layout with form, contact info, map, and FAQ CTA', () => {
    assert.match(contactPage, /contact-story-page/);
    assert.match(contactPage, /Liên hệ với chúng tôi/);
    assert.match(contactPage, /Thông tin liên hệ/);
    assert.match(contactPage, /Gửi tin nhắn/);
    assert.match(contactPage, /Bạn có câu hỏi nhanh/);
    assert.match(contactPage, /https:\/\/maps\.app\.goo\.gl\/DUDu37Cr5h13RsqFA/);
    assert.match(contactPage, /contact-map-panel/);
    assert.match(contactPage, /Vị trí GreenHome Kitchen tại Hà Nội/);
    assert.match(contactPage, /href="#contact-form"/);
    assert.doesNotMatch(contactPage, /to="\/support"/);
    assert.doesNotMatch(contactPage, /Support Request|Store Locator|Contact Us/);
  });

  it('submits through the contact API and only reports success after it resolves', () => {
    assert.match(contactPage, /import\s+\{\s*contactService\s*\}\s+from\s+'..\/..\/services\/contactService\.js'/);
    assert.match(contactPage, /async function handleSubmit/);
    assert.match(contactPage, /await contactService\.submit\(form\)/);
    assert.match(contactPage, /id="contact-form"/);
    assert.match(contactPage, /disabled=\{submitting\}/);
    assert.match(contactPage, /contact-error/);
  });
});
