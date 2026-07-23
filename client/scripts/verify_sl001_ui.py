import json
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:5173"
CLAIMED_UPLOAD_URL = "/api/return-refunds/evidence/22222222-2222-4222-8222-222222222222.png?size=8&claim=" + "a" * 64


def envelope(data):
    return {"success": True, "message": "OK", "data": data, "errors": []}


def fulfill(route, data):
    route.fulfill(status=200, content_type="application/json", body=json.dumps(envelope(data), ensure_ascii=False))


def actor_context(browser, role, handler):
    context = browser.new_context()
    context.add_init_script("window.localStorage.setItem('greenhome_token', 'sl001-ui-token')")

    def route_api(route):
      path = urlparse(route.request.url).path
      if path == "/api/auth/me":
          fulfill(route, {"user": {"id": f"{role.lower()}-1", "fullName": role, "email": f"{role.lower()}@example.test", "role": role}})
          return
      if path.startswith("/api/notifications"):
          fulfill(route, {"items": [], "total": 0, "unreadCount": 0})
          return
      if handler(route, path):
          return
      fulfill(route, {"items": [], "total": 0})

    context.route("**/api/**", route_api)
    return context


def base_request(status, destination=None):
    return {
        "id": "request-1",
        "orderId": "order-1",
        "orderCode": "GH-SL001-001",
        "requestCode": "RET-SL001-001",
        "customerId": "customer-1",
        "reason": "Sản phẩm bị hư hỏng",
        "evidenceImages": ["/api/return-refunds/evidence/11111111-1111-4111-8111-111111111111.png"],
        "status": status,
        "approvedAt": "2026-07-23T10:00:00.000Z",
        "shipByAt": "2026-07-26T10:00:00.000Z",
        "handoffAt": None,
        "handoffProofReference": "",
        "staffNote": "Đủ điều kiện trả hàng",
        "destination": destination,
        "details": [{"_id": "detail-1", "productId": "product-1", "productNameSnapshot": "Thớt tre", "quantity": 1, "subtotal": 120000}],
        "items": [],
        "order": {"id": "order-1", "orderCode": "GH-SL001-001", "orderStatus": "Delivered", "paymentStatus": "Paid", "paymentMethod": "ONLINE", "totalAmount": 120000, "currency": "VND"},
    }


