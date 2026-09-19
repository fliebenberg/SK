import { SocketAction } from '../constants/SocketActions';
import { ProtocolMap } from '../types/Protocol';

export type SocketActionPayload<K extends SocketAction> = K extends keyof ProtocolMap ? ProtocolMap[K]['payload'] : any;
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
 * `get_data` and the REST routes answer differently — see `okf/api_comms.md`.
 */
export type ActionAck<T = unknown> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string };
