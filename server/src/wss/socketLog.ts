import type { Socket } from 'socket.io';

/**
 * One place that logs socket traffic, in both directions.
 *
 * Before this, incoming events were logged by a `socket.use` middleware in `index.ts` and outgoing
 * ones were logged only where somebody had remembered to — the `additionalBroadcasts` flush did,
 * `broadcast()` itself did not, `pushToSocket` did not, and acks were invisible. So a server log
 * showed what a client asked for but not what it was sent, which is the half you need to tell
 * "the screen is empty because the push never came" from "because the reducer dropped it".
 *
 * ## Modes
 *
 * `SOCKET_LOG` selects how much is written. It defaults to `summary` in development and **`off` in
 * production**, because one line per message per socket does not survive a real user count: a
 * thousand clients watching a busy Saturday is tens of thousands of lines a minute, and the log
 * write is synchronous work on the event loop that serves them.
 *
 * | Mode | What it writes | Cost |
 * | --- | --- | --- |
 * | `off` | nothing | one comparison per message |
 * | `summary` | direction, event, type, topic, socket, user | no payload serialisation |
 * | `full` | the above plus a truncated JSON payload and its size | `JSON.stringify` per message |
 *
 * The `summary`/`full` split is the load-bearing part. Payload **size** is the single most useful
 * number for finding a subscription problem — it is how you would notice a list room handing over
 * a thousand rows — but getting it means serialising every message, so it belongs to `full` rather
 * than to the mode you leave on. `SOCKET_LOG_FILTER` narrows either mode to messages whose event,
 * type or topic contains a given substring, which is usually better than turning `full` on globally.
 *
 * The mode is read per message rather than captured at startup, so `setSocketLogMode` can raise it
 * on a running server to catch something that only happens in production.
 */

export type SocketLogMode = 'off' | 'summary' | 'full';

const VALID_MODES: SocketLogMode[] = ['off', 'summary', 'full'];

function defaultMode(): SocketLogMode {
  const configured = (process.env.SOCKET_LOG || '').trim().toLowerCase();
  if (VALID_MODES.includes(configured as SocketLogMode)) return configured as SocketLogMode;
  if (configured) {
    console.warn(`[SocketLog] Unknown SOCKET_LOG value "${configured}". Using the default.`);
  }
  return process.env.NODE_ENV === 'production' ? 'off' : 'summary';
}

let mode: SocketLogMode = defaultMode();
const filter = (process.env.SOCKET_LOG_FILTER || '').trim().toLowerCase();

/** Max characters of payload written per message in `full` mode. */
const MAX_PAYLOAD_CHARS = 600;

export function socketLogMode(): SocketLogMode {
  return mode;
}

/** Raise or lower the level on a running server. */
export function setSocketLogMode(next: SocketLogMode): void {
  mode = next;
  console.log(`[SocketLog] Mode set to "${next}".`);
}

function passesFilter(...fields: (string | undefined)[]): boolean {
  if (!filter) return true;
  return fields.some(field => field && field.toLowerCase().includes(filter));
}

/** `{...}` rendered small enough to sit on a log line, or a note saying why it could not be. */
function renderPayload(data: unknown): string {
  if (data === undefined) return '';
  try {
    const json = JSON.stringify(data);
    if (json === undefined) return ' payload=<unserialisable>';
    const size = json.length;
    const body = size > MAX_PAYLOAD_CHARS ? `${json.slice(0, MAX_PAYLOAD_CHARS)}…` : json;
    return ` bytes=${size} payload=${body}`;
  } catch {
    // A circular structure, or a getter that throws. Never let logging break the message it logs.
    return ' payload=<unserialisable>';
  }
}

/**
 * The short description of an incoming event — the type for an action or a query, the room for a
 * join. Kept out of `renderPayload` because it is cheap and worth having in `summary` mode: the
 * whole point of the line is knowing *which* action arrived, not that an action did.
 */