def verify_customer(browser, console_errors):
    current_request = base_request("Approved")

    def handler(route, path):
        nonlocal current_request
        if path == "/api/orders/order-1" and route.request.method == "GET":
            fulfill(route, {
                "id": "order-1", "orderCode": "GH-SL001-001", "orderStatus": "Delivered",
                "paymentMethod": "ONLINE", "paymentStatus": "Paid", "totalAmount": 120000,
                "shippingAddress": "Hà Nội", "receiverName": "Khách hàng", "receiverPhone": "0900000000",
                "returnDeadlineAt": "2026-12-31T23:59:59.000Z",
                "details": [{"_id": "detail-1", "productNameSnapshot": "Thớt tre", "quantity": 1, "subtotal": 120000}],
            })
            return True
        if path == "/api/return-refunds/evidence" and route.request.method == "POST":
            fulfill(route, {"items": [{"url": CLAIMED_UPLOAD_URL}]})
            return True
        if path == "/api/orders/order-1/return-refund" and route.request.method == "POST":
            body = route.request.post_data_json
            assert body["reason"] == "Hàng bị nứt"
            assert body["evidenceImages"] == [CLAIMED_UPLOAD_URL]
            fulfill(route, base_request("New"))
            return True
        if path == "/api/return-refunds/my":
            fulfill(route, {"items": [current_request], "total": 1})
            return True
        if path == "/api/return-refunds/request-1/handoff-proof" and route.request.method == "POST":
            body = route.request.post_data_json
            assert body["proofReference"] == "HANDOFF-001"
            current_request = {**current_request, "handoffAt": "2026-07-23T11:00:00.000Z", "handoffProofReference": "HANDOFF-001"}
            fulfill(route, current_request)
            return True
        if path == "/api/return-refunds/request-1/destination" and route.request.method == "POST":
            body = route.request.post_data_json
            assert body["confirmed"] is True
            assert body["bankBin"] == "970422"
            assert "amount" not in body and "refundAmount" not in body
            current_request = {**current_request, "destination": {"id": "destination-1", "bankName": "Test Bank", "maskedAccountNumber": "****6789", "maskedAccountHolder": "N***** V** A**", "status": "Submitted"}}
            fulfill(route, current_request["destination"])
            return True
        return False

    context = actor_context(browser, "Customer", handler)
    page = context.new_page()
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{BASE_URL}/orders/order-1")
    page.wait_for_load_state("networkidle")
    assert page.get_by_role("heading", name="Yêu cầu đổi trả / hoàn tiền").is_visible(), f"Unexpected Customer page {page.url}; console={console_errors}: {page.locator('body').inner_text()}"
    assert page.locator("#returnEvidence").get_attribute("type") == "file"
    assert "Số tiền hoàn" not in page.locator("body").inner_text()
    page.locator("#returnReason").fill("Hàng bị nứt")
    page.locator("#returnEvidence").set_input_files({"name": "evidence.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\n"})
    page.get_by_role("button", name="Gửi yêu cầu").click()
    page.locator(".alert.alert-success").filter(has_text="Đã gửi yêu cầu đổi trả / hoàn tiền.").wait_for()

    page.goto(f"{BASE_URL}/return-refunds")
    page.wait_for_load_state("networkidle")
    assert page.get_by_text("Tôi đã kiểm tra thông tin và chịu trách nhiệm", exact=False).is_visible()
    assert "Số tiền hoàn" not in page.locator("body").inner_text()
    page.locator("#proof-request-1").fill("HANDOFF-001")
    page.locator("#handoff-request-1").fill("2026-07-23T11:00")
    page.get_by_role("button", name="Ghi nhận bàn giao").click()
    page.get_by_text("Đã ghi nhận bằng chứng bàn giao hàng.").wait_for()
    page.locator("#bank-request-1").fill("Test Bank")
    page.locator("#bin-request-1").fill("970422")
    page.locator("#account-request-1").fill("0123456789")
    page.locator("#holder-request-1").fill("Nguyen Van A")
    page.locator("#confirm-request-1").check()
    page.get_by_role("button", name="Gửi thông tin xác minh").click()
    page.get_by_text("Đã gửi thông tin nhận hoàn tiền để CSKH xác minh.").wait_for()
    context.close()


