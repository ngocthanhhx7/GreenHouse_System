const multer = require('multer');

const ApiError = require('../utils/apiError');
const { MAX_IMAGE_SIZE } = require('../services/upload.service');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 5,
    fields: 10,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      return callback(new ApiError(400, 'Only JPEG, PNG, or WebP images are accepted'));
    }
    return callback(null, true);
  },
});

function handleMulter(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'Image must not exceed 5 MB'));
      if (error.code === 'LIMIT_FILE_COUNT') return next(new ApiError(400, 'A maximum of 5 images can be uploaded at once'));
      return next(new ApiError(400, 'Invalid image upload', [{ field: error.field || 'image', message: error.message }]));
    }
    return next(error);
  });
}

const uploadAvatar = handleMulter(imageUpload.single('avatar'));
const uploadProductImages = handleMulter(imageUpload.array('images', 5));

module.exports = {
  uploadAvatar,
  uploadProductImages,
};
