import React from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * A transparent layer over a map preview, so a tap anywhere on it opens the full map page. The
 * preview itself is `interactive={false}` — a picture of where the pin is — so this is how the
 * reader gets to a map they can pan and zoom.
 */
export function MapOverlay({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel="Open the address on a map" className="absolute inset-0 rounded-xl">
      {label ? (
        <View className="absolute top-2 right-2 px-2 py-1 rounded-md bg-card border border-line">
          <Text className="font-inter-bold text-xs text-primary-ink">{label} ↗</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
