import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EditDialog } from '../EditDialog';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import type { ImageKind } from '../../services/api';
import {
  CropView, PictureSize, clampView, cropRegion, fillZoom, initialView, maxZoom, previewLayout,
} from './cropGeometry';
import { useCropRenderer, type CropOutput } from './renderCrop';

/**
 * Where a picture is cropped before it is uploaded (okf/api_comms.md §Uploaded Images).
 *
 * The person drags and zooms the picture in a square frame — out far enough to fit all of it, with
 * clear space around, or in to a detail. What is in the frame is what is stored: no zoom or position
 * is saved, and the picture is shown afterwards exactly as cropped. The same on web, iOS and
 * Android; the system picker's own crop exists only on phones, so it is not used.
 *
 * `onApply` uploads the result (see `useImageUpload`) and decides when the dialog closes: it stays
 * open, showing the reason, when the upload fails.
 *
 * Opened with no picture chosen, it shows the `current` one with a way to choose another and, when
 * `onRemove` is given, to remove it.
 */
export interface ImageCropperProps {
  visible: boolean;
  title: string;
  kind: ImageKind;
  /** The picture the person chose, with its size in pixels. */
  picture: { uri: string; width: number; height: number } | null;
  /** The picture in use now, shown until another is chosen. */
  current?: string | null;
  onRemove?: () => void;
  isRemoving?: boolean;
  /** People's pictures show in a circle; logos in a rounded square. */
  shape: 'circle' | 'rounded';
  isUploading: boolean;
  error: string | null;
  onChooseAnother: () => void;
  onApply: (output: CropOutput) => void;
  onCancel: () => void;
}

const ZOOM_STEP = 1.15;

