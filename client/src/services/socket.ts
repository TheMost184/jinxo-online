import { io, type Socket } from 'socket.io-client';
import type { AckError, AckResult, ClientToServerEvents, ServerToClientEvents } from '@jinxo/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** ต่อกับ origin เดียวกับหน้าเว็บ (dev ใช้ proxy ของ Vite, production server เสิร์ฟหน้าเว็บเอง) */
export const socket: GameSocket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

export class RequestError extends Error {
  readonly code: AckError['code'] | 'TIMEOUT' | 'OFFLINE';
  constructor(code: RequestError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

type EventWithPayload = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]>['length'] extends 2 ? K : never;
}[keyof ClientToServerEvents];
type EventWithoutPayload = Exclude<keyof ClientToServerEvents, EventWithPayload>;
type PayloadOf<E extends EventWithPayload> = Parameters<ClientToServerEvents[E]>[0];
type DataOf<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...unknown[], (res: AckResult<infer T>) => void] ? T : never;

/** ส่ง event แล้วรอ ack จาก server — reject ด้วย RequestError ที่มีข้อความภาษาไทย */
export function request<E extends EventWithPayload>(event: E, payload: PayloadOf<E>): Promise<DataOf<E>>;
export function request<E extends EventWithoutPayload>(event: E): Promise<DataOf<E>>;
export function request(event: keyof ClientToServerEvents, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new RequestError('OFFLINE', 'ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ รอสักครู่แล้วลองใหม่นะ'));
      return;
    }
    const onAck = (err: Error | null, res: AckResult<unknown>) => {
      if (err) return reject(new RequestError('TIMEOUT', 'เซิร์ฟเวอร์ตอบช้าเกินไป ลองอีกครั้งนะ'));
      if (res.ok) resolve(res.data);
      else reject(new RequestError(res.error.code, res.error.message));
    };
    const s = socket.timeout(8000) as unknown as { emit: (...args: unknown[]) => void };
    if (payload === undefined) s.emit(event, onAck);
    else s.emit(event, payload, onAck);
  });
}
