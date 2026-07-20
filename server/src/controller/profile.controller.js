const { profileService } = require('../services/profile.service');
const { userAddressService } = require('../services/userAddress.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getProfile(req, res, next) {
  try {
    return sendSuccess(res, await profileService.getProfile(req.user.id), 'Profile loaded');
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    return sendSuccess(res, await profileService.updateProfile(req.user.id, req.body), 'Profile updated');
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    return sendSuccess(res, await profileService.changePassword(req.user.id, req.body), 'Password changed');
  } catch (error) {
    return next(error);
  }
}

async function listAddresses(req, res, next) {
  try {
    return sendSuccess(res, { items: await userAddressService.listAddresses(req.user.id) }, 'Addresses loaded');
  } catch (error) {
    return next(error);
  }
}

async function createAddress(req, res, next) {
  try {
    return sendSuccess(res, await userAddressService.createAddress(req.user.id, req.body), 'Address created', 201);
  } catch (error) {
    return next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    return sendSuccess(res, await userAddressService.updateAddress(req.user.id, req.params.id, req.body), 'Address updated');
  } catch (error) {
    return next(error);
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    return sendSuccess(res, await userAddressService.setDefaultAddress(req.user.id, req.params.id), 'Default address updated');
  } catch (error) {
    return next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    return sendSuccess(res, await userAddressService.deleteAddress(req.user.id, req.params.id), 'Address deleted');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
