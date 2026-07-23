const ApiError = require('../utils/apiError');
const { profileService } = require('../services/profile.service');
const { productMediaService } = require('../services/productMedia.service');
const { returnEvidenceAccessService } = require('../services/returnEvidence.service');
const { uploadService, validateReturnEvidenceBatch } = require('../services/upload.service');
const { returnEvidenceClaim } = require('../utils/returnEvidenceClaim');
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

async function uploadReturnEvidence(req, res, next) {
  let items = [];
  try {
    if (!req.files || !req.files.length) throw new ApiError(400, 'At least one return evidence image is required');
    validateReturnEvidenceBatch(req.files);
    items = await uploadService.storeImages(req.files, 'return-evidence');
    const claimedItems = items.map((item) => ({
      ...item,
      url: returnEvidenceClaim.sign(req.user.id, item.url, item.size),
    }));
    return sendSuccess(res, { items: claimedItems }, 'Return evidence uploaded', 201);
  } catch (error) {
    if (items.length) await Promise.all(items.map((item) => uploadService.removeManagedFile(item.url).catch(() => {})));
    return next(error);
  }
}

async function getReturnEvidence(req, res, next) {
  try {
    const access = await returnEvidenceAccessService.authorize(req.user.id, req.user.role, req.params.filename);
    const managed = uploadService.resolveManagedFile(`/api/return-refunds/evidence/${access.filename}`, 'return-evidence');
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': managed.mimeType,
      'Content-Disposition': `inline; filename="${access.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return res.sendFile(managed.path, (error) => {
      if (!error) return;
      if (!res.headersSent) return next(new ApiError(404, 'Return evidence not found'));
      return next(error);
    });
  } catch (error) {
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

async function deleteProductImage(req, res, next) {
  try {
    return sendSuccess(res, await productMediaService.deleteUnusedImage(req.body.url), 'Product image deleted');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadProductImages,
  uploadAvatar,
  uploadReturnEvidence,
  getReturnEvidence,
  deleteAvatar,
  deleteProductImage,
};
