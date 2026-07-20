const ApiError = require('../utils/apiError');
const { profileService } = require('../services/profile.service');
const { uploadService } = require('../services/upload.service');
const { sendSuccess } = require('../utils/apiResponse');

async function uploadProductImages(req, res, next) {
  try {
    if (!req.files || !req.files.length) throw new ApiError(400, 'At least one product image is required');
    const items = await uploadService.storeImages(req.files, 'products');
    return sendSuccess(res, { items }, 'Product images uploaded', 201);
  } catch (error) {
    return next(error);
  }
}

async function uploadAvatar(req, res, next) {
  let uploaded = null;
  try {
    if (!req.file) throw new ApiError(400, 'Avatar image is required');
    uploaded = await uploadService.storeImage(req.file, 'avatars');
    const result = await profileService.setAvatar(req.user.id, uploaded.url);
    if (result.previousAvatarUrl) await uploadService.removeManagedFile(result.previousAvatarUrl);
    return sendSuccess(res, { profile: result.profile, upload: uploaded }, 'Avatar updated', 201);
  } catch (error) {
    if (uploaded) await uploadService.removeManagedFile(uploaded.url).catch(() => {});
    return next(error);
  }
}

async function deleteAvatar(req, res, next) {
  try {
    const result = await profileService.removeAvatar(req.user.id);
    if (result.previousAvatarUrl) await uploadService.removeManagedFile(result.previousAvatarUrl);
    return sendSuccess(res, { profile: result.profile }, 'Avatar removed');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadProductImages,
  uploadAvatar,
  deleteAvatar,
};