def verify_staff(browser, console_errors):
    current_request = base_request("Received", {
        "id": "destination-1", "bankName": "Test Bank", "maskedAccountNumber": "****6789",
        "maskedAccountHolder": "N***** V** A**", "accountNumber": "0123456789",
        "accountHolderName": "NGUYEN VAN A", "bankBin": "970422", "status": "Verified",
    })

    def handler(route, path):
        nonlocal current_request
        if path == "/api/staff/return-refunds/request-1" and route.request.method == "GET":
            fulfill(route, current_request)
            return True
        if path == "/api/staff/return-refunds/request-1/payos-payout" and route.request.method == "POST":
            body = route.request.post_data_json
            assert body["idempotencyKey"].startswith("payos:request-1:")
            assert "amount" not in body
            current_request = {
                **current_request,
                "payoutStatus": "Processing",
                "payoutEvidence": {"id": "payos-evidence-1", "method": "PAYOS", "status": "Processing"},
            }
            fulfill(route, {"status": "Processing", "request": current_request})
            return True
        if path == "/api/staff/return-refunds/request-1/payos-reconcile" and route.request.method == "POST":
            current_request = {
                **current_request,
                "status": "Completed",
                "payoutStatus": "Succeeded",
                "completedAt": "2026-07-23T12:00:00.000Z",
            }
            fulfill(route, {"status": "Succeeded", "request": current_request})
            return True
        if path == "/api/staff/return-refunds/request-1/payout-evidence" and route.request.method == "POST":
            body = route.request.post_data_json
            assert "amount" not in body and "refundAmount" not in body
            assert body["method"] == "MANUAL"
            assert body["status"] == "Succeeded"
            current_request = {**current_request, "status": "Completed", "completedAt": "2026-07-23T12:00:00.000Z"}
            fulfill(route, {"status": "Succeeded", "request": current_request})
            return True
        return False

    context = actor_context(browser, "Staff", handler)
    page = context.new_page()
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{BASE_URL}/staff/return-refunds/request-1")
    page.wait_for_load_state("networkidle")
    body_text = page.locator("body").inner_text()
    assert "0123456789" in body_text and "NGUYEN VAN A" in body_text
    assert "Số tiền hoàn" not in body_text
    assert page.locator("input#refundAmount").count() == 0
    page.get_by_role("button", name="Gửi lệnh chi PayOS").click()
    page.get_by_text("Đã gửi lệnh chi PayOS", exact=False).wait_for()
    page.get_by_role("button", name="Đối soát lại PayOS").click()
    page.get_by_text("Hồ sơ đã hoàn tất từ bằng chứng chi trả được xác minh.").wait_for()
    context.close()


def verify_warehouse(browser, console_errors):
    request = base_request("Approved", {
        "id": "destination-1", "bankName": "SECRET BANK", "maskedAccountNumber": "****6789",
        "maskedAccountHolder": "SECRET HOLDER", "status": "Verified",
    })
    request["handoffAt"] = "2026-07-23T11:00:00.000Z"
    request["handoffProofReference"] = "HANDOFF-001"

    def handler(route, path):
        if path == "/api/warehouse/return-refunds/request-1" and route.request.method == "GET":
            fulfill(route, request)
            return True
        if path == "/api/warehouse/return-refunds/request-1/inspection" and route.request.method == "POST":
            body = route.request.post_data_json
            assert body["items"][0]["receivedQuantity"] == 1
            assert body["items"][0]["sellableQuantity"] + body["items"][0]["damagedQuantity"] == 1
            assert "destination" not in body and "refundAmount" not in body
            fulfill(route, {**request, "status": "Received"})
            return True
        return False

    context = actor_context(browser, "WarehouseManager", handler)
    page = context.new_page()
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{BASE_URL}/warehouse/return-refunds/request-1")
    page.wait_for_load_state("networkidle")
    body_text = page.locator("body").inner_text()
    assert "SECRET BANK" not in body_text and "SECRET HOLDER" not in body_text and "6789" not in body_text
    assert page.get_by_text("Số lượng nhận lại được cố định", exact=False).is_visible()
    page.get_by_role("button", name="Xác nhận kiểm hàng").click()
    page.get_by_text("Đã nhận đủ hàng, cập nhật tồn kho", exact=False).wait_for()
    context.close()


def verify_role_boundary(browser):
    context = actor_context(browser, "Customer", lambda route, path: False)
    page = context.new_page()
    page.goto(f"{BASE_URL}/staff/return-refunds/request-1")
    page.wait_for_load_state("networkidle")
    assert urlparse(page.url).path == "/forbidden"
    context.close()


def main():
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        verify_customer(browser, console_errors)
        verify_staff(browser, console_errors)
        verify_warehouse(browser, console_errors)
        verify_role_boundary(browser)
        browser.close()
    assert not console_errors, f"Browser console errors: {console_errors}"
    print(json.dumps({
        "actors": ["Customer", "Staff", "WarehouseManager"],
        "roleBoundary": "Customer blocked from Staff route",
        "refundAmountInputs": 0,
        "warehouseDestinationVisible": False,
        "consoleErrors": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
