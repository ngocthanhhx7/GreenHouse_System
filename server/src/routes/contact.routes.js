const express = require('express');
const contactController = require('../controller/contact.controller');
const { validateRequest } = require('../middlewares/validateRequest.middleware');
const { rules } = require('../validation/requestValidation');

const router = express.Router();
const contactSchema = {
  name: [rules.required('Họ tên là bắt buộc.'), rules.maxLength(120, 'Họ tên không được vượt quá 120 ký tự.')],
  email: [rules.required('Email là bắt buộc.'), rules.email('Email không hợp lệ.')],
  phone: [rules.phone('Số điện thoại không hợp lệ.')],
  subject: [rules.required('Chủ đề là bắt buộc.'), rules.maxLength(160, 'Chủ đề không được vượt quá 160 ký tự.')],
  message: [rules.required('Nội dung là bắt buộc.'), rules.minLength(10, 'Nội dung phải có ít nhất 10 ký tự.'), rules.maxLength(5000, 'Nội dung không được vượt quá 5000 ký tự.')],
};

router.post('/contact', validateRequest(contactSchema), contactController.submit);

module.exports = router;
