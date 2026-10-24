import type { Placement, RoomView, SessionInfo } from './types.js';

/** โค้ด error ที่ client ใช้แสดงข้อความ/ตัดสินใจ (เช่น session หมดอายุ → กลับหน้าแรก) */
export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NAME_TAKEN'
  | 'SESSION_INVALID'
  | 'KICKED'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'NOT_AUTHOR'
  | 'WRONG_PHASE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ENOUGH_QUESTIONS'
  | 'ALREADY_SUBMITTED'
  | 'NOT_A_PLAYER'
  | 'DUPLICATE_ANSWER'
  | 'CELL_TAKEN'
  | 'PENDING_REQUESTS'
  | 'REVEAL_NOT_DONE'
  | 'NOTHING_TO_REVEAL'
  | 'STALE_TARGET'
  | 'DUPLICATE_REQUEST'
  | 'INVALID_MATCH'
  | 'ALREADY_DECIDED'
  | 'NOT_REVEALED'
  | 'OWN_ANSWER'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AckError {
  code: ErrorCode;
  message: string;
}

export type AckResult<T = null> = { ok: true; data: T } | { ok: false; error: AckError };
export type Ack<T = null> = (res: AckResult<T>) => void;

/** Event ที่ client ส่งหา server — ทุก event มี ack callback ตอบกลับเสมอ */
export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, ack: Ack<SessionInfo>) => void;
  'room:join': (payload: { roomCode: string; name: string }, ack: Ack<SessionInfo>) => void;
  'room:rejoin': (payload: SessionInfo, ack: Ack<SessionInfo>) => void;
  'room:leave': (ack: Ack) => void;

  'lobby:setCategories': (payload: { categories: string[] }, ack: Ack) => void;
  'lobby:kick': (payload: { playerId: string }, ack: Ack) => void;
  'game:start': (ack: Ack) => void;

  /** โหมดคิดโจทย์เอง */
  'question:submit': (payload: { question: string }, ack: Ack) => void;
  'host:rerollAuthor': (ack: Ack) => void;

  'answer:submit': (payload: { placements: Placement[] }, ack: Ack) => void;
  'host:skipWaiting': (ack: Ack) => void;

  /** Host: เปิดคำถัดไปของคนที่กำลังเปิดอยู่ */
  'reveal:nextAnswer': (ack: Ack) => void;
  /** Host: ไปคนถัดไป (คนสุดท้าย = ไปหน้า Round Summary) */
  'reveal:nextPlayer': (ack: Ack) => void;
  /** เสนอว่าคำในช่อง cellIndex บนกระดานตัวเอง ความหมายเดียวกับคำที่กำลังเปิด */
  'match:request': (payload: { targetAnswerId: string; cellIndex: number }, ack: Ack) => void;
  'match:decide': (payload: { requestId: string; approve: boolean }, ack: Ack) => void;
  'match:undo': (payload: { requestId: string }, ack: Ack) => void;
  'answer:like': (payload: { answerId: string; like: boolean }, ack: Ack) => void;

  'round:next': (ack: Ack) => void;
  'game:playAgain': (ack: Ack) => void;
}

export interface Notice {
  kind: 'info' | 'warn';
  message: string;
}

/** Event ที่ server ส่งหา client */
export interface ServerToClientEvents {
  /** state ทั้งห้องในมุมมองของผู้รับ — ส่งทุกครั้งที่มีอะไรเปลี่ยน */
  'room:state': (state: RoomView) => void;
  'room:notice': (notice: Notice) => void;
  /** ถูก Host เตะออก — client ล้าง session แล้วกลับหน้าแรก */
  'room:kicked': (notice: Notice) => void;
}
