import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  route('login', 'routes/login.tsx'),
  index('routes/home-public.tsx'),
  route('gallery', 'routes/public-gallery.tsx'),
  route('about', 'routes/about.tsx'),
  route('manage', 'routes/manage.tsx', [
    index('routes/home.tsx'),
    route('gallery', 'routes/gallery.tsx'),
  ]),
  route('api/upload', 'routes/api.upload.ts'),
  route('api/images', 'routes/api.images.ts'),
  route('api/gallery', 'routes/api.gallery.ts'),
  route('api/auth/login', 'routes/api.auth.login.ts'),
  route('api/auth/logout', 'routes/api.auth.logout.ts'),
  route('api/auth/verify', 'routes/api.auth.verify.ts'),
] satisfies RouteConfig;
