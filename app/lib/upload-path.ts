import { createHash, randomUUID } from 'node:crypto';

export type NamingStrategy = 'preserve' | 'hash-suffix' | 'random';

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

export function sanitizePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) =>
      segment.toLowerCase().replace(SAFE_SEGMENT, '-').replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('/');
}

function splitFileName(fileName: string): { stem: string; extension: string } {
  const sourceName = fileName.replace(/\\/g, '/').split('/').pop() || 'image';
  const dotIndex = sourceName.lastIndexOf('.');

  if (dotIndex <= 0) {
    const safeStem = sourceName
      .toLowerCase()
      .replace(SAFE_SEGMENT, '-')
      .replace(/^-+|-+$/g, '');
    return { stem: safeStem || 'image', extension: '' };
  }

  const safeStem = sourceName
    .slice(0, dotIndex)
    .toLowerCase()
    .replace(SAFE_SEGMENT, '-')
    .replace(/^-+|-+$/g, '');
  const safeExtension = sourceName
    .slice(dotIndex + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  return {
    stem: safeStem || 'image',
    extension: safeExtension ? `.${safeExtension}` : '',
  };
}

export function createObjectKey(options: {
  originalName: string;
  body: Uint8Array;
  directory?: string;
  relativePath?: string;
  namingStrategy?: NamingStrategy;
}): string {
  const strategy = options.namingStrategy || 'hash-suffix';
  const relativePath = sanitizePath(options.relativePath || '');
  const relativeDirectory = relativePath.includes('/')
    ? relativePath.slice(0, relativePath.lastIndexOf('/'))
    : '';
  const directory = sanitizePath(
    [options.directory, relativeDirectory].filter(Boolean).join('/')
  );
  const { stem, extension } = splitFileName(options.originalName);

  let fileName = `${stem}${extension}`;
  if (strategy === 'hash-suffix') {
    const hash = createHash('sha256').update(options.body).digest('hex').slice(0, 8);
    fileName = `${stem}-${hash}${extension}`;
  } else if (strategy === 'random') {
    fileName = `${randomUUID().replace(/-/g, '')}${extension}`;
  }

  return [directory, fileName].filter(Boolean).join('/');
}