function describeIncoming(event: string, args: any[]): string {
  const first = args[0];
  if (event === 'action') return `type=${first?.type || 'unknown'}`;
  if (event === 'get_data') return `type=${first?.type || 'unknown'}`;
  if (event === 'join_room' || event === 'leave_room') return `room=${first ?? 'unknown'}`;
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const id = first.id || first.eventId || first.gameId || first.orgId;
    return id ? `id=${id}` : '';
  }
  return '';
}

function identify(socket: Socket): string {
  const ip = (socket as any).clientIp || socket.handshake.address || 'unknown';
  const user = (socket as any).userId || 'anonymous';
  return `socket=${socket.id} user=${user} ip=${ip}`;
}

/**
 * Log a message published to a room. Called from `broadcast()`, which every broadcast goes through,
 * so this covers the fan-out path that no per-socket wrapper can see — `io.to(room).emit` never
 * touches an individual socket's `emit`.
 */
export function logBroadcast(topic: string, type: string, data: unknown, recipients: number): void {
  if (mode === 'off') return;
  if (!passesFilter('update', type, topic)) return;
  const payload = mode === 'full' ? renderPayload(data) : '';
  console.log(`[Socket] OUT broadcast type=${type} topic=${topic} recipients=${recipients}${payload}`);
}

/**
 * Install logging on one connection. Covers three things a single hook cannot:
 *
 * - **incoming events**, through `socket.use`;
 * - **acks**, by wrapping the callback socket.io appends to the packet — an ack is sent with
 *   `socket.packet()` rather than `emit`, so nothing else sees it;
 * - **messages to this one socket**, by wrapping `emit` — which is what `pushToSocket`, the
 *   `server_time` seed and `ROOM_ACCESS_DENIED` all use.
 *
 * Installed unconditionally and gated per message, so `setSocketLogMode` works on sockets that
 * connected while logging was off.
 */
export function attachSocketLogging(socket: Socket): void {
  const originalEmit = socket.emit.bind(socket);
  (socket as any).emit = (event: string, ...args: any[]) => {
    if (mode !== 'off') {
      // `update` carries its own envelope, and the type/topic in it is what identifies the
      // message — `event` is always the string "update", which says nothing on its own.
      const envelope = event === 'update' ? args[0] : undefined;
      const type = envelope?.type;
      const topic = envelope?.topic;
      if (passesFilter(event, type, topic)) {
        const label = envelope ? `type=${type} topic=${topic}` : describeIncoming(event, args);
        const payload = mode === 'full' ? renderPayload(envelope ?? args[0]) : '';
        console.log(`[Socket] OUT push event="${event}" ${label} ${identify(socket)}${payload}`);
      }
    }
    return originalEmit(event, ...args);
  };

  socket.use((packet, next) => {
    const [event, ...args] = packet as unknown as [string, ...any[]];

    // socket.io appends the ack callback to the packet before dispatch, so the last argument is
    // the client's callback when it asked for a reply. Replacing it in place is what lets the
    // response be logged; the array is the same one the handler is applied to.
    const lastIndex = (packet as unknown as any[]).length - 1;
    const ack = (packet as unknown as any[])[lastIndex];
    if (typeof ack === 'function') {
      const startedAt = Date.now();
      const label = describeIncoming(event, args);
      (packet as unknown as any[])[lastIndex] = (...response: any[]) => {
        if (mode !== 'off' && passesFilter(event, label)) {
          const payload = mode === 'full' ? renderPayload(response[0]) : '';
          console.log(
            `[Socket] OUT ack event="${event}" ${label} ms=${Date.now() - startedAt} ` +
            `${identify(socket)}${payload}`
          );
        }
        return ack(...response);
      };
    }

    if (mode !== 'off') {
      const label = describeIncoming(event, args);
      if (passesFilter(event, label)) {
        const payload = mode === 'full' ? renderPayload(args[0]) : '';
        console.log(`[Socket] IN  event="${event}" ${label} ${identify(socket)}${payload}`);
      }
    }

    next();
  });
}
