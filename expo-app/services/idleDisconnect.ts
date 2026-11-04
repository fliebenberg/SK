import { AppState, AppStateStatus } from 'react-native';
import { wsService } from './websocket';

/**
 * How long the app may stay hidden before it lets go of its connection. Long enough that someone
 * who jumps to another tab and comes back keeps it, since coming back to a closed connection means
 * every open screen joining its rooms and reading its data again; short enough that a tab forgotten
 * for the day costs the server nothing.
 */
const HIDDEN_DISCONNECT_MS = 5 * 60_000;

/**
 * Close the connection once the app has been hidden for a while, and open it again on return
 * (live-data skill). This one place covers every screen: rooms deliver nothing and `useSocketQuery`
 * sends nothing without a connection, and on return each screen joins and reads as it did on
 * `isConnected` turning true after any other drop. Results entered offline wait in their queue.
 *
 * `onReturn` runs when it reopened a connection this closed.
 */
export function startIdleDisconnect(onReturn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const whenHidden = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      closed = true;
      wsService.disconnect();
    }, HIDDEN_DISCONNECT_MS);
  };

  const onChange = (state: AppStateStatus) => {
    if (state === 'background') return whenHidden();
    if (state !== 'active') return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (closed) {
      closed = false;
      wsService.connect();
      onReturn();
    }
  };

  if (AppState.currentState === 'background') whenHidden();
  const subscription = AppState.addEventListener('change', onChange);
  return () => {
    if (timer) clearTimeout(timer);
    subscription.remove();
  };
}
