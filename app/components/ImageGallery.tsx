import { useEffect, useMemo, useState } from 'react';
import { ToastManager } from './Toast';
import { useToast } from '../hooks/useToast';

interface ImageInfo {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface DeleteFailure {
  key: string;
  error: string;
}

interface ImagesResponse {
  success: boolean;
  data?: ImageInfo[];
  error?: string;
  details?: string;
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

interface DeleteImagesResponse {
  success: boolean;
  deleted?: string[];
  failed?: DeleteFailure[];
  error?: string;
  details?: string;
}

type SortOrder = 'time-desc' | 'time-asc';
type DateFilter = 'all' | 'today' | 'week' | 'month';

const IMAGES_PER_PAGE = 60;

function getLoginPath(): string {
  return `/login?next=${encodeURIComponent('/manage/gallery')}`;
}

function getDisplayName(key: string): string {
  return key.split('/').pop() || key;
}

function getDisplayStem(key: string): string {
  const displayName = getDisplayName(key);
  const stem = displayName.replace(/\.[^.]+$/, '');
  return stem || displayName;
}

function getFileExtension(key: string): string {
  const match = getDisplayName(key).match(/\.([^.]+)$/);
  return match ? match[1].toUpperCase() : '';
}

function getMimeLabel(mimeType: string): string {
  return mimeType.replace('image/', '').toUpperCase();
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}

function formatClockTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getToggleButtonClass(active: boolean): string {
  return [
    'inline-flex items-center justify-center rounded-[11px] border px-4 py-2.5 text-[13px] font-semibold transition-all duration-200',
    active
      ? 'border-[rgba(95,159,213,.35)] bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-[0_8px_18px_rgba(64,128,181,0.08)]'
      : 'border-transparent bg-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-white hover:text-[var(--ink)]',
  ].join(' ');
}

function getActionButtonClass(variant: 'secondary' | 'ghost' | 'danger'): string {
  const base =
    'inline-flex items-center justify-center rounded-[12px] border px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200';

  if (variant === 'secondary') {
    return `${base} border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--accent-soft)]`;
  }

  if (variant === 'ghost') {
    return `${base} border-[var(--line)] bg-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]`;
  }

  return `${base} border-[rgba(159,97,83,0.18)] bg-[rgba(159,97,83,0.9)] text-[var(--paper-strong)] hover:shadow-[0_10px_24px_rgba(159,97,83,0.14)]`;
}

export default function ImageGallery() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [browseMode, setBrowseMode] = useState<'page' | 'all'>('page');
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeImage, setActiveImage] = useState<ImageInfo | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortOrder>('time-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();

  const currentCursor = cursorHistory[pageIndex] ?? null;

  useEffect(() => {
    if (browseMode !== 'page') {
      return;
    }

    void loadPage(currentCursor);
  }, [browseMode, currentCursor, prefixFilter]);

  useEffect(() => {
    if (!activeImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveImage(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeImage]);

  const fetchImagePage = async (cursor: string | null) => {
    const params = new URLSearchParams({
      limit: IMAGES_PER_PAGE.toString(),
    });

    if (cursor) {
      params.set('cursor', cursor);
    }
    if (prefixFilter.trim()) {
      params.set('prefix', prefixFilter.trim());
    }

    const response = await fetch(`/api/images?${params.toString()}`);
    if (response.status === 401) {
      window.location.assign(getLoginPath());
      throw new Error('登录已过期，请重新登录');
    }

    const result = (await response.json().catch(() => ({}))) as ImagesResponse;

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.error || result.details || '加载图片失败');
    }

    return {
      images: result.data,
      nextCursor: result.pagination?.nextCursor || null,
      hasMore: Boolean(result.pagination?.hasMore),
    };
  };

  const loadPage = async (cursor: string | null = currentCursor) => {
    try {
      setLoading(true);
      const result = await fetchImagePage(cursor);

      setImages(result.images);
      setNextCursor(result.nextCursor);
      setLoadedCount(result.images.length);
      setSelectedImages(new Set());
      setError(null);
      setErrorDetails(null);
    } catch (err) {
      console.error('加载图片失败:', err);
      setError(err instanceof Error ? err.message : '网络错误');
      setErrorDetails(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  const loadAllImages = async () => {
    try {
      setBrowseMode('all');
      setLoading(true);
      setLoadingAll(true);
      setSelectedImages(new Set());

      let cursor: string | null = null;
      let collected: ImageInfo[] = [];
      let pageCounter = 0;

      while (true) {
        const result = await fetchImagePage(cursor);
        pageCounter += 1;
        collected = [...collected, ...result.images];
        setImages(collected);
        setLoadedCount(collected.length);

        if (!result.nextCursor) {
          setNextCursor(null);
          break;
        }

        cursor = result.nextCursor;
      }

      setError(null);
      setErrorDetails(null);
      showSuccess(
        collected.length > 0
          ? `已加载全部内容，共 ${collected.length} 张`
          : `已完成全量扫描，共 ${pageCounter} 页`
      );
    } catch (err) {
      console.error('加载全部图片失败:', err);
      setError(err instanceof Error ? err.message : '网络错误');
      setErrorDetails(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
      setLoadingAll(false);
    }
  };

  const switchToPagedMode = () => {
    setBrowseMode('page');
    setPageIndex(0);
    setCursorHistory([null]);
    setNextCursor(null);
  };

  const changePrefixFilter = (value: string) => {
    setPrefixFilter(value);
    setBrowseMode('page');
    setPageIndex(0);
    setCursorHistory([null]);
    setNextCursor(null);
  };

  const deleteImages = async (keys: string[]) => {
    if (keys.length === 0) {
      showInfo('请先选择要删除的图片');
      return;
    }

    try {
      setActionLoading(true);

      const payload = keys.length === 1 ? { key: keys[0] } : { keys };
      const response = await fetch('/api/images', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        window.location.assign(getLoginPath());
        return;
      }

      const result = (await response.json().catch(() => ({}))) as DeleteImagesResponse;

      if (!response.ok) {
        showError(result.error || '删除失败');
        return;
      }

      const deletedCount = result.deleted?.length || 0;
      const failedCount = result.failed?.length || 0;

      if (deletedCount > 0) {
        showSuccess(deletedCount === 1 ? '图片已删除' : `已删除 ${deletedCount} 张图片`);
      }

      if (failedCount > 0) {
        showError(
          failedCount === 1
            ? `删除失败: ${result.failed?.[0].error || '未知错误'}`
            : `${failedCount} 张图片删除失败`
        );
      }

      if (browseMode === 'all') {
        await loadAllImages();
      } else {
        await loadPage(currentCursor);
      }
    } catch (err) {
      console.error('删除图片失败:', err);
      showError('删除失败: 网络错误');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteImage = async (key: string) => {
    if (!window.confirm('确定要删除这张图片吗？')) {
      return;
    }

    await deleteImages([key]);
  };

  const deleteSelectedImages = async () => {
    if (selectedImages.size === 0) {
      showInfo('请先选择要删除的图片');
      return;
    }

    if (!window.confirm(`确定要删除选中的 ${selectedImages.size} 张图片吗？`)) {
      return;
    }

    await deleteImages(Array.from(selectedImages));
  };

  const toggleImageSelection = (key: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllImages = () => {
    const visibleKeys = visibleImages.map((image) => image.key);
    if (visibleKeys.length === 0) {
      return;
    }

    setSelectedImages((prev) => {
      const next = new Set(prev);
      const shouldClear = visibleKeys.every((key) => next.has(key));

      visibleKeys.forEach((key) => {
        if (shouldClear) {
          next.delete(key);
        } else {
          next.add(key);
        }
      });

      return next;
    });
  };

  const goToPreviousPage = () => {
    setPageIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextPage = () => {
    if (!nextCursor) {
      return;
    }

    setCursorHistory((prev) => {
      const nextHistory = prev.slice(0, pageIndex + 1);
      nextHistory.push(nextCursor);
      return nextHistory;
    });
    setPageIndex((prev) => prev + 1);
  };

  const copyToClipboard = async (text: string, label = '内容') => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`已复制${label}`, 1800);
    } catch (copyError) {
      console.error('复制失败:', copyError);
      showError('复制失败，请手动复制');
    }
  };

  const getCopyText = (image: ImageInfo, format: 'url' | 'markdown' | 'html' | 'bbcode') => {
    if (format === 'markdown') return `![${getDisplayName(image.key)}](${image.url})`;
    if (format === 'html') return `<img src="${image.url}" alt="${getDisplayName(image.key)}" />`;
    if (format === 'bbcode') return `[img]${image.url}[/img]`;
    return image.url;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleRefresh = async () => {
    if (browseMode === 'all') {
      await loadAllImages();
      return;
    }

    await loadPage(currentCursor);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleImages = useMemo(() => {
    const now = Date.now();
    const dateThreshold = dateFilter === 'today'
      ? now - 24 * 60 * 60 * 1000
      : dateFilter === 'week'
        ? now - 7 * 24 * 60 * 60 * 1000
        : dateFilter === 'month'
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;
    const filtered = images.filter((image) => {
      const matchesSearch = !normalizedSearch || image.key.toLowerCase().includes(normalizedSearch);
      const matchesFormat = formatFilter === 'all' || getMimeLabel(image.mimeType) === formatFilter;
      const uploadedTime = Date.parse(image.uploadedAt);
      const matchesDate = dateThreshold === 0 || (!Number.isNaN(uploadedTime) && uploadedTime >= dateThreshold);
      return matchesSearch && matchesFormat && matchesDate;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aTime = Date.parse(a.uploadedAt);
      const bTime = Date.parse(b.uploadedAt);
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      if (sortOrder === 'time-asc') {
        return safeATime - safeBTime;
      }

      return safeBTime - safeATime;
    });

    return sorted;
  }, [images, normalizedSearch, sortOrder, formatFilter, dateFilter]);

  const isAllSelected =
    visibleImages.length > 0 &&
    visibleImages.every((image) => selectedImages.has(image.key));
  const visibleSelectedCount = visibleImages.filter((image) =>
    selectedImages.has(image.key)
  ).length;
  const hasSearch = normalizedSearch.length > 0;
  const viewLabel = viewMode === 'grid' ? '网格' : '列表';
  const browseLabel = browseMode === 'all' ? '全部模式' : `第 ${pageIndex + 1} 页`;

  if (loading && images.length === 0) {
    return (
      <div className="panel panel-light p-10">
        <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
          <div>
            <p className="font-display text-3xl text-[var(--ink)]">加载中</p>
            <p className="mt-2 text-sm tracking-[0.16em] text-[var(--muted)]">
              {loadingAll ? `已加载 ${loadedCount} 张` : '读取当前结果'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel panel-light border-[rgba(167,96,82,0.18)] p-6 sm:p-7">
        <div className="flex items-start space-x-4">
          <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(167,96,82,0.12)] text-[var(--danger)]">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-display text-3xl text-[var(--ink)]">加载失败</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--danger)]">{error}</p>
            {errorDetails ? (
              <div className="mt-4 rounded-[14px] border border-[rgba(167,96,82,0.16)] bg-white/60 px-4 py-3 text-sm leading-7 text-[var(--ink-soft)]">
                {errorDetails}
              </div>
            ) : null}
            <button
              onClick={() => void handleRefresh()}
              className="button-danger mt-5"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="manage-page-heading gallery-manage-heading">
          <div>
            <p className="eyebrow accent-eyebrow">内容管理</p>
            <h1 className="manage-page-title">图库</h1>
            <p className="manage-page-description">集中查看、筛选和复制你的图片资源。</p>
          </div>
          <div className="manage-heading-metrics">
            <div><strong>{loadedCount}</strong><span>当前载入</span></div>
            <div><strong>{visibleImages.length}</strong><span>当前显示</span></div>
            <div><strong>{selectedImages.size}</strong><span>已选择</span></div>
          </div>
        </div>

        <section className="panel panel-light gallery-control-panel p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
            <div className="min-w-0 space-y-4">
              <div>
                <p className="eyebrow text-[var(--muted)]">当前浏览</p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-soft)]">
                  <span>当前载入 {loadedCount}</span>
                  <span>当前显示 {visibleImages.length}</span>
                  <span>已选中 {selectedImages.size}</span>
                  <span>{browseLabel}</span>
                  <span>{viewLabel}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="按文件名搜索..."
                  className="input-surface w-full px-3 py-2 text-sm"
                />
                {hasSearch ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="button-secondary px-3 py-2"
                  >
                    清空
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={prefixFilter}
                  onChange={(event) => changePrefixFilter(event.target.value)}
                  placeholder="选择虚拟相册，例如 posts/tech/vision/"
                  className="input-surface w-full px-3 py-2 font-mono text-sm"
                />
                {prefixFilter ? (
                  <button
                    onClick={() => changePrefixFilter('')}
                    className="button-secondary px-3 py-2"
                  >
                    全部目录
                  </button>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">
                目录前缀就是虚拟相册，不新增数据库；输入前缀即可查看对应目录下的图片。
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                  图片格式
                  <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} className="input-surface px-3 py-2.5 text-sm">
                    <option value="all">全部格式</option>
                    {Array.from(new Set(images.map((image) => getMimeLabel(image.mimeType)))).sort().map((format) => (
                      <option key={format} value={format}>{format}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                  上传时间
                  <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="input-surface px-3 py-2.5 text-sm">
                    <option value="all">不限时间</option>
                    <option value="today">最近 24 小时</option>
                    <option value="week">最近 7 天</option>
                    <option value="month">最近 30 天</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="control-card">
                <div className="mb-2 flex items-center justify-between px-3">
                  <p className="eyebrow text-[var(--muted)]">读取范围</p>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                    {browseLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={switchToPagedMode}
                    disabled={browseMode === 'page' || loading || actionLoading}
                    className={`${getToggleButtonClass(browseMode === 'page')} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    分页
                  </button>
                  <button
                    onClick={() => void loadAllImages()}
                    disabled={loadingAll || actionLoading}
                    className={`${getToggleButtonClass(browseMode === 'all')} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {loadingAll ? `抓取中 ${loadedCount}` : '全部'}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="control-card">
                  <div className="mb-2 flex items-center justify-between px-3">
                    <p className="eyebrow text-[var(--muted)]">视图</p>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                      {viewLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={getToggleButtonClass(viewMode === 'grid')}
                    >
                      网格
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={getToggleButtonClass(viewMode === 'list')}
                    >
                      列表
                    </button>
                  </div>
                </div>

                <div className="control-card">
                  <div className="mb-2 flex items-center justify-between px-3">
                    <p className="eyebrow text-[var(--muted)]">时间排序</p>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                      {sortOrder === 'time-desc' ? '最新优先' : '最早优先'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSortOrder('time-desc')}
                      className={getToggleButtonClass(sortOrder === 'time-desc')}
                    >
                      新到旧
                    </button>
                    <button
                      onClick={() => setSortOrder('time-asc')}
                      className={getToggleButtonClass(sortOrder === 'time-asc')}
                    >
                      旧到新
                    </button>
                  </div>
                </div>
              </div>

              <div className={`control-card ${selectedImages.size > 0 ? 'bulk-action-active' : ''}`}>
                <div className="mb-2 flex items-center justify-between px-3">
                  <p className="eyebrow text-[var(--muted)]">操作</p>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                    {visibleSelectedCount > 0
                      ? `当前页已选 ${visibleSelectedCount}`
                      : '可操作'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={selectAllImages}
                    disabled={visibleImages.length === 0 || actionLoading}
                    className="button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isAllSelected ? '取消全选' : '全选可见'}
                  </button>
                  <button
                    onClick={() => void handleRefresh()}
                    disabled={loading || actionLoading || loadingAll}
                    className="button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => void deleteSelectedImages()}
                    disabled={selectedImages.size === 0 || actionLoading}
                    className="button-danger px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading ? '处理中...' : '删除'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {images.length === 0 ? (
          <div className="panel panel-light p-12 text-center sm:p-14">
            <p className="eyebrow text-[var(--muted)]">空图库</p>
            <p className="mt-4 font-display text-4xl text-[var(--ink)]">这里还没有图片</p>
            <p className="mt-3 text-sm leading-8 text-[var(--muted)]">
              先上传一些内容，再回来整理和复制链接。
            </p>
            <a
              href="/manage"
              className="button-primary mt-7"
            >
              去上传图片
            </a>
          </div>
        ) : visibleImages.length === 0 ? (
          <div className="panel panel-light p-12 text-center sm:p-14">
            <p className="eyebrow text-[var(--muted)]">无搜索结果</p>
            <p className="mt-4 font-display text-4xl text-[var(--ink)]">
              没找到匹配的文件名
            </p>
            <p className="mt-3 text-sm leading-8 text-[var(--muted)]">
              试试其他关键词，或清空搜索。
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="button-secondary mt-7"
            >
              清空搜索
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="gallery-grid grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleImages.map((image, index) => (
              <article
                key={image.key}
                className={`gallery-card group overflow-hidden rounded-[18px] border bg-white shadow-[0_14px_34px_rgba(57,91,120,0.06)] transition-all duration-300 ${
                  selectedImages.has(image.key)
                    ? 'border-[var(--accent)] shadow-[0_12px_32px_rgba(86,109,90,0.1)]'
                    : 'border-[var(--line)] hover:border-[var(--line-strong)] hover:shadow-[0_16px_36px_rgba(32,30,24,0.08)]'
                }`}
              >
                <div className="relative overflow-hidden bg-[var(--surface)]">
                  <button
                    type="button"
                    onClick={() => setActiveImage(image)}
                    className="block aspect-[5/4] w-full"
                  >
                    <img
                      src={image.url}
                      alt={getDisplayName(image.key)}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </button>
                  <div className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-[12px] border border-[var(--line)] bg-white/90 backdrop-blur">
                    <input
                      type="checkbox"
                      checked={selectedImages.has(image.key)}
                      onChange={() => toggleImageSelection(image.key)}
                      className="h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--paper)] text-[var(--accent)] focus:ring-[rgba(86,109,90,0.24)]"
                    />
                  </div>
                  <div className="gallery-card-actions" aria-label={`${getDisplayName(image.key)}快捷操作`}>
                    <button type="button" title="预览图片" aria-label="预览图片" onClick={() => setActiveImage(image)}>↗</button>
                    <button type="button" title="复制直链" aria-label="复制直链" onClick={() => void copyToClipboard(image.url, '直链')}>⧉</button>
                    <button type="button" title="删除图片" aria-label="删除图片" onClick={() => void deleteImage(image.key)}>×</button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(24,28,24,0.84)] via-[rgba(24,28,24,0.36)] to-transparent px-4 pb-4 pt-12">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(252,248,241,0.72)]">
                        第 {String(index + 1).padStart(2, '0')} 张  /  {getMimeLabel(image.mimeType)}
                      </p>
                      <h3
                        title={getDisplayName(image.key)}
                        className="mt-2 truncate text-[1.08rem] font-medium text-[var(--paper-strong)]"
                      >
                        {getDisplayStem(image.key)}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12px] text-[var(--muted)]" title={getDisplayName(image.key)}>
                      {getDisplayName(image.key)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-4 text-sm text-[var(--ink-soft)]">
                    <div className="min-w-0">
                      <p className="eyebrow text-[var(--muted)]">大小</p>
                      <p className="mt-2 font-medium text-[var(--ink)]">
                        {formatFileSize(image.size)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow text-[var(--muted)]">日期</p>
                      <p className="mt-2 font-medium text-[var(--ink)]">
                        {formatShortDate(image.uploadedAt)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow text-[var(--muted)]">格式</p>
                      <p className="mt-2 truncate font-medium text-[var(--ink)]">
                        {getFileExtension(image.key) || getMimeLabel(image.mimeType)}
                      </p>
                    </div>
                  </div>

                  <button type="button" onClick={() => setActiveImage(image)} className="gallery-detail-link">查看图片详情 <span aria-hidden="true">→</span></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel panel-light gallery-list-panel overflow-hidden p-3 sm:p-4">
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-sm text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={selectAllImages}
                  className="h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--paper)] text-[var(--accent)] focus:ring-[rgba(241,91,42,0.3)]"
                />
                <span>全选当前结果</span>
              </label>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                共 {visibleImages.length} 项
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {visibleImages.map((image, index) => (
                <article
                  key={image.key}
                  className={`gallery-list-item rounded-[16px] border bg-white p-4 transition-all duration-300 ${
                    selectedImages.has(image.key)
                      ? 'border-[var(--accent)] shadow-[0_12px_28px_rgba(86,109,90,0.08)]'
                      : 'border-[var(--line)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.9fr)_auto] xl:items-center">
                    <div className="flex min-w-0 items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedImages.has(image.key)}
                        onChange={() => toggleImageSelection(image.key)}
                        className="h-4 w-4 shrink-0 rounded border-[var(--line-strong)] bg-[var(--paper)] text-[var(--accent)] focus:ring-[rgba(241,91,42,0.3)]"
                      />
                      <button type="button" onClick={() => setActiveImage(image)} className="shrink-0">
                        <img
                          src={image.url}
                          alt={getDisplayName(image.key)}
                          className="h-20 w-20 rounded-[14px] object-cover"
                          loading="lazy"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          <span>第 {String(index + 1).padStart(2, '0')} 张</span>
                          <span className="h-px w-4 bg-[var(--line)]" />
                          <span>{getMimeLabel(image.mimeType)}</span>
                        </div>
                        <h3
                          title={getDisplayName(image.key)}
                          className="mt-2 truncate font-display text-[1.22rem] leading-tight text-[var(--ink)]"
                        >
                          {getDisplayStem(image.key)}
                        </h3>
                        <p className="mt-2 truncate font-mono text-[12px] text-[var(--muted)]" title={getDisplayName(image.key)}>
                          {getDisplayName(image.key)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3 xl:gap-5">
                      <div className="min-w-0">
                        <p className="eyebrow text-[var(--muted)]">大小</p>
                        <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                          {formatFileSize(image.size)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow text-[var(--muted)]">日期</p>
                        <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                          {formatShortDate(image.uploadedAt)}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--muted)]">
                          {formatClockTime(image.uploadedAt)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow text-[var(--muted)]">格式</p>
                        <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                          {getFileExtension(image.key) || getMimeLabel(image.mimeType)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 xl:w-[9rem]">
                      <button type="button" onClick={() => void copyToClipboard(image.url, '直链')} className={getActionButtonClass('secondary')} title="复制直链">⧉</button>
                      <button type="button" onClick={() => setActiveImage(image)} className={getActionButtonClass('ghost')} title="图片详情">详情</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {browseMode === 'page' && images.length > 0 ? (
          <div className="panel panel-light p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-[var(--muted)]">分页浏览</p>
                <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">
                  第 {pageIndex + 1} 页，当前显示 {visibleImages.length} / {images.length} 张
                  {nextCursor ? '，后面还有更多' : '，已经到尾页'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={goToPreviousPage}
                  disabled={pageIndex === 0 || loading}
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <div className="status-pill bg-[var(--ink)] text-[var(--paper-strong)]">
                  {pageIndex + 1}
                </div>
                <button
                  onClick={goToNextPage}
                  disabled={!nextCursor || loading}
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {browseMode === 'all' && images.length > 0 ? (
          <div className="panel panel-muted p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-[var(--muted)]">全量读取完成</p>
                <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">
                  已加载 {images.length} 张，当前显示 {visibleImages.length} 张。
                </p>
              </div>
              <div className="status-pill text-[var(--ink-soft)]">
                当前为全量模式
              </div>
            </div>
          </div>
        ) : null}

        <ToastManager toasts={toasts} removeToast={removeToast} />
      </div>

      {activeImage ? (
          <div
          className="gallery-lightbox fixed inset-0 z-[70] flex items-stretch justify-end backdrop-blur-sm"
          onClick={() => setActiveImage(null)}
        >
          <div
            className="gallery-lightbox-inner image-detail-drawer-shell grid h-full w-full max-w-[560px] grid-cols-1 gap-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--paper-strong)] shadow-[0_20px_80px_rgba(13,30,49,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gallery-lightbox-media flex min-h-[280px] items-center justify-center p-5">
              <img
                src={activeImage.url}
                alt={getDisplayName(activeImage.key)}
                className="max-h-[42vh] w-auto max-w-full rounded-[16px] object-contain shadow-[0_18px_50px_rgba(24,30,24,0.14)]"
              />
            </div>
            <aside className="gallery-lightbox-details image-detail-drawer flex flex-col justify-between gap-6 border-t border-[var(--line)] p-6 text-[var(--ink)]">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <p className="eyebrow text-[var(--muted)]">当前图片</p>
                  <button
                    type="button"
                    onClick={() => setActiveImage(null)}
                    className="button-ghost px-4 py-3"
                  >
                    关闭
                  </button>
                </div>
                <h3 className="mt-5 break-words font-display text-4xl leading-tight text-[var(--ink)]">
                  {getDisplayName(activeImage.key)}
                </h3>
                <p className="mt-4 break-all text-sm leading-7 text-[var(--ink-soft)]">
                  {activeImage.key}
                </p>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.54)] p-4">
                  <p className="eyebrow text-[var(--muted)]">文件信息</p>
                  <div className="mt-4 space-y-3 text-sm text-[var(--ink-soft)]">
                    <div className="flex justify-between gap-4">
                      <span>文件大小</span>
                      <span>{formatFileSize(activeImage.size)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>类型</span>
                      <span>{activeImage.mimeType}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>上传时间</span>
                      <span>{formatDateTime(activeImage.uploadedAt)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="eyebrow text-[var(--muted)]">复制格式</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => void copyToClipboard(getCopyText(activeImage, 'url'), '直链')}
                      className={getActionButtonClass('secondary')}
                    >
                      直链
                    </button>
                    <button
                      onClick={() => void copyToClipboard(getCopyText(activeImage, 'markdown'), 'Markdown')}
                      className={getActionButtonClass('ghost')}
                    >
                      Markdown
                    </button>
                    <button
                      onClick={() => void copyToClipboard(getCopyText(activeImage, 'html'), 'HTML')}
                      className={getActionButtonClass('ghost')}
                    >
                      HTML
                    </button>
                    <button
                      onClick={() => void copyToClipboard(getCopyText(activeImage, 'bbcode'), 'BBCode')}
                      className={getActionButtonClass('ghost')}
                    >
                      BBCode
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void deleteImage(activeImage.key)}
                    className={getActionButtonClass('danger')}
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setActiveImage(null)}
                    className={getActionButtonClass('ghost')}
                  >
                    关闭详情
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}
