import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '../hooks/useToast';
import { ToastManager } from './Toast';

interface PublicImage { key: string; url: string; size: number; mimeType: string; uploadedAt: string }
interface PublicResponse { success: boolean; data?: PublicImage[]; error?: string; details?: string; pagination?: { nextCursor: string | null; hasMore: boolean } }

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const fileName = (key: string) => key.split('/').pop() || key;
const dateLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));

export default function PublicGallery() {
  const [images, setImages] = useState<PublicImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<PublicImage | null>(null);
  const [query, setQuery] = useState('');
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const load = async (cursor?: string | null, append = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '48' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/gallery?${params}`);
      const result = (await response.json().catch(() => ({}))) as PublicResponse;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || result.details || '公开画廊暂时不可用');
      setImages((previous) => append ? [...previous, ...result.data!] : result.data!);
      setNextCursor(result.pagination?.nextCursor || null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '网络错误');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!activeImage) return; const close = (event: KeyboardEvent) => event.key === 'Escape' && setActiveImage(null); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [activeImage]);

  const visibleImages = useMemo(() => { const normalized = query.trim().toLowerCase(); return normalized ? images.filter((image) => image.key.toLowerCase().includes(normalized)) : images; }, [images, query]);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); showSuccess('链接已复制', 1800); } catch { showError('复制失败，请手动复制'); } };

  return <div className="public-page gallery-page">
    <section className="gallery-heading"><div><p className="eyebrow accent-eyebrow">PUBLIC / GALLERY</p><h1 className="section-title">公开画廊</h1><p className="section-description">这里收录了 gallery/ 目录下愿意被看见的图片。</p></div><div className="gallery-heading-actions"><Link to="/" className="button-secondary">返回首页</Link><Link to="/login" className="button-primary">管理登录</Link></div></section>
    <section className="gallery-toolbar"><div className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名" /></div><div className="gallery-count">{visibleImages.length} 张可见图片</div></section>
    {loading && images.length === 0 ? <div className="empty-state"><div className="loader-dot" /><p>正在打开画廊…</p></div> : error ? <div className="empty-state"><img src="/brand/avatar.png" alt="" /><h2>画廊暂时离线</h2><p>{error}</p><button className="button-primary" onClick={() => void load()}>重新加载</button></div> : visibleImages.length === 0 ? <div className="empty-state"><img src="/brand/avatar.png" alt="" /><h2>还没有公开图片</h2><p>登录管理台后，把图片上传到 gallery/ 目录即可在这里展示。</p><Link to="/login" className="button-primary">进入管理台</Link></div> : <div className="public-gallery-grid">{visibleImages.map((image, index) => <article className="public-image-card" key={image.key}><button className="public-image-frame" onClick={() => setActiveImage(image)}><img src={image.url} alt={fileName(image.key)} loading={index < 8 ? 'eager' : 'lazy'} /><span className="image-hover-label">查看大图 ↗</span></button><div className="public-image-meta"><div><h2 title={fileName(image.key)}>{fileName(image.key)}</h2><p>{dateLabel(image.uploadedAt)} · {formatSize(image.size)}</p></div><button className="icon-button" title="复制链接" onClick={() => void copy(image.url)}>↗</button></div></article>)}</div>}
    {!loading && !error && nextCursor ? <div className="load-more"><button className="button-secondary" onClick={() => void load(nextCursor, true)}>加载更多</button></div> : null}
    <ToastManager toasts={toasts} removeToast={removeToast} />
    {activeImage ? <div className="public-lightbox" onClick={() => setActiveImage(null)}><div className="public-lightbox-inner" onClick={(event) => event.stopPropagation()}><button className="lightbox-close" onClick={() => setActiveImage(null)}>×</button><img src={activeImage.url} alt={fileName(activeImage.key)} /><aside><p className="eyebrow accent-eyebrow">IMAGE PREVIEW</p><h2>{fileName(activeImage.key)}</h2><p>{activeImage.key}</p><div className="lightbox-actions"><button className="button-primary" onClick={() => void copy(activeImage.url)}>复制直链</button><button className="button-secondary" onClick={() => void copy(`![${fileName(activeImage.key)}](${activeImage.url})`)}>复制 Markdown</button></div></aside></div></div> : null}
  </div>;
}
