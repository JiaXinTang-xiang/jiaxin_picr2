import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import mimeTypes from 'mime-types';
import { createObjectKey, type NamingStrategy } from './upload-path';

export interface UploadOptions {
  directory?: string;
  relativePath?: string;
  namingStrategy?: NamingStrategy;
}

export interface ImageInfo {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface ListImagesResult {
  images: ImageInfo[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DeleteImagesResult {
  deleted: string[];
  failed: Array<{
    key: string;
    error: string;
  }>;
}

export interface VirtualAlbumInfo {
  name: string;
  prefix: string;
  count: number;
  cover: ImageInfo | null;
}

export interface MoveToGalleryResult {
  moved: Array<{ source: string; target: string; url: string }>;
  skipped: Array<{ source: string; reason: string }>;
  failed: Array<{ source: string; error: string }>;
}

type RequiredEnvKey =
  | 'R2_ACCESS_KEY_ID'
  | 'R2_SECRET_ACCESS_KEY'
  | 'R2_BUCKET_NAME'
  | 'R2_ENDPOINT'
  | 'R2_PUBLIC_URL';

let r2ClientSingleton: S3Client | null = null;

function getRequiredEnv(key: RequiredEnvKey): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is not configured`);
  }

  return value;
}

function getR2Client(): S3Client {
  if (!r2ClientSingleton) {
    r2ClientSingleton = new S3Client({
      region: 'auto',
      endpoint: getRequiredEnv('R2_ENDPOINT'),
      credentials: {
        accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
  }

  return r2ClientSingleton;
}

function getBucketName(): string {
  return getRequiredEnv('R2_BUCKET_NAME');
}

function getPublicUrlBase(): string {
  const configuredUrl = getRequiredEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return /^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`;
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getMimeType(objectKey: string, fallback?: string | null): string {
  return fallback || mimeTypes.lookup(objectKey) || 'application/octet-stream';
}

function toImageInfo(
  key: string,
  size: number,
  uploadedAt: Date,
  mimeType: string
): ImageInfo {
  return {
    key,
    url: `${getPublicUrlBase()}/${encodeObjectKey(key)}`,
    size,
    mimeType,
    uploadedAt,
  };
}

export async function uploadImage(file: File, options: UploadOptions = {}): Promise<ImageInfo> {
  const extFromMime = mimeTypes.extension(file.type) || 'bin';
  const normalizedOriginalName = file.name.includes('.')
    ? file.name
    : `${file.name}.${extFromMime}`;
  const body = Buffer.from(await file.arrayBuffer());
  const key = createObjectKey({
    originalName: normalizedOriginalName,
    body,
    directory: options.directory,
    relativePath: options.relativePath,
    namingStrategy: options.namingStrategy,
  });

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: file.type || getMimeType(key),
      CacheControl: 'public, max-age=31536000',
    })
  );

  return toImageInfo(
    key,
    body.length,
    new Date(),
    file.type || getMimeType(key)
  );
}

export async function listImages(
  prefix = '',
  maxKeys = 60,
  cursor?: string | null
): Promise<ListImagesResult> {
  const result = await getR2Client().send(
    new ListObjectsV2Command({
      Bucket: getBucketName(),
      Prefix: prefix || undefined,
      MaxKeys: Math.min(Math.max(maxKeys, 1), 1000),
      ContinuationToken: cursor || undefined,
    })
  );

  return {
    images: (result.Contents || [])
      .filter((object): object is typeof object & { Key: string } => Boolean(object.Key))
      .map((object) =>
        toImageInfo(
          object.Key,
          object.Size || 0,
          object.LastModified || new Date(),
          getMimeType(object.Key)
        )
      ),
    nextCursor: result.NextContinuationToken || null,
    hasMore: Boolean(result.IsTruncated && result.NextContinuationToken),
  };
}

async function deleteImage(key: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}

