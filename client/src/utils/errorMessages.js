// Lớp dịch thông báo lỗi phía client (Hướng B).
// Không thay đổi message gốc từ server (giữ nguyên error.message để không vỡ contract test),
// chỉ cung cấp bản dịch tiếng Việt thân thiện để hiển thị cho người dùng cuối.

// Map errorCode -> thông báo tiếng Việt thân thiện.
const ERROR_CODE_LABELS = {
  // Xác thực & phân quyền
  AUTH_INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  AUTH_ACCOUNT_DISABLED: "Tài khoản của bạn đã bị vô hiệu hóa.",
  AUTH_TOKEN_MISSING: "Vui lòng đăng nhập để tiếp tục.",
  AUTH_PUBLIC_RATE_LIMITED:
    "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.",
  SESSION_MISSING: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
  ROLE_FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  ADMIN_REQUIRED: "Thao tác này yêu cầu quyền quản trị.",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.",
  PAYLOAD_TOO_LARGE: "Dữ liệu gửi lên quá lớn, vui lòng giảm bớt.",
  REGISTRATION_TWO_STEP_REQUIRED:
    "Vui lòng hoàn tất bước xác nhận để tiếp tục đăng ký.",

  // Giỏ hàng
  CART_CHANGED:
    "Giỏ hàng đã thay đổi, vui lòng kiểm tra lại trước khi thanh toán.",
  PRICE_CHANGED: "Giá sản phẩm đã thay đổi, vui lòng kiểm tra lại giỏ hàng.",
  CART_VERSION_CONFLICT: "Giỏ hàng vừa được cập nhật, vui lòng thử lại.",
  CART_QUANTITY_INVALID:
    "Số lượng không hợp lệ, vui lòng nhập số nguyên dương.",
  CART_PRODUCT_UNAVAILABLE: "Sản phẩm hiện không còn được bán.",
  CART_INVENTORY_RECONCILIATION:
    "Tồn kho đang được đối soát, vui lòng thử lại sau.",
  CART_EXPECTED_VERSION_INVALID:
    "Phiên bản giỏ hàng không hợp lệ, vui lòng tải lại trang.",
  CART_IDEMPOTENCY_KEY_REUSED:
    "Yêu cầu đã được ghi nhận trước đó, vui lòng không gửi lại.",
  CART_IDEMPOTENCY_KEY_REQUIRED: "Thiếu mã yêu cầu, vui lòng thử lại.",
  CART_IDEMPOTENCY_KEY_INVALID: "Mã yêu cầu không hợp lệ, vui lòng thử lại.",

  // Thanh toán & đặt hàng
  CHECKOUT_PRICE_CONFIRMATION_REQUIRED:
    "Vui lòng xác nhận giá hiển thị trước khi thanh toán.",
  CHECKOUT_ADDRESS_SOURCE_INVALID:
    "Vui lòng chọn một địa chỉ nhận hàng hợp lệ.",
  CANCEL_REASON_REQUIRED: "Vui lòng nhập lý do hủy đơn hàng.",
  CANCEL_REASON_INVALID: "Lý do hủy không được vượt quá 500 ký tự.",
  IDEMPOTENCY_KEY_REUSED:
    "Yêu cầu đã được ghi nhận trước đó, vui lòng không gửi lại.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu mã yêu cầu, vui lòng thử lại.",
  IDEMPOTENCY_KEY_INVALID: "Mã yêu cầu không hợp lệ, vui lòng thử lại.",
  IDEMPOTENCY_REQUIRED: "Thiếu mã yêu cầu, vui lòng thử lại.",

  // Hậu mãi (đổi trả / hoàn tiền)
  AFTER_SALES_CASE_ACTIVE:
    "Đơn hàng này đang có một yêu cầu đổi/trả đang được xử lý.",

  // Sản phẩm & danh mục (khu vực quản trị)
  PRODUCT_CATEGORY_NOT_FOUND: "Danh mục sản phẩm không tồn tại.",
  PRODUCT_CATEGORY_INACTIVE: "Vui lòng chọn một danh mục đang hoạt động.",
  PRODUCT_SKU_CONFLICT: "Mã SKU đã tồn tại hoặc đã được sử dụng trước đó.",
  PRODUCT_STATUS_INVALID: "Trạng thái sản phẩm không hợp lệ.",
  PRODUCT_PRICE_INVALID: "Giá sản phẩm phải là số nguyên dương (VND).",
  PRODUCT_MEDIA_INVALID:
    "Ảnh sản phẩm không hợp lệ, vui lòng tải lên từ 1 đến 5 ảnh.",
  PRODUCT_UNIT_IMMUTABLE:
    "Đơn vị tính không thể thay đổi sau khi đã phát sinh tồn kho hoặc đơn hàng.",
  CATEGORY_STATUS_REQUIRED: "Vui lòng chọn trạng thái danh mục.",
  CATEGORY_STATUS_INVALID: "Trạng thái danh mục không hợp lệ.",
  CATEGORY_ACTIVE_PRODUCTS:
    "Không thể ngừng hoạt động danh mục khi còn sản phẩm đang bán.",
  CATEGORY_NAME_CONFLICT: "Tên danh mục đã tồn tại.",
  CATEGORY_NAME_REQUIRED: "Vui lòng nhập tên danh mục.",
  CATEGORY_LIFECYCLE_CONFLICT:
    "Trạng thái danh mục đã thay đổi, vui lòng thử lại.",

  // Tài khoản & hồ sơ
  ACCOUNT_VERSION_CONFLICT:
    "Thông tin tài khoản đã thay đổi, vui lòng tải lại và thử lại.",
  ADMIN_COMMAND_FORBIDDEN:
    "Bạn không có quyền thực hiện thao tác quản trị này.",
  SELF_DISABLE_FORBIDDEN: "Quản trị viên không thể tự vô hiệu hóa chính mình.",
  STATUS_INVALID: "Trạng thái không hợp lệ.",
  REASON_REQUIRED: "Vui lòng nhập lý do.",
  PASSWORD_POLICY_INVALID:
    "Mật khẩu phải dài từ 8 đến 72 ký tự và có ít nhất một chữ cái, một chữ số.",
  PASSWORD_CONFIRMATION_MISMATCH: "Xác nhận mật khẩu không khớp.",
  ROLE_TRANSFER_FORBIDDEN: "Không thể chuyển quyền cho tài khoản này.",
  ACTIVE_ASSIGNMENT_BLOCKED:
    "Tài khoản đang có công việc được giao, không thể thay đổi.",

  // Kiểm toán & hệ thống
  AUDIT_FILTER_INVALID: "Bộ lọc nhật ký kiểm toán không hợp lệ.",
  VALIDATION_ERROR: "Dữ liệu nhập vào chưa hợp lệ, vui lòng kiểm tra lại.",
  NOT_FOUND: "Không tìm thấy dữ liệu yêu cầu.",
  SERVICE_UNAVAILABLE: "Hệ thống đang bận, vui lòng thử lại sau ít phút.",
  INTERNAL_ERROR: "Đã có lỗi hệ thống, vui lòng thử lại sau.",
  DATABASE_TRANSACTIONS_UNSUPPORTED:
    "Hệ thống chưa được cấu hình đầy đủ, vui lòng liên hệ quản trị viên.",
};

