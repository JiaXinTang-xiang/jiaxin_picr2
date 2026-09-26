import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '../hooks/useToast';
import { ToastManager } from './Toast';

interface PublicImage {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface PublicResponse {
  success: boolean;
  data?: PublicImage[];
  error?: string;
  details?: string;
  pagination?: { nextCursor: string | null; hasMore: boolean };
}

interface VirtualAlbum {
  name: string;
  prefix: string;
  count: number;
  cover: PublicImage | null;
}

interface AlbumsResponse {
  success: boolean;
  data?: VirtualAlbum[];
  error?: string;
  details?: string;
}

const formatSize = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const fileName = (key: string) => key.split('/').pop() || key;
const dateLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric',
}).format(new Date(value));

export default function PublicGallery() {
  const [images, setImages] = useState<PublicImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<PublicImage | null>(null);
  const [query, setQuery] = useState('');
  const [albumFilter, setAlbumFilter] = useState('');
  const [albums, setAlbums] = useState<VirtualAlbum[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const { toasts, removeToast } = useToast();

  const load = async (cursor?: string | null, append = false, requestedAlbum = albumFilter) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '48' });
      if (cursor) params.set('cursor', cursor);
      if (requestedAlbum) params.set('prefix', requestedAlbum);
      const response = await fetch(`/api/gallery?${params}`);
      const result = (await response.json().catch(() => ({}))) as PublicResponse;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || result.details || '公开画廊暂时不可用');
      }
      setImages((previous) => append ? [...previous, ...result.data!] : result.data!);
      setNextCursor(result.pagination?.nextCursor || null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const loadAlbums = async () => {
    try {
      setAlbumsLoading(true);
      const response = await fetch('/api/gallery?mode=albums');
      const result = (await response.json().catch(() => ({}))) as AlbumsResponse;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || result.details || '相册列表暂时不可用');
      }
      setAlbums(result.data);
    } catch (reason) {
      console.error('加载公开相册失败:', reason);
    } finally {
      setAlbumsLoading(false);
    }
  };

  useEffect(() => {
    void loadAlbums();
    void load();
  }, []);
  useEffect(() => {
    if (!activeImage) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImage(null);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [activeImage]);

  const visibleImages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? images.filter((image) => image.key.toLowerCase().includes(normalized)) : images;
  }, [images, query]);

  const activeAlbum = albums.find((album) => album.prefix === albumFilter);
  const selectAlbum = (prefix: string) => {
    setAlbumFilter(prefix);
    setImages([]);
    setNextCursor(null);
    void load(null, false, prefix);
  };

  return (
    <div className="public-page gallery-page">
      <section className="gallery-heading">
        <div>
          <p className="eyebrow accent-eyebrow">PUBLIC / GALLERY</p>
          <h1 className="section-title">公开画廊</h1>
          <p className="section-description">这里收录了 gallery/ 目录下愿意被看见的图片。</p>
        </div>
        <div className="gallery-heading-actions">
          <Link to="/" className="button-secondary">返回首页</Link>
          <Link to="/login" className="button-primary">管理登录</Link>
        </div>
      </section>

      <section className="gallery-toolbar">
        <div className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名" /></div>
        <div className="gallery-count">{visibleImages.length} 张可见图片{activeAlbum ? ` · ${activeAlbum.name}` : ''}</div>
      </section>

      <section className="gallery-album-strip" aria-label="公开相册">
        <div className="gallery-album-strip-heading">
          <div><p className="eyebrow accent-eyebrow">VIRTUAL ALBUMS</p><h2>按相册浏览</h2></div>
          <span>{albumsLoading ? '读取中…' : `${albums.length} 个目录`}</span>
        </div>
        <div className="gallery-album-list">
          <button type="button" className={`gallery-album-card ${!albumFilter ? 'is-active' : ''}`} onClick={() => selectAlbum('')}>
            <span className="gallery-album-cover gallery-album-cover-all">全部</span>
            <span><strong>全部图片</strong><small>{albums.reduce((sum, album) => sum + album.count, 0)} 张</small></span>
          </button>
          {albums.map((album) => (
            <button type="button" key={album.prefix} className={`gallery-album-card ${albumFilter === album.prefix ? 'is-active' : ''}`} onClick={() => selectAlbum(album.prefix)}>
              <span className="gallery-album-cover">{album.cover ? <img src={album.cover.url} alt="" loading="lazy" /> : null}</span>
              <span><strong>{album.name}</strong><small>{album.count} 张</small></span>
            </button>
          ))}
        </div>
      </section>

      {loading && images.length === 0 ? (
        <div className="empty-state"><div className="loader-dot" /><p>正在打开画廊…</p></div>
      ) : error ? (
        <div className="empty-state"><img src="/brand/avatar.png" alt="" /><h2>画廊暂时离线</h2><p>{error}</p><button className="button-primary" onClick={() => void load()}>重新加载</button></div>
      ) : visibleImages.length === 0 ? (
        <div className="empty-state"><img src="/brand/avatar.png" alt="" /><h2>{activeAlbum ? '这个相册还没有图片' : '还没有公开图片'}</h2><p>{activeAlbum ? '请选择其他虚拟相册，或回到全部图片。' : '登录管理台后，把图片上传到 gallery/ 目录即可在这里展示。'}</p><Link to="/login" className="button-primary">进入管理台</Link></div>
      ) : (
        <div className="public-gallery-grid">
          {visibleImages.map((image, index) => (
            <article className="public-image-card" key={image.key}>
              <button className="public-image-frame" onClick={() => setActiveImage(image)} aria-label={`查看 ${fileName(image.key)}`}>
                <img src={image.url} alt={fileName(image.key)} loading={index < 8 ? 'eager' : 'lazy'} />
                <span className="image-hover-label">查看详情 ↗</span>
              </button>
              <div className="public-image-meta">
                <div><h2 title={fileName(image.key)}>{fileName(image.key)}</h2><p>{dateLabel(image.uploadedAt)} · {formatSize(image.size)}</p></div>
                <span className="public-image-format">{image.mimeType.replace('image/', '').toUpperCase()}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && nextCursor ? <div className="load-more"><button className="button-secondary" onClick={() => void load(nextCursor, true)}>加载更多</button></div> : null}
      <ToastManager toasts={toasts} removeToast={removeToast} />

      {activeImage ? (
        <div className="gallery-lightbox fixed inset-0 z-[80] flex items-stretch justify-end backdrop-blur-sm" onClick={() => setActiveImage(null)}>
          <section className="gallery-lightbox-inner image-detail-drawer-shell grid h-full w-full max-w-[560px] grid-cols-1 gap-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--paper-strong)] shadow-[0_20px_80px_rgba(13,30,49,0.24)]" onClick={(event) => event.stopPropagation()} aria-label="图片详情">
            <div className="gallery-lightbox-media flex min-h-[280px] items-center justify-center p-5">
              <img src={activeImage.url} alt={fileName(activeImage.key)} className="max-h-[42vh] w-auto max-w-full rounded-[16px] object-contain shadow-[0_18px_50px_rgba(24,30,24,0.14)]" />
            </div>
            <aside className="gallery-lightbox-details flex flex-col gap-6 border-t border-[var(--line)] p-6 text-[var(--ink)]">
              <div className="flex items-start justify-between gap-4">
                <div><p className="eyebrow accent-eyebrow">公开图片</p><h2 className="mt-3 break-words text-2xl font-bold">{fileName(activeImage.key)}</h2></div>
                <button type="button" onClick={() => setActiveImage(null)} className="icon-button" aria-label="关闭详情">×</button>
              </div>
              <p className="break-all rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs leading-6 text-[var(--ink-soft)]">{activeImage.key}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="detail-metric"><dt>文件大小</dt><dd>{formatSize(activeImage.size)}</dd></div>
                <div className="detail-metric"><dt>图片格式</dt><dd>{activeImage.mimeType}</dd></div>
                <div className="detail-metric col-span-2"><dt>上传时间</dt><dd>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activeImage.uploadedAt))}</dd></div>
              </dl>
              <p className="public-view-notice">游客浏览模式 · 管理操作仅对管理员开放</p>
            </aside>
          </section>
        </div>
      ) : null}
    </div>
  );
}
