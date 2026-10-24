import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Placement, RoomView } from '@jinxo/shared';
import { RequestError, request, socket } from '../services/socket';
import { clearSession, loadSession, saveLastName, saveSession } from '../services/session';
import type { ConnectionStatus, Toast } from '../types';

interface GameContextValue {
  room: RoomView | null;
  /** state ล่าสุดที่เคยมี — ให้หน้าที่กำลังเล่น animation ออก (เช่นตอนถูกเตะ/ออกจากห้อง) ยัง render ได้ */
  lastRoom: RoomView | null;
  connection: ConnectionStatus;
  /** กำลังพยายามกลับเข้าห้องเดิมหลังรีเฟรช */
  restoring: boolean;
  toasts: Toast[];
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
  actions: {
    createRoom: (name: string) => Promise<boolean>;
    joinRoom: (roomCode: string, name: string) => Promise<boolean>;
    leaveRoom: () => Promise<void>;
    setCategories: (categories: string[]) => Promise<boolean>;
    startGame: () => Promise<boolean>;
    submitAnswers: (placements: Placement[]) => Promise<boolean>;
    skipWaiting: () => Promise<boolean>;
    kickPlayer: (playerId: string) => Promise<boolean>;
    submitQuestion: (question: string) => Promise<boolean>;
    rerollAuthor: () => Promise<boolean>;
    revealNextAnswer: () => Promise<boolean>;
    nextPlayer: () => Promise<boolean>;
    requestMatch: (targetAnswerId: string, cellIndex: number) => Promise<boolean>;
    decideMatch: (requestId: string, approve: boolean) => Promise<boolean>;
    undoMatch: (requestId: string) => Promise<boolean>;
    setLike: (answerId: string, like: boolean) => Promise<boolean>;
    nextRound: () => Promise<boolean>;
    playAgain: () => Promise<boolean>;
  };
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>(socket.connected ? 'online' : 'connecting');
  const [restoring, setRestoring] = useState(() => loadSession() !== null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismissToast(id), kind === 'error' ? 5000 : 3200);
    },
    [dismissToast],
  );

  useEffect(() => {
    const rejoin = async () => {
      const s = loadSession();
      if (!s) {
        setRestoring(false);
        return;
      }
      setRestoring(true);
      try {
        await request('room:rejoin', s);
      } catch (e) {
        const err = e as RequestError;
        if (err.code !== 'OFFLINE' && err.code !== 'TIMEOUT') {
          // รวมถึงกรณีถูกเตะ (KICKED) — token เดิมใช้ไม่ได้แล้ว
          clearSession();
          setRoom(null);
          toast('warn', err.message);
        }
      } finally {
        setRestoring(false);
      }
    };
    const onConnect = () => {
      setConnection('online');
      void rejoin();
    };
    const onDisconnect = (reason: string) => {
      // server ตัดเพราะผู้เล่นคนเดียวกันเปิดจากแท็บอื่น
      setConnection(reason === 'io server disconnect' ? 'replaced' : 'offline');
    };
    const onConnectError = () => setConnection('offline');
    const onState = (s: RoomView) => setRoom(s);
    const onNotice = (n: { kind: 'info' | 'warn'; message: string }) => toast(n.kind, n.message);
    const onKicked = (n: { kind: 'info' | 'warn'; message: string }) => {
      clearSession();
      setRoom(null);
      history.replaceState(null, '', '/');
      toast('error', n.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:state', onState);
    socket.on('room:notice', onNotice);
    socket.on('room:kicked', onKicked);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:state', onState);
      socket.off('room:notice', onNotice);
      socket.off('room:kicked', onKicked);
    };
  }, [toast]);

  /** ห่อทุก action: แสดง error เป็น toast แล้วคืน true/false ให้ UI ตัดสินใจต่อ */
  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      try {
        await fn();
        return true;
      } catch (e) {
        const err = e as RequestError;
        toast('error', err.message || 'เกิดข้อผิดพลาด');
        if (err.code === 'NOT_IN_ROOM' || err.code === 'SESSION_INVALID' || err.code === 'KICKED') {
          clearSession();
          setRoom(null);
        }
        return false;
      }
    },
    [toast],
  );

  const actions = useMemo<GameContextValue['actions']>(
    () => ({
      createRoom: (name) =>
        run(async () => {
          const s = await request('room:create', { name });
          saveSession(s);
          saveLastName(name.trim());
        }),
      joinRoom: (roomCode, name) =>
        run(async () => {
          const s = await request('room:join', { roomCode, name });
          saveSession(s);
          saveLastName(name.trim());
        }),
      leaveRoom: async () => {
        try {
          await request('room:leave');
        } catch {
          /* ออกฝั่ง client ต่อได้แม้ server ไม่ตอบ */
        }
        clearSession();
        setRoom(null);
        history.replaceState(null, '', '/');
      },
      setCategories: (categories) => run(() => request('lobby:setCategories', { categories })),
      startGame: () => run(() => request('game:start')),
      submitAnswers: (placements) => run(() => request('answer:submit', { placements })),
      skipWaiting: () => run(() => request('host:skipWaiting')),
      kickPlayer: (playerId) => run(() => request('lobby:kick', { playerId })),
      submitQuestion: (question) => run(() => request('question:submit', { question })),
      rerollAuthor: () => run(() => request('host:rerollAuthor')),
      revealNextAnswer: () => run(() => request('reveal:nextAnswer')),
      nextPlayer: () => run(() => request('reveal:nextPlayer')),
      requestMatch: (targetAnswerId, cellIndex) => run(() => request('match:request', { targetAnswerId, cellIndex })),
      decideMatch: (requestId, approve) => run(() => request('match:decide', { requestId, approve })),
      undoMatch: (requestId) => run(() => request('match:undo', { requestId })),
      setLike: (answerId, like) => run(() => request('answer:like', { answerId, like })),
      nextRound: () => run(() => request('round:next')),
      playAgain: () => run(() => request('game:playAgain')),
    }),
    [run],
  );

  const lastRoom = useRef<RoomView | null>(null);
  if (room) lastRoom.current = room;

  const value = useMemo(
    () => ({ room, lastRoom: lastRoom.current, connection, restoring, toasts, toast, dismissToast, actions }),
    [room, connection, restoring, toasts, toast, dismissToast, actions],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame ต้องอยู่ใน <GameProvider>');
  return ctx;
}

/** state ของห้อง (ใช้ในหน้าที่แน่ใจว่าอยู่ในห้องแล้ว) */
export function useRoom(): RoomView {
  const { room, lastRoom } = useGame();
  const r = room ?? lastRoom;
  if (!r) throw new Error('ยังไม่ได้อยู่ในห้อง');
  return r;
}
