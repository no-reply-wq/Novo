'use client';

import React, { useRef, useState } from 'react';

export interface PhotoCaptureProps {
  onCapture: (file: File, previewUrl: string) => void;
  onRemove?: () => void;
  maxSizeKb?: number;
  quality?: number;
  allowGallery?: boolean;
}

export interface PhotoCaptureMultipleProps {
  onCapture: (files: Array<{ file: File; previewUrl: string }>) => void;
  maxSizeKb?: number;
  quality?: number;
  allowGallery?: boolean;
  maxCount?: number;
}

function compressImage(file: File, quality: number, maxSizeKb: number): Promise<{ file: File; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if too large
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression failed')); return; }
        const sizeKb = blob.size / 1024;
        // If still too large, recurse with lower quality
        if (sizeKb > maxSizeKb && quality > 0.1) {
          const reduced = new File([blob], file.name, { type: 'image/jpeg' });
          resolve(compressImage(reduced, Math.max(0.1, quality - 0.15), maxSizeKb));
          return;
        }
        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);
        resolve({ file: compressed, previewUrl });
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

export function PhotoCapture({
  onCapture,
  onRemove,
  maxSizeKb = 2000,
  quality = 0.85,
  allowGallery = true,
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { file: compressed, previewUrl } = await compressImage(file, quality, maxSizeKb);
      setPreview(previewUrl);
      onCapture(compressed, previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleRemove = () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemove?.();
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
      {error && (
        <div className="w-full rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      {preview ? (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Captured photo" className="w-full h-full object-cover" />
          <button
            onClick={handleRemove}
            aria-label="Remove photo"
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/80"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <span className="text-sm text-gray-500">Processing…</span>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
              </svg>
              <span className="text-sm text-gray-600 font-medium">Take Photo</span>
              {allowGallery && <span className="text-xs text-gray-400">or choose from gallery</span>}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={allowGallery ? undefined : 'environment'}
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload photo"
      />
    </div>
  );
}

export function PhotoCaptureMultiple({
  onCapture,
  maxSizeKb = 2000,
  quality = 0.85,
  allowGallery = true,
  maxCount = 5,
}: PhotoCaptureMultipleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    setError(null);
    try {
      const remaining = maxCount - photos.length;
      const toProcess = Array.from(files).slice(0, remaining);
      const results = await Promise.all(
        toProcess.map((f) => compressImage(f, quality, maxSizeKb))
      );
      const updated = [...photos, ...results];
      setPhotos(updated);
      onCapture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process images');
    } finally {
      setLoading(false);
    }
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);
    onCapture(updated);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {error && (
        <div className="rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {photos.map(({ previewUrl }, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            <button
              onClick={() => removePhoto(i)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < maxCount && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {loading ? '…' : <span className="text-2xl" aria-hidden="true">+</span>}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture={allowGallery ? undefined : 'environment'}
        onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); }}
        className="hidden"
        aria-label="Upload photos"
      />
    </div>
  );
}
