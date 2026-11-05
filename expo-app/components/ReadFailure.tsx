import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

/**
 * A read that failed, where its content would have been (`SYNC-9`). With nothing to show it takes that
 * place; with `stale`, it sits above what was last read and says that is what it is. `title` replaces
 * the sentence built from `what` when that does not fit, as with a check rather than a list.
 */
export function ReadFailure({ what, title, reason, onRetry, stale = false, className = '' }: {
  /** What did not load, as the start of a sentence: "Organisations". */
  what?: string;
  title?: string;
  reason: string;
  onRetry?: () => void;
  stale?: boolean;
  className?: string;
}) {
  const heading = title ?? `${what} ${stale ? 'did not update.' : 'did not load.'}`;
  return (
    <View testID="read-failure" className={`gap-2 items-start rounded-xl bg-warning-soft px-3 py-2.5 ${stale ? 'mb-2' : ''} ${className}`}>
      <Text className="font-inter text-[13px] text-warning-ink leading-5">
        <Text className="font-inter-bold">{heading}</Text> {reason}
      </Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button" className="px-4 py-2 rounded-xl bg-primary">
          <Text className="font-inter-bold text-xs text-on-primary">Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