export async function listVirtualAlbums(rootPrefix = 'gallery/'): Promise<VirtualAlbumInfo[]> {
  const normalizedRoot = rootPrefix.endsWith('/') ? rootPrefix : `${rootPrefix}/`;
  const collected: ImageInfo[] = [];
  let cursor: string | null = null;

  do {
    const result = await listImages(normalizedRoot, 1000, cursor);
    collected.push(...result.images);
    cursor = result.nextCursor;
  } while (cursor);

  const albums = new Map<string, VirtualAlbumInfo>();
  for (const image of collected) {
    const relativeKey = image.key.slice(normalizedRoot.length);
    const slashIndex = relativeKey.indexOf('/');
    const prefix = slashIndex >= 0
      ? `${normalizedRoot}${relativeKey.slice(0, slashIndex)}/`
      : normalizedRoot;
    const name = prefix === normalizedRoot ? '根目录' : prefix.slice(normalizedRoot.length, -1);
    const existing = albums.get(prefix);
    if (existing) {
      existing.count += 1;
      if (!existing.cover || image.uploadedAt < existing.cover.uploadedAt) {
        existing.cover = image;
      }
    } else {
      albums.set(prefix, { name, prefix, count: 1, cover: image });
    }
  }

  return [...albums.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

async function getObjectIdentity(key: string): Promise<{ etag: string; size: number } | null> {
  try {
    const result = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    );
    return {
      etag: result.ETag || '',
      size: result.ContentLength || 0,
    };
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
    const status = error && typeof error === 'object' && '$metadata' in error
      ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
      : 0;

    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
      return null;
    }

    throw error;
  }
}

async function moveImageToGallery(source: string): Promise<{ source: string; target: string; url: string } | { source: string; skipped: string }> {
  const normalizedSource = source.trim().replace(/^\/+/, '');
  if (!normalizedSource || normalizedSource.includes('..') || normalizedSource.includes('\\')) {
    throw new Error('Invalid source key');
  }

  if (normalizedSource.startsWith('gallery/')) {
    return { source: normalizedSource, skipped: 'already-public' };
  }

  const target = `gallery/${normalizedSource}`;
  const existingTarget = await getObjectIdentity(target);
  if (existingTarget) {
    const sourceIdentity = await getObjectIdentity(normalizedSource);
    if (sourceIdentity && sourceIdentity.etag === existingTarget.etag && sourceIdentity.size === existingTarget.size) {
      await deleteImage(normalizedSource);
      return {
        source: normalizedSource,
        target,
        url: `${getPublicUrlBase()}/${encodeObjectKey(target)}`,
      };
    }
    return { source: normalizedSource, skipped: 'target-exists' };
  }

  await getR2Client().send(
    new CopyObjectCommand({
      Bucket: getBucketName(),
      Key: target,
      CopySource: encodeCopySource(getBucketName(), normalizedSource),
      CacheControl: 'public, max-age=31536000',
    })
  );

  try {
    await deleteImage(normalizedSource);
  } catch (error) {
    try {
      await deleteImage(target);
    } catch (rollbackError) {
      console.error('Failed to roll back gallery move:', rollbackError);
    }
    throw error;
  }

  return {
    source: normalizedSource,
    target,
    url: `${getPublicUrlBase()}/${encodeObjectKey(target)}`,
  };
}

export async function moveImagesToGallery(keys: string[]): Promise<MoveToGalleryResult> {
  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  const results = await Promise.allSettled(uniqueKeys.map((key) => moveImageToGallery(key)));

  return results.reduce<MoveToGalleryResult>(
    (accumulator, result, index) => {
      const source = uniqueKeys[index];

      if (result.status === 'fulfilled') {
        if ('skipped' in result.value) {
          accumulator.skipped.push({ source, reason: result.value.skipped });
        } else {
          accumulator.moved.push(result.value);
        }
        return accumulator;
      }

      accumulator.failed.push({
        source,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      });
      return accumulator;
    },
    { moved: [], skipped: [], failed: [] }
  );
}

export async function deleteImages(keys: string[]): Promise<DeleteImagesResult> {
  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  const results = await Promise.allSettled(uniqueKeys.map((key) => deleteImage(key)));

  return results.reduce<DeleteImagesResult>(
    (accumulator, result, index) => {
      const key = uniqueKeys[index];

      if (result.status === 'fulfilled') {
        accumulator.deleted.push(key);
        return accumulator;
      }

      accumulator.failed.push({
        key,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      });
      return accumulator;
    },
    {
      deleted: [],
      failed: [],
    }
  );
}

export function getMaxFileSize(): number {
  const value = process.env.MAX_FILE_SIZE || '10485760';
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 10485760;
}
