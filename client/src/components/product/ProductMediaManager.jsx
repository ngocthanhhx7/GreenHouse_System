import { useRef, useState } from 'react';

import { resolveMediaUrl } from '../../services/apiClient.js';
import { productService } from '../../services/productService.js';

const MAX_IMAGES = 5;
const MAX_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ProductMediaManager({ images, onChange, onRemoved, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    setError('');
    if (!files.length) return;
    if (images.length + files.length > MAX_IMAGES) {
      setError(`Mỗi sản phẩm có tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }
    if (files.some((file) => !IMAGE_TYPES.has(file.type) || file.size > MAX_SIZE)) {
      setError('Chỉ nhận JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.');
      return;
    }

    setUploading(true);
    try {
      const result = await productService.uploadImages(files);
      const uploadedUrls = (result.items || []).map((item) => item.url);
      onUploaded?.(uploadedUrls);
      onChange([...images, ...uploadedUrls]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function moveImage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function makeFeatured(index) {
    if (index === 0) return;
    onChange([images[index], ...images.filter((_, currentIndex) => currentIndex !== index)]);
  }

  function removeImage(index) {
    const removed = images[index];
    onChange(images.filter((_, currentIndex) => currentIndex !== index));
    onRemoved?.(removed);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    uploadFiles(event.dataTransfer.files);
  }

  return (
    <div className="product-media-manager">
      <div
        className={`product-media-dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <strong>Ảnh sản phẩm</strong>
        <span>Kéo thả ảnh vào đây hoặc chọn từ máy tính.</span>
        <button className="btn btn-outline-success" type="button" disabled={uploading || images.length >= MAX_IMAGES} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Đang tải ảnh...' : 'Chọn ảnh'}
        </button>
        <input ref={inputRef} name="productImages" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => uploadFiles(event.target.files)} />
        <small>JPEG, PNG, WebP; tối đa 5 ảnh, 5 MB mỗi ảnh. Ảnh đầu tiên là ảnh đại diện.</small>
      </div>
      {error && <div className="text-danger small mt-2" role="alert">{error}</div>}
      {images.length > 0 && (
        <div className="product-media-grid">
          {images.map((url, index) => (
            <article className="product-media-item" key={`${url}-${index}`}>
              <div className="product-media-preview">
                <img src={resolveMediaUrl(url)} alt={`Ảnh sản phẩm ${index + 1}`} />
                {index === 0 && <span>Ảnh chính</span>}
              </div>
              <div className="product-media-actions">
                <button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label="Chuyển ảnh sang trái">Trái</button>
                <button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label="Chuyển ảnh sang phải">Phải</button>
                {index > 0 && <button type="button" onClick={() => makeFeatured(index)}>Đặt làm ảnh chính</button>}
                <button className="danger" type="button" onClick={() => removeImage(index)}>Xóa ảnh</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
