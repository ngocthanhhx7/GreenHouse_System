const express = require('express');
const authController = require('../controller/auth.controller');

const router = express.Router();
router.post('/internal-invitations/accept', authController.acceptInvitation);

module.exports = router;
