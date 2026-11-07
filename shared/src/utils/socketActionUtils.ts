import { SocketAction } from '../constants/SocketActions';
import { ProtocolMap } from '../types/Protocol';
import type { EditConflict } from './editConflicts';

/** `never` for an action with no entry in `ProtocolMap`: the server refuses those (`SYNC-6`). */
export type SocketActionPayload<K extends SocketAction> = K extends keyof ProtocolMap ? ProtocolMap[K]['payload'] : never;
export type SocketActionResponse<K extends SocketAction> = K extends keyof ProtocolMap ? ProtocolMap[K]['response'] : any;

export interface TypedSocketAction<K extends SocketAction = SocketAction> {
  type: K;
  payload: SocketActionPayload<K>;
}

export function createSocketAction<K extends SocketAction>(
  type: K,
  payload: SocketActionPayload<K>
): TypedSocketAction<K> {
  return { type, payload };
}

/**
 * What the server answers every `action` with — its one exit, at the foot of the action handler in
 * `server/src/index.ts`. The result is **inside `data`**: an `ADD_TEAM` is answered
 * `{ status: 'ok', data: team }`, never with the team itself. Reading the ack as the result is
 * how a created team was reported as a failure (`FIX-18`).
 *
 * A refusal over a change made since the form was opened carries `conflict` (`SYNC-11`): who
 * changed what, and what is saved now, so the screen can offer *Save mine anyway*.
 *
 * `get_data` and the REST routes answer differently — see `okf/api_comms.md`.
 */
export type ActionAck<T = unknown> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string; conflict?: EditConflict };
