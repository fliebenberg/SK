import { create } from 'zustand';

/**
 * Which held rooms did not arrive, and which of them a screen is saying so about (`LIVE-25`).
 *
 * The socket service writes `failed`; nothing else should. A screen that shows a room's failure in
 * place (`RoomFailure`) *claims* the room while it is on screen, and the app-wide
 * `RoomFailureNotice` speaks only for failed rooms nobody has claimed — so every room that does not
 * arrive is said once, either beside the content it would have filled or at the top of the app.
 */
export interface RoomStatusState {
  /** Room → what to say about it. A refusal is not here: the screen says that itself. */
  failed: Record<string, string>;
  /** Room → how many on-screen `RoomFailure`s cover it. */
  claims: Record<string, number>;
  claim: (rooms: string[]) => () => void;
}

export const useRoomStatusStore = create<RoomStatusState>(set => ({
  failed: {},
  claims: {},
  claim: rooms => {
    set(state => {
      const claims = { ...state.claims };
      for (const room of rooms) claims[room] = (claims[room] || 0) + 1;
      return { claims };
    });
    return () =>
      set(state => {
        const claims = { ...state.claims };
        for (const room of rooms) {
          const left = (claims[room] || 0) - 1;
          if (left > 0) claims[room] = left;
          else delete claims[room];
        }
        return { claims };
      });
  },
}));

export function setRoomFailed(room: string, message: string | null) {
  const { failed } = useRoomStatusStore.getState();
  if (message === null) {
    if (!(room in failed)) return;
    const next = { ...failed };
    delete next[room];
    useRoomStatusStore.setState({ failed: next });
  } else if (failed[room] !== message) {
    useRoomStatusStore.setState({ failed: { ...failed, [room]: message } });
  }
}
