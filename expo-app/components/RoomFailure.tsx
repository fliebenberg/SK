import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { ReadFailure } from './ReadFailure';
import { useRoomStatusStore } from '../store/roomStatusStore';
import { wsService } from '../services/websocket';

/**
 * Live rooms that did not arrive, said where their content would have been (`LIVE-25`). Pass the rooms
 * this content comes from (`useLiveRoom`'s `room`, or a wrapper hook's); while it is on screen it
 * claims them, so the app-wide `RoomFailureNotice` does not say the same thing again. With `stale` it
 * sits above what is held and says that is the last known state; *Try again* asks again for the
 * failed ones.
 */
export function RoomFailure({ rooms, what, title, stale = false, className = '' }: {
  rooms: (string | null | undefined)[];
  /** What did not load, as the start of a sentence: "The leagues". */
  what?: string;
  title?: string;
  stale?: boolean;
  className?: string;
}) {
  const key = rooms.filter(Boolean).join('|');
  const held = useMemo(() => (key ? key.split('|') : []), [key]);
  const claim = useRoomStatusStore(state => state.claim);
  useEffect(() => (held.length ? claim(held) : undefined), [held, claim]);

  const reason = useRoomStatusStore(state => {
    for (const room of held) if (state.failed[room]) return state.failed[room];
    return null;
  });
  if (!reason) return null;
  return (
    <ReadFailure
      what={what}
      title={title}
      reason={reason}
      stale={stale}
      className={className}
      onRetry={() => wsService.retryFailedRooms(held)}
    />
  );
}

/**
 * Every failed room nothing on screen is speaking for, said once at the top of the app (`LIVE-25`).
 * The safety net for screens that do not place a `RoomFailure`, and for rooms added in future: no
 * room that never answers is left as a silent spinner.
 */
export function RoomFailureNotice() {
  const reason = useRoomStatusStore(state => {
    for (const room of Object.keys(state.failed)) if (!state.claims[room]) return state.failed[room];
    return null;
  });
  if (!reason) return null;
  return (
    <View className="bg-canvas px-3 py-2">
      <ReadFailure
        title="Some of this page did not load."
        reason={reason}
        onRetry={() => {
          const { failed, claims } = useRoomStatusStore.getState();
          wsService.retryFailedRooms(Object.keys(failed).filter(room => !claims[room]));
        }}
      />
    </View>
  );
}
