import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ToastManager } from './Toast';
import { useToast } from '../hooks/useToast';

interface UploadedImage {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface UploadResponse {
  success: boolean;
  data?: UploadedImage;
  error?: string;
  details?: string;
}

interface PreviewImage {
  id: string;
  file: File;
  preview: string;
  originalSize: number;
  compressedSize?: number;
  compressedPreview?: string;
  compressedFile?: File;
  isProcessing: boolean;
  relativePath: string;
  uploadStatus?: 'idle' | 'uploading' | 'success' | 'error';
  uploadError?: string;
  uploadedResult?: UploadedImage;
}

type NamingStrategy = 'preserve' | 'hash-suffix' | 'random';

const PREVIEW_CONCURRENCY = 2;
const UPLOAD_CONCURRENCY = 3;

function canCompress(file: File): boolean {
  return (
    file.type.startsWith('image/') &&
    file.type !== 'image/svg+xml' &&
    file.type !== 'image/gif'
  );
}

function revokePreviewUrls(image: PreviewImage): void {
  URL.revokeObjectURL(image.preview);
  if (image.compressedPreview) {
    URL.revokeObjectURL(image.compressedPreview);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export default function ImageUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [quality, setQuality] = useState(80);
  const [directory, setDirectory] = useState('posts');
  const [namingStrategy, setNamingStrategy] = useState<NamingStrategy>('preserve');
  const [enableWebpCompression, setEnableWebpCompression] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewImagesRef = useRef<PreviewImage[]>([]);
  const compressionRunIdRef = useRef(0);
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();

  useEffect(() => {
    previewImagesRef.current = previewImages;
  }, [previewImages]);

  useEffect(() => {
    const savedDirectory = window.localStorage.getItem('lightframe-upload-directory');
    if (savedDirectory) {
      setDirectory(savedDirectory);
    }
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('lightframe-upload-directory', directory);
  }, [directory]);

  const createCompressedPreview = async (
    file: File,
    nextQuality: number
  ): Promise<{ blob: Blob; url: string }> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const image = new Image();
      const sourceUrl = URL.createObjectURL(file);

      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        context?.drawImage(image, 0, 0);
        URL.revokeObjectURL(sourceUrl);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create compressed preview'));
              return;
            }

            resolve({
              blob,
              url: URL.createObjectURL(blob),
            });
          },
          'image/webp',
          nextQuality / 100
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error('Failed to load image'));
      };

      image.src = sourceUrl;
    });
  };

  const redirectToLogin = () => {
    window.location.assign(`/login?next=${encodeURIComponent('/manage')}`);
  };

  const syncCompressionState = useCallback(
    async (
      images: PreviewImage[],
      nextQuality: number,
      compressionEnabled: boolean
    ) => {
      const runId = compressionRunIdRef.current + 1;
      compressionRunIdRef.current = runId;

      if (!compressionEnabled) {
        setPreviewImages((prev) =>
          prev.map((image) => {
            if (image.compressedPreview) {
              URL.revokeObjectURL(image.compressedPreview);
            }

            return {
              ...image,
              compressedPreview: undefined,
              compressedSize: undefined,
              compressedFile: undefined,
              isProcessing: false,
            };
          })
        );
        return;
      }

      const compressibleIds = new Set(
        images.filter((image) => canCompress(image.file)).map((image) => image.id)
      );

      setPreviewImages((prev) =>
        prev.map((image) => {
          if (!compressibleIds.has(image.id)) {
            if (image.compressedPreview) {
              URL.revokeObjectURL(image.compressedPreview);
            }

            return {
              ...image,
              compressedPreview: undefined,
              compressedSize: undefined,
              compressedFile: undefined,
              isProcessing: false,
            };
          }

          return {
            ...image,
            isProcessing: true,
          };
        })
      );

      await mapWithConcurrency(
        images.filter((image) => compressibleIds.has(image.id)),
        PREVIEW_CONCURRENCY,
        async (image) => {
          try {
            const compressed = await createCompressedPreview(image.file, nextQuality);
            if (compressionRunIdRef.current !== runId) {
              URL.revokeObjectURL(compressed.url);
              return;
            }

            setPreviewImages((prev) =>
              prev.map((item) => {
                if (item.id !== image.id) {
                  return item;
                }

                if (item.compressedPreview && item.compressedPreview !== compressed.url) {
                  URL.revokeObjectURL(item.compressedPreview);
                }

                return {
                  ...item,
                  compressedSize: compressed.blob.size,
                  compressedPreview: compressed.url,
                  compressedFile: new File(
                    [compressed.blob],
                    item.file.name.replace(/\.[^/.]+$/, '') + '.webp',
                    { type: 'image/webp' }
                  ),
                  isProcessing: false,
                };
              })
            );
          } catch (error) {
            console.error('Failed to create compressed preview:', error);
            if (compressionRunIdRef.current !== runId) {
              return;
            }

            setPreviewImages((prev) =>
              prev.map((item) =>
                item.id === image.id
                  ? {
                      ...item,
                      isProcessing: false,
                    }
                  : item
              )
            );
          }
        }
      );
    },
    []
  );

  useEffect(() => {
    if (previewImages.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncCompressionState(previewImagesRef.current, quality, enableWebpCompression);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [enableWebpCompression, quality, syncCompressionState]);

  useEffect(() => {
    return () => {
      compressionRunIdRef.current += 1;
      previewImagesRef.current.forEach(revokePreviewUrls);
    };
  }, []);

  const appendPreviews = (images: PreviewImage[]) => {
    const nextImages = [...previewImagesRef.current, ...images];
    previewImagesRef.current = nextImages;
    setPreviewImages(nextImages);
    return nextImages;
  };

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      showError('请选择图片文件');
      return;
    }

    const nextPreviewImages = imageFiles.map<PreviewImage>((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${index}-${crypto.randomUUID()}`,
      file,
      preview: URL.createObjectURL(file),
      originalSize: file.size,
      isProcessing: enableWebpCompression && canCompress(file),
      relativePath: file.webkitRelativePath
        ? file.webkitRelativePath.split('/').slice(1).join('/')
        : '',
      uploadStatus: 'idle',
    }));

    const mergedPreviewImages = appendPreviews(nextPreviewImages);
    await syncCompressionState(mergedPreviewImages, quality, enableWebpCompression);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (file: File, relativePath: string): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('directory', directory);
    formData.append('relativePath', relativePath);
    formData.append('namingStrategy', namingStrategy);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.status === 401) {
      redirectToLogin();
      throw new Error('登录已过期，请重新登录');
    }

    const result = (await response.json().catch(() => ({}))) as UploadResponse;
    if (!response.ok) {
      throw new Error(result.error || result.details || '上传失败');
    }

    return result;
  };

  const uploadPreviewImages = async () => {
    if (previewImages.length === 0) {
      showInfo('没有可上传的图片');
      return;
    }

    setIsUploading(true);

    try {
      const snapshots = previewImagesRef.current.filter((image) => image.uploadStatus !== 'success');
      const snapshotIds = new Set(snapshots.map((image) => image.id));
      setPreviewImages((prev) =>
        prev.map((image) => snapshotIds.has(image.id)
          ? { ...image, uploadStatus: 'uploading', uploadError: undefined }
          : image)
      );
      const results = await mapWithConcurrency(
        snapshots,
        UPLOAD_CONCURRENCY,
        async (image) => {
          const fileToUpload =
            enableWebpCompression && canCompress(image.file) && image.compressedFile
              ? image.compressedFile
              : image.file;

          try {
            const result = await uploadFile(fileToUpload, image.relativePath);
            return {
              id: image.id,
              fileName: fileToUpload.name,
              result,
            };
          } catch (error) {
            return {
              id: image.id,
              fileName: image.file.name,
              error: error instanceof Error ? error.message : '上传失败',
            };
          }
        }
      );

      const successfulIds = new Set<string>();
      const nextUploadedImages: UploadedImage[] = [];
      const uploadedById = new Map<string, UploadedImage>();
      const failedFiles: string[] = [];
      const failedById = new Map<string, string>();

      results.forEach((item) => {
        if (item.result?.success && item.result.data) {
          successfulIds.add(item.id);
          nextUploadedImages.push(item.result.data);
          uploadedById.set(item.id, item.result.data);
          return;
        }

        const errorMessage = item.error || item.result?.error || '上传失败';
        failedFiles.push(`${item.fileName}: ${errorMessage}`);
        failedById.set(item.id, errorMessage);
      });

      if (nextUploadedImages.length > 0) {
        setUploadedImages((prev) => [...nextUploadedImages.reverse(), ...prev].slice(0, 12));
        showSuccess(
          nextUploadedImages.length === 1
            ? '图片上传成功'
            : `成功上传 ${nextUploadedImages.length} 张图片`
        );
      }

      if (failedFiles.length > 0) {
        showError(
          failedFiles.length === 1
            ? failedFiles[0]
            : `${failedFiles.length} 张图片上传失败`
        );
      }

      if (successfulIds.size > 0) {
        setPreviewImages((prev) => prev.map((image) =>
          successfulIds.has(image.id)
            ? { ...image, uploadStatus: 'success', uploadError: undefined, uploadedResult: uploadedById.get(image.id) }
            : image
        ));
      }

      if (failedById.size > 0) {
        setPreviewImages((prev) =>
          prev.map((image) =>
            failedById.has(image.id)
              ? { ...image, uploadStatus: 'error', uploadError: failedById.get(image.id) }
              : image
          )
        );
      }
    } finally {
      setIsUploading(false);
    }
  };

  const retryPreviewImage = async (id: string) => {
    const image = previewImagesRef.current.find((item) => item.id === id);
    if (!image || isUploading) return;

    const fileToUpload =
      enableWebpCompression && canCompress(image.file) && image.compressedFile
        ? image.compressedFile
        : image.file;
    setPreviewImages((prev) => prev.map((item) => item.id === id
      ? { ...item, uploadStatus: 'uploading', uploadError: undefined }
      : item));
    setIsUploading(true);

    try {
      const result = await uploadFile(fileToUpload, image.relativePath);
      if (!result.success || !result.data) throw new Error(result.error || '上传失败');
      setUploadedImages((prev) => [result.data!, ...prev].slice(0, 12));
      setPreviewImages((prev) => prev.map((item) => item.id === id
        ? { ...item, uploadStatus: 'success', uploadError: undefined, uploadedResult: result.data }
        : item));
      showSuccess('图片重试上传成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      setPreviewImages((prev) => prev.map((item) => item.id === id
        ? { ...item, uploadStatus: 'error', uploadError: message }
        : item));
      showError(`${image.file.name}: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removePreviewImage = async (id: string) => {
    const currentImages = previewImagesRef.current;
    const imageToRemove = currentImages.find((image) => image.id === id);
    if (!imageToRemove) {
      return;
    }

    revokePreviewUrls(imageToRemove);
    const remainingImages = currentImages.filter((image) => image.id !== id);
    compressionRunIdRef.current += 1;
    setPreviewImages(remainingImages);

    if (remainingImages.length > 0) {
      await syncCompressionState(remainingImages, quality, enableWebpCompression);
    }
  };

  const clearPreviews = () => {
    compressionRunIdRef.current += 1;
    setPreviewImages((prev) => {
      prev.forEach(revokePreviewUrls);
      return [];
    });
  };

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      await handleFiles(event.dataTransfer.files);
    },
    [enableWebpCompression, quality]
  );

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }

    await handleFiles(files);
  };

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const files: File[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item.type.startsWith('image/')) {
          continue;
        }

        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }

      if (files.length > 0) {
        await handleFiles(files);
      }
    },
    [enableWebpCompression, quality]
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  const copyToClipboard = async (text: string, label = '内容') => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`已复制${label}`, 1800);
    } catch (error) {
      console.error('复制失败:', error);
      showError('复制失败，请手动复制');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const processingCount = previewImages.filter((image) => image.isProcessing).length;
  const compressedCount = previewImages.filter((image) => image.compressedSize).length;
  const totalOriginalSize = previewImages.reduce(
    (total, image) => total + image.originalSize,
    0
  );
  const totalUploadSize = previewImages.reduce((total, image) => {
    if (
      enableWebpCompression &&
      canCompress(image.file) &&
      image.compressedSize
    ) {
      return total + image.compressedSize;
    }

    return total + image.originalSize;
  }, 0);
  const canUpload =
    previewImages.some((image) => image.uploadStatus !== 'success') &&
    !isUploading &&
    previewImages.every((image) => !image.isProcessing);
  const recentCountLabel = uploadedImages.length > 0 ? `${uploadedImages.length} 条` : '暂无';

  return (
    <div className="manage-workspace">
      <div className="manage-page-heading">
        <div>
          <p className="eyebrow accent-eyebrow">管理工作台</p>
          <h1 className="manage-page-title">把图片放到该去的地方。</h1>
          <p className="manage-page-description">
            拖入图片、粘贴截图，处理完成后直接复制链接。游客可以浏览公开画廊，上传和整理仍由你控制。
          </p>
        </div>
        <div className="manage-heading-metrics">
          <div><strong>{previewImages.length}</strong><span>待处理</span></div>
          <div><strong>{uploadedImages.length}</strong><span>本次已传</span></div>
          <a href="/manage/gallery" className="button-secondary">打开图库</a>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <section className="panel panel-light manage-upload-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">快速上传</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--ink)]">新建上传任务</h2>
            </div>
            <span className="status-pill status-pill-accent">支持多图</span>
          </div>

          <div
            className={`upload-dropzone ${isDragging ? 'is-dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="upload-dropzone-icon" aria-hidden="true">↑</div>
            <p className="mt-4 text-base font-semibold text-[var(--ink)]">
              {isDragging ? '松开即可上传' : '拖拽到这里，或直接粘贴截图'}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">也可以选择本地文件或文件夹</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="button-primary button-large disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUploading}
              >
                选择文件
              </button>
              <button
                onClick={() => void uploadPreviewImages()}
                disabled={!canUpload}
                className="button-secondary button-large disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? '上传中...' : '开始上传'}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="advanced-settings-toggle"
            aria-expanded={showAdvancedSettings}
            onClick={() => setShowAdvancedSettings((value) => !value)}
          >
            <span><strong>高级设置</strong><small>目录、命名、压缩质量</small></span>
            <span className="advanced-settings-chevron">{showAdvancedSettings ? '收起' : '展开'}⌄</span>
          </button>

          {showAdvancedSettings ? <div className="advanced-settings-panel">
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <label className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">目标目录</span>
              <input
                type="text"
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder="posts/tech/vision/article-slug"
                className="input-surface w-full px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">命名方式</span>
              <select
                value={namingStrategy}
                onChange={(event) => setNamingStrategy(event.target.value as NamingStrategy)}
                className="input-surface w-full px-3 py-2 text-sm"
              >
                <option value="preserve">保留语义原名（推荐）</option>
                <option value="hash-suffix">原名 + 内容短哈希</option>
                <option value="random">完全随机</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={enableWebpCompression}
                onChange={(event) => setEnableWebpCompression(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--paper)] text-[var(--accent)]"
              />
              <span>WebP 压缩</span>
            </label>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]">
              <span>保留文件夹内部结构</span>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="button-secondary px-3 py-1.5 text-xs"
                disabled={isUploading}
              >
                选择文件夹
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            选择文件夹时不会写入最外层文件夹名；例如目标目录填 posts，文件夹内的
            tech/vision/a.webp 会保存为 posts/tech/vision/a.webp。
          </p>

          {enableWebpCompression ? (
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between text-sm text-[var(--ink-soft)]">
                <span>压缩质量</span>
                <span className="font-medium text-[var(--ink)]">{quality}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={quality}
                onChange={(event) => setQuality(Number.parseInt(event.target.value, 10))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(15,23,42,0.12)]"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>
          ) : null}
          </div> : null}

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
            <span className="status-pill">队列 {previewImages.length}</span>
            <span className="status-pill">已压缩 {compressedCount}</span>
            <span className="status-pill">处理中 {processingCount}</span>
            <span className="status-pill">
              体积 {formatFileSize(totalOriginalSize)} → {formatFileSize(totalUploadSize)}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </section>

        <section className="panel panel-light manage-queue-panel p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ink)]">待上传列表</h3>
            {previewImages.length > 0 ? (
              <button onClick={clearPreviews} className="button-ghost px-3 py-2 text-xs">
                清空
              </button>
            ) : null}
          </div>

          {previewImages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              暂无待上传文件
            </div>
          ) : (
            <div className="space-y-2">
              {previewImages.map((previewImage) => {
                const useCompressedPreview =
                  enableWebpCompression && Boolean(previewImage.compressedPreview);
                const uploadSize = useCompressedPreview
                  ? previewImage.compressedSize || previewImage.originalSize
                  : previewImage.originalSize;
                const deltaPercent = previewImage.compressedSize
                  ? Math.round(
                      ((previewImage.originalSize - previewImage.compressedSize) /
                        previewImage.originalSize) *
                        100
                    )
                  : null;

                return (
                  <article
                    key={previewImage.id}
                    className="upload-queue-item flex items-center gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <img
                      src={
                        useCompressedPreview
                          ? previewImage.compressedPreview
                          : previewImage.preview
                      }
                      alt={previewImage.file.name}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium text-[var(--ink)]"
                        title={previewImage.file.name}
                      >
                        {previewImage.relativePath || previewImage.file.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                        <span>{formatFileSize(previewImage.originalSize)}</span>
                        {previewImage.compressedSize ? (
                          <>
                            <span>→</span>
                            <span>{formatFileSize(uploadSize)}</span>
                            {deltaPercent !== null ? (
                              <span
                                className={
                                  deltaPercent >= 0
                                    ? 'text-[var(--success)]'
                                    : 'text-[var(--danger)]'
                                }
                              >
                                {deltaPercent >= 0
                                  ? `-${deltaPercent}%`
                                  : `+${Math.abs(deltaPercent)}%`}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                        {previewImage.isProcessing ? (
                          <span className="text-[var(--accent)]">压缩中...</span>
                        ) : null}
                        {previewImage.uploadStatus === 'uploading' ? (
                          <span className="text-[var(--accent-strong)]">上传中...</span>
                        ) : null}
                        {previewImage.uploadStatus === 'success' ? (
                          <span className="text-[var(--success)]">已上传</span>
                        ) : null}
                        {previewImage.uploadStatus === 'error' ? (
                          <span className="text-[var(--danger)]" title={previewImage.uploadError}>上传失败：{previewImage.uploadError}</span>
                        ) : null}
                      </div>
                    </div>
                    {previewImage.uploadStatus === 'error' ? (
                      <button
                        onClick={() => void retryPreviewImage(previewImage.id)}
                        className="button-secondary px-2 py-1 text-xs"
                        disabled={isUploading}
                      >
                        重试
                      </button>
                    ) : null}
                    {previewImage.uploadStatus === 'success' && previewImage.uploadedResult ? (
                      <div className="queue-result-actions">
                        <button type="button" className="button-secondary px-2 py-1 text-xs" onClick={() => void copyToClipboard(previewImage.uploadedResult!.url, '直链')}>复制直链</button>
                        <button type="button" className="button-ghost px-2 py-1 text-xs" onClick={() => void copyToClipboard(`![${previewImage.file.name}](${previewImage.uploadedResult!.url})`, 'Markdown')}>Markdown</button>
                      </div>
                    ) : null}
                    <button
                      onClick={() => void removePreviewImage(previewImage.id)}
                      className="button-ghost px-2 py-1 text-xs"
                      disabled={previewImage.uploadStatus === 'uploading'}
                    >
                      删除
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <aside className="panel panel-light recent-uploads-panel p-4 sm:p-5 xl:sticky xl:top-[5.2rem] xl:max-h-[calc(100vh-6.2rem)] xl:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--ink)]">可复制</h3>
          <span className="text-xs text-[var(--muted)]">{recentCountLabel}</span>
        </div>

        <div className="space-y-2">
          {uploadedImages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              暂无上传记录
            </div>
          ) : (
            uploadedImages.map((image, index) => (
              <article
                key={`${image.key}-${index}`}
                className="recent-upload-item rounded-lg border p-3"
              >
                <div className="flex items-start gap-2.5">
                  <img
                    src={image.url}
                    alt="Uploaded"
                    className="h-11 w-11 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]" title={image.key}>
                      {image.key}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatFileSize(image.size)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void copyToClipboard(image.url, '链接')}
                    className="button-secondary px-2 py-2 text-xs"
                  >
                    链接
                  </button>
                  <button
                    onClick={() =>
                      void copyToClipboard(`![Image](${image.url})`, 'Markdown')
                    }
                    className="button-secondary px-2 py-2 text-xs"
                  >
                    Markdown
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
      </div>

      <ToastManager toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
