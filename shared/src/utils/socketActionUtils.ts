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
