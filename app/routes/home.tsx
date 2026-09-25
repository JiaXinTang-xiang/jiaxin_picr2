import type { Route } from './+types/home';

import ImageUploader from '~/components/ImageUploader';

export const meta: Route.MetaFunction = () => [{ title: '管理工作台 - Lightframe Archive' }];

export default function HomeRoute() {
  return <ImageUploader />;
}
