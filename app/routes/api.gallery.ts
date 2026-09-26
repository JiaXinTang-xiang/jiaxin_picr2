import type { Route } from './+types/api.gallery';
import { listImages, listVirtualAlbums } from '~/lib/r2.server';
import { clampImageListLimit } from '~/lib/images-api';

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('mode') === 'albums') {
      const albums = await listVirtualAlbums('gallery/');
      return Response.json(
        { success: true, data: albums },
        { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
      );
    }

    const rawLimit = Number.parseInt(url.searchParams.get('limit') || '48', 10);
    const limit = clampImageListLimit(Number.isFinite(rawLimit) ? rawLimit : 48);
    const cursor = url.searchParams.get('cursor');
    const requestedPrefix = url.searchParams.get('prefix')?.trim() || 'gallery/';
    const prefix = requestedPrefix.startsWith('gallery/') && !requestedPrefix.includes('..')
      ? requestedPrefix
      : 'gallery/';
    const result = await listImages(prefix, limit, cursor);

    return Response.json(
      { success: true, data: result.images, pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore } },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    );
  } catch (error) {
    console.error('Public gallery error:', error);
    return Response.json(
      { error: 'Failed to load public gallery', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
