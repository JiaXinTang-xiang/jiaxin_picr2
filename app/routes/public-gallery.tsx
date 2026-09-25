import PublicGallery from '~/components/PublicGallery';
import type { Route } from './+types/public-gallery';
import AppShell from '~/components/AppShell';

export const meta: Route.MetaFunction = () => [{ title: '公开画廊 — Lightframe' }];

export default function PublicGalleryRoute() {
  return <AppShell><PublicGallery /></AppShell>;
}
