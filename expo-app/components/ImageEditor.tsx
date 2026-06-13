/**
 * ImageEditor
 *
 * A reusable full-screen overlay modal for picking, positioning, and zooming
 * a circular image (avatar, org logo, facility photo, etc.).
 *
 * Usage:
 *   <ImageEditor
 *     visible={isEditing}
 *     imageUri={currentImage}         // existing URI (base64 or http) or '' for none
 *     config={currentConfig}          // { scale, x, y } – normalized -1..1 for x/y
 *     title="Edit Avatar"             // optional – defaults to "Adjust Image"
 *     allowRemove                     // optional – shows a Remove button
 *     onApply={(uri, config) => ...}  // called when user taps Apply
 *     onCancel={() => ...}            // called when user taps Cancel / close
 *   />
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  PanResponder,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';

export interface ImageConfig {
  scale: number;
  x: number; // normalized –1 to 1
  y: number; // normalized –1 to 1
}

interface ImageEditorProps {
  visible: boolean;
  imageUri: string;
  config: ImageConfig;
  title?: string;
  allowRemove?: boolean;
  previewBackgroundColor?: string;
  onApply: (imageUri: string, config: ImageConfig) => void;
  onCancel: () => void;
}

const PREVIEW_SIZE = 144;
const NUDGE_OPTIONS = [
  { label: 'Fine (1%)', value: 0.01 },
  { label: 'Med (3%)', value: 0.03 },
  { label: 'Coarse (8%)', value: 0.08 },
];
const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.5, 2.0];
const MIN_ZOOM = 0.5;

export function ImageEditor({
  visible,
  imageUri,
  config,
  title = 'Adjust Image',
  allowRemove = false,
  previewBackgroundColor,
  onApply,
  onCancel,
}: ImageEditorProps) {
  const isDark = useActiveTheme() === 'dark';

  // Internal working state — initialised from props when modal opens
  const [tempUri, setTempUri] = useState(imageUri);
  const [tempScale, setTempScale] = useState(config.scale);
  const [tempX, setTempX] = useState(config.x);
  const [tempY, setTempY] = useState(config.y);
  const [nudgeSpeed, setNudgeSpeed] = useState(0.03);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);

  // Get image dimensions whenever tempUri changes
  useEffect(() => {
    if (tempUri) {
      Image.getSize(
        tempUri,
        (width, height) => {
          setImgDimensions({ width, height });
        },
        (error) => {
          console.warn('[ImageEditor] Failed to get image size via getSize, trying asset fallback:', error);
        }
      );
    } else {
      setImgDimensions(null);
    }
  }, [tempUri]);

  // Sync with incoming props when visibility changes
  useEffect(() => {
    if (visible) {
      setTempUri(imageUri);
      setTempScale(config.scale);
      setTempX(config.x);
      setTempY(config.y);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs to avoid stale closures inside PanResponder
  const tempScaleRef = useRef(config.scale);
  const tempXRef = useRef(config.x);
  const tempYRef = useRef(config.y);
  useEffect(() => { tempScaleRef.current = tempScale; }, [tempScale]);
  useEffect(() => { tempXRef.current = tempX; }, [tempX]);
  useEffect(() => { tempYRef.current = tempY; }, [tempY]);

  const initialPinchDist = useRef<number | null>(null);
  const initialPinchScale = useRef<number>(1);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        initialPinchDist.current = null;
        dragStartX.current = tempXRef.current;
        dragStartY.current = tempYRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const [t1, t2] = [touches[0], touches[1]];
          const dist = Math.sqrt(
            Math.pow(t1.pageX - t2.pageX, 2) + Math.pow(t1.pageY - t2.pageY, 2)
          );
          if (initialPinchDist.current === null) {
            initialPinchDist.current = dist;
            initialPinchScale.current = tempScaleRef.current;
          } else {
            const newScale = Math.max(
              MIN_ZOOM,
              Math.min(3.0, initialPinchScale.current * (dist / initialPinchDist.current))
            );
            setTempScale(newScale);
          }
        } else if (touches.length === 1) {
          const newX = dragStartX.current + gestureState.dx / PREVIEW_SIZE;
          const newY = dragStartY.current + gestureState.dy / PREVIEW_SIZE;
          setTempX(Math.max(-1, Math.min(1, newX)));
          setTempY(Math.max(-1, Math.min(1, newY)));
        }
      },
    })
  ).current;

  // Web scroll-to-zoom
  const previewRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const el = previewRef.current as any;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setTempScale(prev =>
        Math.max(MIN_ZOOM, Math.min(3.0, prev + (e.deltaY < 0 ? 0.05 : -0.05)))
      );
    };
    el.addEventListener?.('wheel', handler, { passive: false });
    return () => el.removeEventListener?.('wheel', handler);
  }, [visible]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Media library permission is required to select an image.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/png';
        setTempUri(`data:${mime};base64,${asset.base64}`);
        setImgDimensions({ width: asset.width, height: asset.height });
        // Reset position when a new image is loaded
        setTempScale(1);
        setTempX(0);
        setTempY(0);
      }
    } catch (err) {
      console.error('[ImageEditor] Error picking image:', err);
    }
  };

  const handleApply = async () => {
    if (!tempUri) {
      onApply('', { scale: 1, x: 0, y: 0 });
      return;
    }

    setIsProcessing(true);
    try {
      // Get image dimensions (either pre-fetched or fallback to default size)
      let W = imgDimensions?.width || 1024;
      let H = imgDimensions?.height || 1024;

      const maxDim = Math.max(W, H);

      // If the image is a remote URL or is already small, pass it through directly without resizing
      if (!tempUri.startsWith('data:') || maxDim <= 1024) {
        onApply(tempUri, { scale: tempScale, x: tempX, y: tempY });
        return;
      }

      // Calculate new dimensions keeping aspect ratio (max 1024px on the longest side)
      let newW = W;
      let newH = H;
      if (maxDim > 1024) {
        const ratio = 1024 / maxDim;
        newW = Math.round(W * ratio);
        newH = Math.round(H * ratio);
      }

      if (Platform.OS === 'web') {
        const canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        const img = new window.Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = tempUri;
        });

        ctx.drawImage(img, 0, 0, newW, newH);
        const finalUri = canvas.toDataURL('image/png');
        onApply(finalUri, { scale: tempScale, x: tempX, y: tempY });
      } else {
        // Native resizing using ImageManipulator (no crop, just scale down)
        const actions = [
          {
            resize: {
              width: newW,
              height: newH,
            },
          },
        ];

        const manipulateResult = await ImageManipulator.manipulateAsync(
          tempUri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.PNG, base64: true }
        );

        let finalUri = manipulateResult.uri;
        if (manipulateResult.base64 && !finalUri.startsWith('data:')) {
          finalUri = `data:image/png;base64,${manipulateResult.base64}`;
        }
        onApply(finalUri, { scale: tempScale, x: tempX, y: tempY });
      }
    } catch (err) {
      console.error('[ImageEditor] Failed to resize image:', err);
      // Fallback
      onApply(tempUri, { scale: tempScale, x: tempX, y: tempY });
    } finally {
      setIsProcessing(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const mutedText = isDark ? '#94A3B8' : '#64748B';
  const subtleBg = isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9';
  const subtleBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.82)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 400, borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor, maxHeight: '95%', overflow: 'hidden' }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: borderColor }}>
            <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 11, color: isDark ? '#fff' : '#0F172A', textTransform: 'uppercase', letterSpacing: 1.5 }}>
              {title}
            </Text>
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close" size={20} color={mutedText} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}
          >
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View
                ref={previewRef}
                {...panResponder.panHandlers}
                style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: PREVIEW_SIZE / 2, overflow: 'hidden', borderWidth: 1, borderColor: subtleBorder, backgroundColor: previewBackgroundColor || (isDark ? '#0F172A' : '#F1F5F9') }}
              >
                {tempUri ? (
                  <Image
                    source={{ uri: tempUri }}
                    style={{
                      width: '100%',
                      height: '100%',
                      resizeMode: 'cover',
                      transform: [
                        { scale: tempScale },
                        { translateX: tempX * PREVIEW_SIZE },
                        { translateY: tempY * PREVIEW_SIZE },
                      ],
                    }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={56} color={mutedText} />
                  </View>
                )}
                {!!tempUri && (
                  <View style={{ position: 'absolute', bottom: 6, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 8, color: '#fff' }}>Drag · Pinch to zoom</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              <TouchableOpacity
                onPress={handlePickImage}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: subtleBorder, backgroundColor: subtleBg }}
              >
                <Ionicons name="image-outline" size={14} color={isDark ? '#fff' : '#0F172A'} />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: isDark ? '#fff' : '#0F172A' }}>
                  {tempUri ? 'Change Image' : 'Choose Image'}
                </Text>
              </TouchableOpacity>

              {allowRemove && tempUri ? (
                <TouchableOpacity
                  onPress={() => { setTempUri(''); setTempScale(1); setTempX(0); setTempY(0); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.08)' }}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#EF4444' }}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {tempUri ? (
              <>
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, color: mutedText, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Zoom ({tempScale.toFixed(2)}x)
                    </Text>
                    <TouchableOpacity onPress={() => setTempScale(1)}>
                      <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, color: '#FF3E00', textTransform: 'uppercase' }}>Reset</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setTempScale(prev => Math.max(MIN_ZOOM, prev - 0.1))}
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: subtleBg, borderWidth: 1, borderColor: subtleBorder, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="remove" size={16} color={isDark ? '#fff' : '#0F172A'} />
                    </TouchableOpacity>

                    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderRadius: 10, padding: 4, gap: 4 }}>
                      {ZOOM_PRESETS.map(val => (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setTempScale(val)}
                          style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center', backgroundColor: Math.abs(tempScale - val) < 0.01 ? '#FF3E00' : 'transparent' }}
                        >
                          <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, color: Math.abs(tempScale - val) < 0.01 ? '#fff' : mutedText }}>
                            {val}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      onPress={() => setTempScale(prev => Math.min(3.0, prev + 0.1))}
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: subtleBg, borderWidth: 1, borderColor: subtleBorder, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="add" size={16} color={isDark ? '#fff' : '#0F172A'} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, color: mutedText, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Position (X: {Math.round(tempX * 100)}%, Y: {Math.round(tempY * 100)}%)
                    </Text>
                    <TouchableOpacity onPress={() => { setTempX(0); setTempY(0); }}>
                      <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, color: '#FF3E00', textTransform: 'uppercase' }}>Center</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{ width: 108, height: 108, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderRadius: 54, borderWidth: 1, borderColor: subtleBorder }}>
                      <TouchableOpacity
                        onPress={() => setTempY(prev => Math.max(-1, prev - nudgeSpeed))}
                        style={{ position: 'absolute', top: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="chevron-up" size={14} color={isDark ? '#fff' : '#0F172A'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTempX(prev => Math.max(-1, prev - nudgeSpeed))}
                        style={{ position: 'absolute', left: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="chevron-back" size={14} color={isDark ? '#fff' : '#0F172A'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setTempX(0); setTempY(0); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF3E00', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="contract" size={12} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTempX(prev => Math.min(1, prev + nudgeSpeed))}
                        style={{ position: 'absolute', right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="chevron-forward" size={14} color={isDark ? '#fff' : '#0F172A'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTempY(prev => Math.min(1, prev + nudgeSpeed))}
                        style={{ position: 'absolute', bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#fff', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="chevron-down" size={14} color={isDark ? '#fff' : '#0F172A'} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 7, color: mutedText, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                        Nudge Sensitivity
                      </Text>
                      {NUDGE_OPTIONS.map(opt => (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setNudgeSpeed(opt.value)}
                          style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: nudgeSpeed === opt.value ? 'rgba(255,62,0,0.3)' : subtleBorder, backgroundColor: nudgeSpeed === opt.value ? 'rgba(255,62,0,0.1)' : subtleBg }}
                        >
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: nudgeSpeed === opt.value ? '#FF3E00' : mutedText, textAlign: 'center' }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: borderColor }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: subtleBg, borderWidth: 1, borderColor: subtleBorder, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: isDark ? '#CBD5E1' : '#64748B', textTransform: 'uppercase' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApply}
              disabled={isProcessing}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF3E00', alignItems: 'center', justifyContent: 'center', opacity: isProcessing ? 0.7 : 1 }}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: '#fff', textTransform: 'uppercase' }}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}
