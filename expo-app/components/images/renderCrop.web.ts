import type { ImageKind } from '../../services/api';
import { CropRegion, PictureSize, needsPadding, outputLayout, outputSize } from './cropGeometry';
import type { CropOutput } from './renderCrop';

/**
 * The web half of renderCrop.ts: the browser's canvas draws the crop, clear space included, and
 * encodes it. WebP where the browser can encode it; Safari cannot and quietly returns PNG, so
 * there a photo goes as JPEG (much smaller) and anything with transparency as PNG.
 */

let webpSupported: boolean | null = null;
function canEncodeWebp() {
  if (webpSupported === null) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be read.'));
    img.src = uri;
  });
}

export function useCropRenderer() {
  const render = async (uri: string, picture: PictureSize, region: CropRegion, kind: ImageKind): Promise<CropOutput> => {
    const size = outputSize(region);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot crop pictures.');
    ctx.imageSmoothingQuality = 'high';
    const at = outputLayout(picture, region, size);
    ctx.drawImage(await loadImage(uri), at.left, at.top, at.width, at.height);

    const transparent = kind === 'logos' || needsPadding(picture, region);
    const [type, quality] = canEncodeWebp()
      ? ['image/webp', kind === 'logos' ? 0.92 : 0.85]
      : transparent ? ['image/png', undefined] : ['image/jpeg', 0.88];
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('The picture could not be cropped.');
    const url = URL.createObjectURL(blob);
    return { uri: url, mimeType: blob.type || type, release: () => URL.revokeObjectURL(url) };
  };
  return { render, element: null };
}
