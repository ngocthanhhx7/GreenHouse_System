const express = require('express');
const authController = require('../controller/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validateRequest.middleware');
const { rules } = require('../validation/requestValidation');

const router = express.Router();

const registerSchema = {
  fullName: [rules.required('Họ tên là bắt buộc'), rules.maxLength(120, 'Họ tên không được vượt quá 120 ký tự')],
  email: [rules.required('Email là bắt buộc'), rules.email('Email không hợp lệ')],
  phone: [rules.required('Số điện thoại là bắt buộc'), rules.phone('Số điện thoại không hợp lệ')],
  address: [rules.required('Địa chỉ là bắt buộc'), rules.maxLength(500, 'Địa chỉ không được vượt quá 500 ký tự')],
  password: [rules.required('Mật khẩu là bắt buộc'), rules.minLength(8, 'Mật khẩu phải có ít nhất 8 ký tự')],
};
const loginSchema = {
  email: [rules.required('Email là bắt buộc'), rules.email('Email không hợp lệ')],
  password: [rules.required('Mật khẩu là bắt buộc')],
};
const forgotPasswordSchema = {
  email: [rules.required('Email là bắt buộc.'), rules.email('Email không hợp lệ.')],
};
const resetPasswordSchema = {
  email: [rules.required('Email là bắt buộc.'), rules.email('Email không hợp lệ.')],
  otp: [rules.required('Mã OTP là bắt buộc.'), rules.pattern(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số.')],
  password: [rules.required('Mật khẩu mới là bắt buộc.'), rules.minLength(8, 'Mật khẩu mới phải có ít nhất 8 ký tự.')],
  confirmPassword: [rules.required('Xác nhận mật khẩu là bắt buộc.'), rules.equalsField('password', 'Xác nhận mật khẩu không khớp.')],
};

router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/forgot-password', validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), authController.resetPassword);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