export function ImageCropper({
  visible, title, kind, picture, current, onRemove, isRemoving, shape, isUploading, error, onChooseAnother, onApply, onCancel,
}: ImageCropperProps) {
  const isDark = useActiveTheme() === 'dark';
  const { width: screenWidth } = useWindowDimensions();
  const frame = Math.min(280, screenWidth - 80);
  const size: PictureSize | null = picture ? { width: picture.width, height: picture.height } : null;
  const [view, setView] = useState<CropView>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const renderer = useCropRenderer();

  useEffect(() => {
    if (size) setView(initialView(size));
    setCropError(null);
  }, [picture?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gestures read the latest values through refs; PanResponder is created once.
  const latest = useRef({ size, view, frame });
  latest.current = { size, view, frame };
  const update = (next: (v: CropView) => CropView) => {
    const s = latest.current.size;
    if (s) setView(v => clampView(s, next(v)));
  };

  const gesture = useRef({ startX: 0, startY: 0, pinchDistance: 0, pinchZoom: 1 });
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // The dialog scrolls; a drag that starts on the picture moves the picture.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      gesture.current.startX = latest.current.view.offsetX;
      gesture.current.startY = latest.current.view.offsetY;
      gesture.current.pinchDistance = 0;
    },
    onPanResponderMove: (evt, g) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        const distance = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
        if (!gesture.current.pinchDistance) {
          gesture.current.pinchDistance = distance;
          gesture.current.pinchZoom = latest.current.view.zoom;
        } else {
          const zoom = gesture.current.pinchZoom * (distance / gesture.current.pinchDistance);
          update(v => ({ ...v, zoom }));
        }
      } else if (!gesture.current.pinchDistance) {
        const f = latest.current.frame;
        update(v => ({ ...v, offsetX: gesture.current.startX + g.dx / f, offsetY: gesture.current.startY + g.dy / f }));
      }
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolling over the frame zooms, on web.
  const frameRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const el = frameRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      update(v => ({ ...v, zoom: v.zoom * factor }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [visible, picture?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (!picture || !size) return;
    setIsCropping(true);
    setCropError(null);
    try {
      onApply(await renderer.render(picture.uri, size, cropRegion(size, view), kind));
    } catch (err: any) {
      console.error('[ImageCropper] Cropping failed:', err);
      setCropError(err?.message || 'The picture could not be cropped. Try another one.');
    } finally {
      setIsCropping(false);
    }
  };

  const layout = size ? previewLayout(size, view, frame) : null;
  const radius = shape === 'circle' ? frame / 2 : frame * 0.18;
  const atFit = !!size && view.zoom <= 1.001;
  const atFill = !!size && Math.abs(view.zoom - fillZoom(size)) < 0.001;
  const message = cropError || error;

  return (
    <EditDialog
      visible={visible}
      title={title}
      onClose={onCancel}
      onSave={apply}
      saveLabel="Use picture"
      saveDisabled={!picture || isRemoving}
      isSaving={isCropping || isUploading}
      footerLeft={!picture && current && onRemove ? (
        <TouchableOpacity onPress={onRemove} disabled={isRemoving} accessibilityRole="button" className="min-h-[40px] justify-center">
          <Text className={`font-inter-semibold text-sm text-danger-ink ${isRemoving ? 'opacity-40' : ''}`}>Remove</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      <View className="items-center gap-3">
        <View
          ref={frameRef}
          {...panResponder.panHandlers}
          className="bg-sunken border border-line overflow-hidden"
          style={{ width: frame, height: frame, borderRadius: radius }}
        >
          {picture && layout ? (
            <Image
              source={{ uri: picture.uri }}
              style={{ position: 'absolute', ...layout }}
              resizeMode="stretch"
            />
          ) : current ? (
            <Image source={{ uri: current }} style={{ width: frame, height: frame }} resizeMode="cover" />
          ) : null}
        </View>
        {picture ? (
          <>
            <Text className="font-inter text-xs text-ink-muted text-center">
              Drag to move. {Platform.OS === 'web' ? 'Scroll' : 'Pinch'} to zoom, or zoom out to fit the whole picture with clear space around it.
            </Text>

            <View className="flex-row items-center gap-2">
              <RoundButton icon="remove" label="Zoom out" disabled={atFit} onPress={() => update(v => ({ ...v, zoom: v.zoom / ZOOM_STEP }))} isDark={isDark} />
              <PresetButton label="Fit" active={atFit} onPress={() => size && setView(clampView(size, { zoom: 1, offsetX: 0, offsetY: 0 }))} />
              <PresetButton label="Fill" active={atFill} onPress={() => size && setView(initialView(size))} />
              <RoundButton icon="add" label="Zoom in" disabled={!size || view.zoom >= maxZoom(size) - 0.001} onPress={() => update(v => ({ ...v, zoom: v.zoom * ZOOM_STEP }))} isDark={isDark} />
            </View>
          </>
        ) : null}

        <TouchableOpacity onPress={onChooseAnother} disabled={isCropping || isUploading} accessibilityRole="button" className="flex-row items-center gap-1.5 py-1">
          <Ionicons name="image-outline" size={14} color={themeColor(isDark, 'primary-ink')} />
          <Text className="font-inter-semibold text-sm text-primary-ink">{picture ? 'Choose another picture' : 'Choose a new picture'}</Text>
        </TouchableOpacity>

        {message ? (
          <View className="self-stretch flex-row items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2">
            <Ionicons name="alert-circle-outline" size={16} color={themeColor(isDark, 'danger')} />
            <Text className="flex-1 font-inter text-sm text-danger-ink">{message}</Text>
          </View>
        ) : null}
      </View>
      {renderer.element}
    </EditDialog>
  );
}

function RoundButton({ icon, label, onPress, disabled, isDark }: {
  icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean; isDark: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`w-10 h-10 rounded-xl border border-line bg-card items-center justify-center ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={18} color={themeColor(isDark, 'ink')} />
    </TouchableOpacity>
  );
}

function PresetButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`min-h-[40px] px-4 rounded-xl border items-center justify-center ${active ? 'bg-primary-soft border-primary-line' : 'bg-card border-line'}`}
    >
      <Text className={`font-inter-bold text-sm ${active ? 'text-primary-ink' : 'text-ink-soft'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
