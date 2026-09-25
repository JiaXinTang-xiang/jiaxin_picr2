import { Link } from 'react-router';

import type { Route } from './+types/home-public';
import AppShell from '~/components/AppShell';

export const meta: Route.MetaFunction = () => [
  { title: 'Lightframe — 轻盈的公开画廊' },
  { name: 'description', content: 'Lightframe 是一个面向创作者的图片归档与公开画廊。' },
];

export default function PublicHomeRoute() {
  return (
    <AppShell>
    <div className="public-page">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow accent-eyebrow">LIGHTFRAME / PUBLIC ARCHIVE</p>
          <h1 className="hero-title">把灵感，<br /><span>放在光里。</span></h1>
          <p className="hero-description">
            一个安静、清晰的图片归档空间。浏览公开画廊，也可以进入管理工作台整理自己的图片。
          </p>
          <div className="hero-actions">
            <Link to="/gallery" className="button-primary button-large">浏览公开画廊 <span>↗</span></Link>
            <Link to="/login" className="button-secondary button-large">进入管理台</Link>
          </div>
          <div className="hero-stats">
            <div><strong>R2</strong><span>可靠存储</span></div>
            <div><strong>WEBP</strong><span>轻量传输</span></div>
            <div><strong>24/7</strong><span>随时可见</span></div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-glow" />
          <div className="hero-image-card hero-image-back">
            <img src="/brand/hero-close.jpg" alt="Lightframe 视觉插图" />
          </div>
          <div className="hero-image-card hero-image-front">
            <img src="/brand/hero-full.jpg" alt="Lightframe 视觉插图" />
            <div className="hero-image-caption"><span>featured image</span><strong>轻盈 · 清澈 · 可见</strong></div>
          </div>
          <div className="hero-avatar"><img src="/brand/avatar.png" alt="Lightframe 头像" /></div>
        </div>
      </section>

      <section className="public-feature-grid">
        <article className="feature-card feature-card-accent"><span className="feature-index">01</span><h2>公开画廊</h2><p>只展示 gallery/ 目录中的内容，让分享范围清晰可控。</p><Link to="/gallery">去看看 →</Link></article>
        <article className="feature-card"><span className="feature-index">02</span><h2>快速归档</h2><p>拖拽、粘贴、文件夹上传，保留你的目录组织方式。</p><Link to="/login">开始管理 →</Link></article>
        <article className="feature-card"><span className="feature-index">03</span><h2>轻量分享</h2><p>打开图片详情即可复制直链或 Markdown，适合博客和文档。</p><Link to="/about">了解更多 →</Link></article>
      </section>
    </div>
    </AppShell>
  );
}
