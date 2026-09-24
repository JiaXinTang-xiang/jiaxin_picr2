import { describe, expect, it } from 'bun:test';
import { createObjectKey, sanitizePath } from './upload-path';

describe('sanitizePath', () => {
  it('normalizes separators and removes unsafe traversal segments', () => {
    expect(sanitizePath(' posts\\tech /../camera calibration ')).toBe(
      'posts/tech/camera-calibration'
    );
  });
});

describe('createObjectKey', () => {
  const body = new TextEncoder().encode('same image bytes');

  it('keeps a readable name and adds a stable content hash', () => {
    expect(
      createObjectKey({
        originalName: 'Camera Result.PNG',
        body,
        directory: 'posts/tech/vision/camera-calibration',
        namingStrategy: 'hash-suffix',
      })
    ).toMatch(/^posts\/tech\/vision\/camera-calibration\/camera-result-[a-f0-9]{8}\.png$/);
  });

  it('preserves subdirectories selected from a folder', () => {
    expect(
      createObjectKey({
        originalName: 'cover.webp',
        body,
        directory: 'posts/tech',
        relativePath: 'vision/camera-calibration/cover.webp',
        namingStrategy: 'preserve',
      })
    ).toBe('posts/tech/vision/camera-calibration/cover.webp');
  });

  it('falls back to a safe semantic stem for non-latin-only names', () => {
    expect(
      createObjectKey({
        originalName: '截图.png',
        body,
        directory: 'posts/daily',
        namingStrategy: 'hash-suffix',
      })
    ).toMatch(/^posts\/daily\/image-[a-f0-9]{8}\.png$/);
  });
});
