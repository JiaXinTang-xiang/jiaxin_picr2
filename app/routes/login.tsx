import { redirect } from 'react-router';

import type { Route } from './+types/login';
import AppShell from '~/components/AppShell';
import LoginForm from '~/components/LoginForm';
import { getSafeNextPath, isAuthenticated } from '~/lib/session.server';

export const meta: Route.MetaFunction = () => [{ title: '登录 - Lightframe Archive' }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const nextPath = getSafeNextPath(url.searchParams.get('next') || '/manage');

  if (await isAuthenticated(request)) {
    throw redirect(nextPath);
  }

  return { nextPath };
}

export default function LoginRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell>
      <div className="login-layout">
        <div className="login-art"><img src="/brand/hero-close.jpg" alt="Lightframe 视觉插图" /><div className="login-art-overlay"><p className="eyebrow">LIGHTFRAME / CONTROL ROOM</p><p>让每一张图片，都有一个清晰的位置。</p></div></div>
        <LoginForm nextPath={loaderData.nextPath} />
      </div>
    </AppShell>
  );
}
