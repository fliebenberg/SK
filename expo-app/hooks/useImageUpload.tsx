import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiService, type ImageKind } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { ImageCropper } from '../components/images/ImageCropper';
import type { CropOutput } from '../components/images/renderCrop';

/**
 * Everything a screen needs to let someone add a picture (okf/api_comms.md §Uploaded Images):
 * choose it, crop it, upload it, and keep track of the upload until it is saved.
 *
 *     const logo = useImageUpload({ kind: 'logos', title: 'League logo', onUploaded: setLogo });
 *     <Button title="Change logo" onPress={logo.open} />
 *     {logo.element}
 *     // after the save that sent the name succeeds:
 *     logo.saved();
 *
 * An upload is stored on the server at once but used by nothing until a save sends its name. Until
 * then this hook holds it, and deletes it from the server when it can no longer be saved: another
 * picture replaces it, the screen calls `discard()` (a form cancelled), the screen goes away, or
 * the browser tab closes. What slips through — a phone app killed — the server sweeps after a day.
 */
export interface ImageUploadOptions {
  kind: ImageKind;
  /** The crop dialog's title, e.g. "Profile photo". */
  title: string;
  /** Called with the new upload's name: put it in the form, or save it straight away. */
  onUploaded: (name: string) => void;
  /** A URL of the picture in use now. With `onRemove`, `open` first shows it with a Remove button. */
  current?: string | null;
  /**
   * Removes the picture: clear the form field, or save the removal and resolve whether it worked.
   * The dialog closes when it resolves true.
   */
  onRemove?: () => boolean | Promise<boolean>;
}

export interface ImageUpload {
  /** Opens the device's picture library, then the crop dialog; first the current picture, if it can be removed. */
  open: () => void;
  /** Render once, anywhere in the screen. */
  element: React.ReactNode;
  /** The upload no save has used yet, if any. */
  pendingName: string | null;
  isUploading: boolean;
  /** The save that sent the upload's name succeeded: it is no longer ours to delete. */
  saved: () => void;
  /** The form was cancelled: delete the unsaved upload now. */
  discard: () => void;
}

type Picked = { uri: string; width: number; height: number };

export function useImageUpload({ kind, title, onUploaded, current, onRemove }: ImageUploadOptions): ImageUpload {
  const [picture, setPicture] = useState<Picked | null>(null);
  /** The dialog is open on the current picture, before another is chosen. */
  const [showingCurrent, setShowingCurrent] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  // Read at unmount and page close, after the render that set them.
  const pending = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  token.current = useAuthStore(s => s.token);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const setPending = (name: string | null) => {
    pending.current = name;
    setPendingName(name);
  };

  const discardPending = useCallback((keepalive: boolean) => {
    const name = pending.current;
    if (!name) return;
    setPending(null);
    if (token.current) void apiService.discardUpload(token.current, name, keepalive);
  }, []);

  useEffect(() => () => discardPending(true), [discardPending]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPageHide = () => discardPending(true);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [discardPending]);

  const choose = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      if (!asset.width || !asset.height) {
        useToastStore.getState().showError('That picture could not be read. Try another one.', 'Picture');
        return;
      }
      setError(null);
      setPicture({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch (err: any) {
      console.error('[useImageUpload] Choosing a picture failed:', err);
      useToastStore.getState().showError(err?.message || 'The picture library could not be opened.', 'Picture');
    }
  };

  const apply = async (output: CropOutput) => {
    if (!token.current) {
      setError('Sign in to upload a picture.');
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const { name } = await apiService.uploadImage(token.current, kind, output, { suppressToast: true });
      discardPending(false); // the picture this one replaces
      setPending(name);
      setPicture(null);
      setShowingCurrent(false);
      onUploadedRef.current(name);
    } catch (err: any) {
      setError(err?.message || 'The picture could not be uploaded. Try again.');
    } finally {
      output.release();
      setIsUploading(false);
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setIsRemoving(true);
    try {
      if (await onRemove()) {
        discardPending(false);
        setShowingCurrent(false);
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const element = (
    <ImageCropper
      visible={!!picture || showingCurrent}
      title={title}
      kind={kind}
      shape={kind === 'profiles' ? 'circle' : 'rounded'}
      picture={picture}
      current={current}
      onRemove={onRemove ? remove : undefined}
      isRemoving={isRemoving}
      isUploading={isUploading}
      error={error}
      onChooseAnother={choose}
      onApply={apply}
      onCancel={() => { setPicture(null); setShowingCurrent(false); setError(null); }}
    />
  );

  return {
    open: () => {
      setError(null);
      if (current && onRemove) setShowingCurrent(true);
      else void choose();
    },
    element,
    pendingName,
    isUploading,
    saved: () => setPending(null),
    discard: () => discardPending(false),
  };
}