// Phát hiện chuỗi đã chứa tiếng Việt (có dấu) để tránh dịch thừa các message server đã Việt hóa.
const VIETNAMESE_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const GENERIC_FALLBACK = "Đã có lỗi xảy ra, vui lòng thử lại.";

/**
 * Trả về thông báo tiếng Việt thân thiện để hiển thị cho người dùng.
 * Ưu tiên: errorCode đã biết -> message gốc (nếu đã là tiếng Việt) -> fallback chung.
 * @param {Error & {errorCode?: string}} error
 * @returns {string}
 */
export function translateApiError(error) {
  if (!error) return GENERIC_FALLBACK;

  const code = String(error.errorCode || "").trim();
  if (code && ERROR_CODE_LABELS[code]) return ERROR_CODE_LABELS[code];

  const rawMessage = String(error.message || "").trim();
  if (!rawMessage || rawMessage === "API request failed")
    return GENERIC_FALLBACK;

  // Nếu message gốc đã có dấu tiếng Việt, giữ nguyên để tránh dịch thừa.
  if (VIETNAMESE_DIACRITICS.test(rawMessage)) return rawMessage;

  // Message tiếng Anh/không xác định -> dùng fallback thân thiện.
  return GENERIC_FALLBACK;
}

export { ERROR_CODE_LABELS, GENERIC_FALLBACK };
