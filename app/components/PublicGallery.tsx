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
const fileStem = (key: string) => fileName(key).replace(/\.[^.]+$/, '');
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
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const { toasts, removeToast, showSuccess, showError } = useToast();

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
    if (!activeImage && !albumMenuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveImage(null);
        setAlbumMenuOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [activeImage, albumMenuOpen]);

  const visibleImages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? images.filter((image) => image.key.toLowerCase().includes(normalized)) : images;
  }, [images, query]);

  const activeAlbum = albums.find((album) => album.prefix === albumFilter);
  const selectAlbum = (prefix: string) => {
    setAlbumFilter(prefix);
    setAlbumMenuOpen(false);
    setImages([]);
    setNextCursor(null);
    void load(null, false, prefix);
  };

  const copyLink = async (image: PublicImage) => {
    try {
      await navigator.clipboard.writeText(image.url);
      showSuccess('已复制图片直链', 1800);
    } catch {
      showError('复制失败，请手动复制图片地址');
    }
  };

  const albumCount = albums.reduce((sum, album) => sum + album.count, 0);

  return (
    <div className="lopic-gallery">
      <header className="lopic-gallery-topbar">
        <Link to="/" className="lopic-gallery-logo" aria-label="返回 Lightframe 首页">LIGHTFRAME</Link>

        <div className="lopic-gallery-console">
          <div className="lopic-gallery-console-inner">
            <div className="lopic-album-picker">
              <button type="button" className="lopic-album-toggle" onClick={() => setAlbumMenuOpen((open) => !open)} aria-expanded={albumMenuOpen}>
                <span>{activeAlbum?.name || '全部图片'}</span><span className="lopic-chevron">⌄</span>
              </button>
              {albumMenuOpen ? (
                <div className="lopic-album-menu">
                  <button type="button" className={!albumFilter ? 'is-active' : ''} onClick={() => selectAlbum('')}>全部图片 <span>{albumCount}</span></button>
                  {albums.map((album) => (
                    <button type="button" key={album.prefix} className={albumFilter === album.prefix ? 'is-active' : ''} onClick={() => selectAlbum(album.prefix)}>
                      {album.name} <span>{album.count}</span>
                    </button>
                  ))}
                  {albumsLoading ? <p>读取相册中…</p> : null}
                </div>
              ) : null}
            </div>
            <div className="lopic-gallery-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名" />
              {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">×</button> : null}
            </div>
          </div>
        </div>

        <div className="lopic-gallery-actions">
          <span className="lopic-gallery-total">{visibleImages.length} / {albumCount || images.length}</span>
          <Link to="/login" className="lopic-gallery-login">管理</Link>
        </div>
      </header>

      <main className="lopic-gallery-content">
        <div className="lopic-gallery-heading">
          <div>
            <p className="lopic-gallery-kicker">PUBLIC COLLECTION / {activeAlbum?.name || 'ALL IMAGES'}</p>
            <h1>{activeAlbum?.name || 'Lightframe Gallery'}</h1>
          </div>
          <p className="lopic-gallery-subtitle">游客浏览模式 · {activeAlbum ? `${activeAlbum.count} 张图片` : '按目录整理的公开图片'}</p>
        </div>

        {loading && images.length === 0 ? (
          <div className="lopic-gallery-state"><div className="lopic-spinner" /><p>正在打开画廊…</p></div>
        ) : error ? (
          <div className="lopic-gallery-state"><p>画廊暂时离线</p><small>{error}</small><button type="button" onClick={() => void load()} className="lopic-gallery-retry">重新加载</button></div>
        ) : visibleImages.length === 0 ? (
          <div className="lopic-gallery-state"><p>NO DATA</p><small>{activeAlbum ? '这个相册还没有匹配的图片。' : '还没有公开图片。'}</small></div>
        ) : (
          <div className="lopic-waterfall">
            {visibleImages.map((image, index) => (
              <article className="lopic-artwork-card" key={image.key} style={{ '--card-index': index } as React.CSSProperties}>
                <button type="button" className="lopic-artwork-button" onClick={() => setActiveImage(image)} aria-label={`查看 ${fileName(image.key)}`}>
                  <img src={image.url} alt={fileName(image.key)} loading={index < 8 ? 'eager' : 'lazy'} />
                  <span className="lopic-card-glow" />
                  <span className="lopic-artwork-overlay">
                    <span className="lopic-artwork-meta"><strong>{fileStem(image.key)}</strong><small>点击查看详情</small></span>
                    <span className="lopic-artwork-open">↗</span>
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}

        {!loading && !error && nextCursor ? <div className="lopic-gallery-load-more"><button type="button" onClick={() => void load(nextCursor, true)}>加载更多 <span>↓</span></button></div> : null}
        {!loading && !error && images.length > 0 && !nextCursor ? <p className="lopic-gallery-end">END OF COLLECTION</p> : null}
      </main>

      <footer className="lopic-gallery-footer"><span>LIGHTFRAME</span><i /> <span>PUBLIC ARCHIVE</span><i /> <span>{new Date().getFullYear()}</span></footer>
      <ToastManager toasts={toasts} removeToast={removeToast} />

      {activeImage ? (
        <div className="lopic-fullscreen-modal" onClick={() => setActiveImage(null)}>
          <section className="lopic-modal-content" onClick={(event) => event.stopPropagation()} aria-label="图片详情">
            <button type="button" className="lopic-modal-close" onClick={() => setActiveImage(null)} aria-label="关闭详情">×</button>
            <div className="lopic-modal-image-wrap"><img src={activeImage.url} alt={fileName(activeImage.key)} /></div>
            <aside className="lopic-modal-info">
              <p className="lopic-gallery-kicker">PUBLIC IMAGE</p>
              <h2>{fileName(activeImage.key)}</h2>
              <dl>
                <div><dt>文件大小</dt><dd>{formatSize(activeImage.size)}</dd></div>
                <div><dt>类型</dt><dd>{activeImage.mimeType}</dd></div>
                <div><dt>上传时间</dt><dd>{dateLabel(activeImage.uploadedAt)}</dd></div>
                <div><dt>所在目录</dt><dd>{activeImage.key.slice(0, activeImage.key.lastIndexOf('/') + 1) || '根目录'}</dd></div>
              </dl>
              <div className="lopic-modal-actions">
                <button type="button" onClick={() => void copyLink(activeImage)}>复制直链</button>
                <a href={activeImage.url} target="_blank" rel="noreferrer">查看原图 ↗</a>
              </div>
              <p className="lopic-modal-notice">游客浏览模式 · 管理操作仅对管理员开放</p>
            </aside>
          </section>
        </div>
      ) : null}
    </div>
  );
}
