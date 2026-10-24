import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import type { AckResult, ClientToServerEvents, ServerToClientEvents, SessionInfo } from '@jinxo/shared';
import type { Room } from '../rooms/Room.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import { GameError } from '../utils/errors.js';
import { schemas } from './schemas.js';

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  /** เวลาของ event ล่าสุด ๆ สำหรับ rate limit */
  hits: number[];
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const RATE_WINDOW_MS = 5000;
const RATE_MAX = 80;

interface Ctx {
  socket: IoSocket;
  /** ห้องและผู้เล่นที่ socket นี้ผูกอยู่ (โยน error ถ้ายังไม่ได้เข้าห้อง) */
  bound: () => { room: Room; playerId: string };
}

export function registerHandlers(io: IoServer, rooms: RoomManager) {
  /** ส่ง state ที่ตัดตามมุมมองของแต่ละคน + notice ให้ทุกคนในห้อง */
  function broadcast(room: Room) {
    const notices = room.takeNotices();
    // ส่วนที่ทุกคนเห็นเหมือนกันคำนวณครั้งเดียว แล้วเติมข้อมูลส่วนตัวของแต่ละคน
    const shared = room.sharedView();
    for (const p of room.players) {
      if (!p.socketId || p.left) continue;
      const s = io.sockets.sockets.get(p.socketId);
      if (!s) continue;
      s.emit('room:state', room.viewFor(p.id, shared));
      for (const n of notices) s.emit('room:notice', n);
    }
    if (room.isAbandoned()) rooms.delete(room.code);
  }

  rooms.startTicking(broadcast);

  io.on('connection', (socket: IoSocket) => {
    socket.data.hits = [];

    const bound: Ctx['bound'] = () => {
      const { roomCode, playerId } = socket.data;
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!room || !playerId || !room.getPlayer(playerId) || room.getPlayer(playerId)!.left) {
        throw new GameError('NOT_IN_ROOM', 'คุณยังไม่ได้อยู่ในห้อง กลับไปหน้าแรกเพื่อเข้าห้องใหม่นะ');
      }
      return { room, playerId };
    };

    function bindTo(room: Room, playerId: string) {
      // socket เดิมเคยอยู่ห้องอื่น → ปลดออกก่อน
      if (socket.data.roomCode && socket.data.roomCode !== room.code) {
        const prev = rooms.get(socket.data.roomCode);
        if (prev?.detachSocket(socket.id)) broadcast(prev);
      }
      const player = room.getPlayer(playerId)!;
      // ผู้เล่นคนเดียวกันเปิดอีกแท็บ/reconnect → ตัด socket เก่าทิ้ง
      if (player.socketId && player.socketId !== socket.id) {
        const old = io.sockets.sockets.get(player.socketId);
        if (old) {
          old.data.roomCode = undefined;
          old.data.playerId = undefined;
          old.emit('room:notice', { kind: 'warn', message: 'บัญชีนี้ถูกเปิดจากหน้าต่างอื่น' });
          old.disconnect(true);
        }
      }
      room.attachSocket(playerId, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
    }

    function rateLimited(): boolean {
      const now = Date.now();
      socket.data.hits = socket.data.hits.filter((t) => now - t < RATE_WINDOW_MS);
      socket.data.hits.push(now);
      return socket.data.hits.length > RATE_MAX;
    }

    /**
     * ลงทะเบียน event แบบปลอดภัย: rate limit → validate payload ด้วย zod →
     * รัน action → ตอบ ack → broadcast ถ้ามีการเปลี่ยน state
     */
    function on<S extends z.ZodType | null, T>(
      event: keyof ClientToServerEvents,
      schema: S,
      action: (payload: S extends z.ZodType ? z.output<S> : undefined, ctx: Ctx) => { result: T; room?: Room },
    ) {
      (socket as unknown as { on: (e: string, l: (...args: unknown[]) => void) => void }).on(
        event,
        (...args: unknown[]) => {
          const last = args[args.length - 1];
          const ack = (typeof last === 'function' ? last : () => {}) as (r: AckResult<T>) => void;
          const raw = schema ? args[0] : undefined;
          try {
            if (rateLimited()) throw new GameError('RATE_LIMITED', 'ส่งคำสั่งถี่เกินไป รอสักครู่นะ');
            let payload: unknown = undefined;
            if (schema) {
              const parsed = schema.safeParse(raw);
              if (!parsed.success) {
                throw new GameError('INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
              }
              payload = parsed.data;
            }
            const { result, room } = action(payload as never, { socket, bound });
            ack({ ok: true, data: result });
            if (room) broadcast(room);
          } catch (err) {
            if (err instanceof GameError) {
              ack({ ok: false, error: { code: err.code, message: err.message } });
            } else {
              console.error(`[socket] ${event} failed`, err);
              ack({ ok: false, error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ ลองอีกครั้งนะ' } });
            }
          }
        },
      );
    }

    const session = (room: Room, playerId: string): SessionInfo => ({
      roomCode: room.code,
      playerId,
      token: room.getPlayer(playerId)!.token,
    });

    // ── room membership ──
    on('room:create', schemas.create, ({ name }) => {
      const room = rooms.create();
      try {
        const p = room.addPlayer(name);
        bindTo(room, p.id);
        return { result: session(room, p.id), room };
      } catch (e) {
        rooms.delete(room.code);
        throw e;
      }
    });

    on('room:join', schemas.join, ({ roomCode, name }) => {
      const room = rooms.mustGet(roomCode);
      const p = room.addPlayer(name);
      bindTo(room, p.id);
      return { result: session(room, p.id), room };
    });

    on('room:rejoin', schemas.rejoin, ({ roomCode, playerId, token }) => {
      const room = rooms.get(roomCode);
      if (!room) throw new GameError('SESSION_INVALID', 'ห้องนี้ปิดไปแล้ว');
      room.authenticate(playerId, token);
      bindTo(room, playerId);
      return { result: session(room, playerId), room };
    });

    on('room:leave', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.leave(playerId);
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      return { result: null, room };
    });

    // ── lobby ──
    on('lobby:setCategories', schemas.setCategories, ({ categories }, { bound: b }) => {
      const { room, playerId } = b();
      room.setCategories(playerId, categories);
      return { result: null, room };
    });

    on('lobby:kick', schemas.kick, ({ playerId: targetId }, { bound: b }) => {
      const { room, playerId } = b();
      const kicked = room.kick(playerId, targetId);
      const ks = kicked.socketId ? io.sockets.sockets.get(kicked.socketId) : undefined;
      if (ks) {
        ks.data.roomCode = undefined;
        ks.data.playerId = undefined;
        ks.emit('room:kicked', { kind: 'warn', message: 'คุณถูกนำออกจากห้องโดย Host' });
      }
      return { result: null, room };
    });

    on('game:start', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.start(playerId);
      return { result: null, room };
    });

    // ── answering ──
    on('answer:submit', schemas.submit, ({ placements }, { bound: b }) => {
      const { room, playerId } = b();
      room.submitAnswers(playerId, placements);
      return { result: null, room };
    });

    on('host:skipWaiting', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.skipWaiting(playerId);
      return { result: null, room };
    });

    // ── โหมดคิดโจทย์เอง ──
    on('question:submit', schemas.question, ({ question }, { bound: b }) => {
      const { room, playerId } = b();
      room.submitQuestion(playerId, question);
      return { result: null, room };
    });

    on('host:rerollAuthor', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.rerollAuthor(playerId);
      return { result: null, room };
    });

    // ── reveal ทีละคน ──
    on('reveal:nextAnswer', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.revealNextAnswer(playerId);
      return { result: null, room };
    });

    on('reveal:nextPlayer', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.nextPlayer(playerId);
      return { result: null, room };
    });

    on('match:request', schemas.matchRequest, ({ targetAnswerId, cellIndex }, { bound: b }) => {
      const { room, playerId } = b();
      room.requestMatch(playerId, targetAnswerId, cellIndex);
      return { result: null, room };
    });

    on('match:decide', schemas.matchDecide, ({ requestId, approve }, { bound: b }) => {
      const { room, playerId } = b();
      room.decideMatch(playerId, requestId, approve);
      return { result: null, room };
    });

    on('match:undo', schemas.matchUndo, ({ requestId }, { bound: b }) => {
      const { room, playerId } = b();
      room.undoMatch(playerId, requestId);
      return { result: null, room };
    });

    on('answer:like', schemas.like, ({ answerId, like }, { bound: b }) => {
      const { room, playerId } = b();
      room.setLike(playerId, answerId, like);
      return { result: null, room };
    });

    // ── results ──
    on('round:next', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.nextRound(playerId);
      return { result: null, room };
    });

    on('game:playAgain', null, (_p, { bound: b }) => {
      const { room, playerId } = b();
      room.playAgain(playerId);
      return { result: null, room };
    });

    socket.on('disconnect', () => {
      const code = socket.data.roomCode;
      if (!code) return;
      const room = rooms.get(code);
      if (room?.detachSocket(socket.id)) broadcast(room);
    });
  });
}
