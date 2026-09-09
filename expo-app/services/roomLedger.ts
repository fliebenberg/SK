/**
 * Client-side bookkeeping for room subscriptions: who holds a room, and what the server has
 * sent it so far.
 *
 * The socket layer sends `join_room` once, for the first subscriber, and `leave_room` once, when
 * the last one drops off. That is the right thing to do — a room joined twice is not delivered
 * twice — but it has a consequence the reference count alone cannot cover: **the join push
 * reaches only the socket that joined, once.** A screen that subscribes to a room its parent
 * already holds (the events list stays mounted under the event screen, and both want
 * `org:{id}:sites`) never sees that push, and there is no central store it could read instead —
 * every screen reduces the room's messages into its own state.
 *
 * So this ledger keeps, per joined room, the messages the server has delivered while it was
 * held, and hands that log to any subscriber that arrives late. Reducers are deterministic and
 * start from empty, so replaying the log reproduces the state the first subscriber built. The
 * log clears when the room is left, and on reconnect, since the re-join pushes a fresh baseline.
 *
 * Pure: no socket, no React. The socket service owns one and asks it what to send.
 */

export interface RoomMessage<T = any> {
  topic?: string;
  type: string;
  data: T;
}

export interface SubscribeResult {
  /** Hand back to `unsubscribe`. */
  token: string;
  /** True when this subscriber is the first holder, so the socket must send `join_room`. */
  isFirst: boolean;
  /**
   * What a late subscriber should be fed to catch up. `null` for the first subscriber (the join
   * push is coming). `'overflow'` when the log was abandoned for being too long — the caller's
   * only remaining option is to ask the server for the room's state again.
   */
  replay: RoomMessage[] | 'overflow' | null;
}

/**
 * A long-lived room can outgrow any sensible log — a match room takes a `GAME_UPDATED` per
 * clock tick — and replaying thousands of messages into a fresh reducer is worse than one
 * re-push. Past this many messages the log is dropped and a late subscriber falls back to a
 * re-join.
 */
export const DEFAULT_MAX_REPLAY = 500;

export class RoomLedger {
  private subscribers = new Map<string, Set<string>>();
  private logs = new Map<string, RoomMessage[]>();
  private overflowed = new Set<string>();

  constructor(private readonly maxReplay: number = DEFAULT_MAX_REPLAY) {}

  subscribe(room: string): SubscribeResult {
    const token = Math.random().toString(36).substring(2);
    let holders = this.subscribers.get(room);
    if (!holders) {
      holders = new Set();
      this.subscribers.set(room, holders);
    }
    const isFirst = holders.size === 0;
    holders.add(token);

    if (isFirst) {
      this.logs.set(room, []);
      this.overflowed.delete(room);
      return { token, isFirst, replay: null };
    }
    if (this.overflowed.has(room)) {
      // The caller re-joins; the server's push starts a fresh log.
      this.logs.set(room, []);
      this.overflowed.delete(room);
      return { token, isFirst, replay: 'overflow' };
    }
    return { token, isFirst, replay: [...(this.logs.get(room) || [])] };
  }

  /** Returns true when this was the last holder, so the socket must send `leave_room`. */
  unsubscribe(room: string, token: string): boolean {
    const holders = this.subscribers.get(room);
    if (!holders || !holders.delete(token)) return false;
    if (holders.size > 0) return false;
    this.subscribers.delete(room);
    this.logs.delete(room);
    this.overflowed.delete(room);
    return true;
  }

  /** Every message the socket receives passes through here; only held rooms are recorded. */
  record(message: RoomMessage | null | undefined) {
    if (!message?.topic) return;
    const log = this.logs.get(message.topic);
    if (!log) return;
    if (log.length >= this.maxReplay) {
      this.logs.set(message.topic, []);
      this.overflowed.add(message.topic);
      return;
    }
    log.push(message);
  }

  /**
   * On reconnect the socket re-joins every held room and the server pushes each one's state
   * afresh. What was logged before belongs to the old connection.
   */
  resetLogs() {
    for (const room of this.subscribers.keys()) {
      this.logs.set(room, []);
      this.overflowed.delete(room);
    }
  }

  heldRooms(): string[] {
    return [...this.subscribers.keys()];
  }

  isHeld(room: string): boolean {
    return (this.subscribers.get(room)?.size || 0) > 0;
  }
}
