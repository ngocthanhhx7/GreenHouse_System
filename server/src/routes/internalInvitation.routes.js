const express = require('express');
const authController = require('../controller/auth.controller');
const { validateRequest } = require('../middlewares/validateRequest.middleware');
const { rules } = require('../validation/requestValidation');

const router = express.Router();

const invitationAcceptanceSchema = {
  email: [
    rules.required('Email là bắt buộc.'),
    rules.email('Email không hợp lệ.'),
  ],
  token: [
    rules.required('Mã lời mời là bắt buộc.'),
    rules.maxLength(512, 'Mã lời mời không hợp lệ.'),
  ],
  fullName: [
    rules.required('Họ tên là bắt buộc.'),
    rules.maxLength(120, 'Họ tên không được vượt quá 120 ký tự.'),
  ],
  phoneNumber: [
    rules.required('Số điện thoại là bắt buộc.'),
    rules.phone('Số điện thoại không hợp lệ.'),
  ],
  password: [rules.required('Mật khẩu là bắt buộc.')],
  confirmPassword: [
    rules.required('Xác nhận mật khẩu là bắt buộc.'),
    rules.equalsField('password', 'Xác nhận mật khẩu không khớp.'),
  ],
  idempotencyKey: [
    rules.maxLength(120, 'Mã idempotency không hợp lệ.'),
  ],
};

router.post(
  '/internal-invitations/accept',
  validateRequest(invitationAcceptanceSchema),
  authController.acceptInvitation,
);

module.exports = router;
