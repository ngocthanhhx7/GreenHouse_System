import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const home = readFileSync(
  join(process.cwd(), "src/pages/public/HomePage.jsx"),
  "utf8",
);
const { getHomeProductDisplay } = await import("./homeProductDisplay.js").catch(
  () => ({}),
);

describe("home page premium commerce design contract", () => {
  it("uses Vietnamese commerce-first content without demo/internal workflow copy", () => {
    assert.match(home, /Căn bếp xanh/);
    assert.match(home, /Mua sắm ngay/);
    assert.match(home, /Chọn nhanh theo nhu cầu căn bếp/);
    assert.match(home, /Lựa chọn được quan tâm trong tuần/);
    assert.match(home, /Vì sao chọn GreenHome/);
    assert.match(home, /Niềm tin đến từ trải nghiệm mua hàng rõ ràng/);
    assert.match(home, /Sẵn sàng nâng cấp căn bếp của bạn/);
    assert.doesNotMatch(
      home,
      /Ready for demo|Business workflow preview|Staff Processing|Warehouse|Shop Now|Start Shopping|Category Showcase|Kitchen Collections|Newsletter/,
    );
  });

  it("uses the uploaded visual assets and premium storefront sections from the reference", () => {
    assert.match(home, /\/assets\/background\/cookware\.png/);
    assert.match(home, /\/assets\/background\/kitchen_tools\.png/);
    assert.match(home, /\/assets\/background\/tableware\.png/);
    assert.match(home, /\/assets\/background\/smart_storage\.png/);
    assert.match(home, /Ưu đãi hôm nay/);
    assert.match(home, /Chọn sản phẩm/);
    assert.match(home, /Đăng nhập/);
    assert.match(home, /Đặt hàng & thanh toán/);
    assert.match(home, /Đóng gói & giao hàng/);
    assert.match(home, /Theo dõi & hậu mãi/);
    assert.match(home, /id="quy-trinh-mua-hang"/);
    assert.doesNotMatch(home, /Bồi đắp niềm tin/);
  });

  it("keeps GSAP scoped but removes heavy looping and tilt animation patterns", () => {
    assert.match(home, /useGSAP/);
    assert.match(home, /ScrollTrigger/);
    assert.match(home, /prefers-reduced-motion/);
    assert.match(home, /\/assets\/banner\/banner\.png/);
    assert.doesNotMatch(home, /repeat:\s*-1/);
    assert.doesNotMatch(home, /handleMouseMove/);
    assert.doesNotMatch(home, /ambient-blob/);
  });

  it("wires product tiles to the catalog display adapter without local overrides", () => {
    assert.doesNotMatch(home, /productShowcase/);
    assert.match(home, /getHomeProductDisplay\(product\)/);
    assert.match(home, /alt=\{display\.name\}/);
    assert.match(home, /<strong>\{display\.name\}<\/strong>/);
    assert.match(home, /formatCurrency\(display\.price\)/);
  });

  it("preserves the name and price received from the public catalog at runtime", () => {
    assert.equal(typeof getHomeProductDisplay, "function");
    assert.deepEqual(
      getHomeProductDisplay({
        name: "Stackable Food Container Set",
        price: 329000,
      }),
      { name: "Stackable Food Container Set", price: 329000 },
    );
  });
});
