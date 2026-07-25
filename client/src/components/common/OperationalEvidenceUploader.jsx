import { useRef, useState } from 'react';

import { resolveMediaUrl } from '../../services/apiClient.js';
import { operationalEvidenceService } from '../../services/operationalEvidenceService.js';

const MAX_IMAGES = 5;
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function OperationalEvidenceUploader({ images = [], onChange, label = 'Ảnh dẫn chứng', disabled = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function upload(fileList) {
    const files = Array.from(fileList || []);
    setError('');
    if (!files.length) return;
    if (images.length + files.length > MAX_IMAGES) return setError('Chỉ được tải tối đa 5 ảnh dẫn chứng.');
    if (files.some((file) => !ACCEPTED_TYPES.has(file.type) || file.size > MAX_SIZE)) {
      return setError('Chỉ nhận JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.');
    }
    setUploading(true);
    try {
      const result = await operationalEvidenceService.uploadImages(files);
      onChange?.([...images, ...(result.items || []).map((item) => item.url)]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="operational-evidence-uploader">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <button className="btn btn-outline-success btn-sm" type="button" disabled={disabled || uploading || images.length >= MAX_IMAGES} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Đang tải ảnh...' : `${label} (${images.length}/${MAX_IMAGES})`}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => upload(event.target.files)} />
        <small className="text-muted">Tối đa 5 ảnh, 5 MB/ảnh.</small>
      </div>
      {error && <div className="text-danger small mt-1" role="alert">{error}</div>}
      {images.length > 0 && <div className="d-flex flex-wrap gap-2 mt-2">{images.map((url, index) => (
        <figure className="m-0 position-relative" key={url}>
          <img src={resolveMediaUrl(url)} alt={`Dẫn chứng ${index + 1}`} width="88" height="72" style={{ objectFit: 'cover', borderRadius: 8 }} />
          <button className="btn btn-danger btn-sm position-absolute top-0 end-0" type="button" aria-label={`Xóa dẫn chứng ${index + 1}`} disabled={disabled} onClick={() => onChange?.(images.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </figure>
      ))}</div>}
    </div>
  );
}
