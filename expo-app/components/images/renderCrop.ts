import React, { useRef, useState } from 'react';
import { Image, PixelRatio, View } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import type { ImageKind } from '../../services/api';
import { CropRegion, PictureSize, needsPadding, outputLayout, outputSize } from './cropGeometry';

/**
 * Turns a crop into the picture to upload. iOS and Android here; the web has renderCrop.web.ts,
 * which Metro picks instead (and which keeps react-native-view-shot out of the web bundle).
 *
 * A crop inside the picture is cut and shrunk by expo-image-manipulator. One that reaches past it —
 * the person zoomed out to fit — needs clear space, which the manipulator cannot add on phones, so
 * the picture is drawn into a transparent square off screen and captured with react-native-view-shot.
 * Either way the result is WebP, which keeps transparency.
 */

export interface CropOutput {
  /** A local URI of the encoded picture, for `apiService.uploadImage`. */
  uri: string;
  mimeType: string;
  /** Frees the local copy once it has been uploaded. */
  release(): void;
}

interface CaptureJob {
  uri: string;
  size: number;
  layout: ReturnType<typeof outputLayout>;
  done: (result: Promise<string>) => void;
}

const quality = (kind: ImageKind) => (kind === 'logos' ? 0.92 : 0.85);

export function useCropRenderer() {
  const [job, setJob] = useState<CaptureJob | null>(null);
  const captureView = useRef<View>(null);

  const capture = (uri: string, size: number, layout: CaptureJob['layout']) =>
    new Promise<string>((resolve, reject) => {
      setJob({ uri, size, layout, done: result => { setJob(null); result.then(resolve, reject); } });
    });

  const render = async (uri: string, picture: PictureSize, region: CropRegion, kind: ImageKind): Promise<CropOutput> => {
    const size = outputSize(region);
    let source: string;
    if (needsPadding(picture, region)) {
      source = await capture(uri, size, outputLayout(picture, region, size));
    } else {
      const originX = Math.max(0, Math.min(picture.width - 1, Math.round(region.x)));
      const originY = Math.max(0, Math.min(picture.height - 1, Math.round(region.y)));
      const side = Math.min(Math.round(region.size), picture.width - originX, picture.height - originY);
      const cropped = await ImageManipulator.manipulate(uri)
        .crop({ originX, originY, width: side, height: side })
        .resize({ width: size, height: size })
        .renderAsync();
      const saved = await cropped.saveAsync({ format: SaveFormat.WEBP, compress: quality(kind) });
      return { uri: saved.uri, mimeType: 'image/webp', release: () => {} };
    }
    const encoded = await (await ImageManipulator.manipulate(source).renderAsync())
      .saveAsync({ format: SaveFormat.WEBP, compress: quality(kind) });
    return { uri: encoded.uri, mimeType: 'image/webp', release: () => {} };
  };

  // Drawn off screen at the output's size; captured once the picture has loaded.
  const toDp = (px: number) => px / PixelRatio.get();
  const element = job
    ? React.createElement(
        View,
        { pointerEvents: 'none', style: { position: 'absolute', left: -10000, top: 0 } },
        React.createElement(
          View,
          {
            ref: captureView,
            collapsable: false,
            style: { width: toDp(job.size), height: toDp(job.size), overflow: 'hidden' },
          },
          React.createElement(Image, {
            source: { uri: job.uri },
            fadeDuration: 0,
            style: {
              position: 'absolute',
              left: toDp(job.layout.left),
              top: toDp(job.layout.top),
              width: toDp(job.layout.width),
              height: toDp(job.layout.height),
            },
            onLoad: () => requestAnimationFrame(() => job.done(
              captureRef(captureView, { format: 'png', result: 'tmpfile', width: job.size, height: job.size })
            )),
            onError: () => job.done(Promise.reject(new Error('The picture could not be read.'))),
          })
        )
      )
    : null;

  return { render, element };
}
