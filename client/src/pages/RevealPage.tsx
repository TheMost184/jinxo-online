import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerGroupView, AnswerView, MatchRequestView, PlayerView, RevealCell, RoomView } from '@jinxo/shared';
import { AnswerTile, LikeButton, kindClass } from '../components/AnswerTile';
import { BoardFrame } from '../components/BoardFrame';
import { JinxOBurst } from '../components/Celebrate';
import { Avatar, Button, Modal } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';
import { topicStyle } from '../lib/palette';

const KIND_LABEL = { jinxo: 'JinxO!', match: 'ตรงกัน', none: 'ยังไม่ตรงกับใคร' } as const;

export function RevealPage() {
  const room = useRoom();
  // ระหว่าง transition ออกจากหน้า state อาจเปลี่ยน phase ไปแล้ว
  if (!room.reveal) return null;
  return <RevealContent room={room} />;
}

function RevealContent({ room }: { room: RoomView }) {
  const { actions } = useGame();
  const reveal = room.reveal!;
  const me = room.you.id;
  const isHost = room.you.isHost;
  const playersById = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const groupsById = useMemo(() => new Map(reveal.groups.map((g) => [g.id, g])), [reveal.groups]);
  const boardsById = useMemo(() => new Map(reveal.boards.map((b) => [b.playerId, b])), [reveal.boards]);
  const answersById = useMemo(() => {
    const m = new Map<string, AnswerView>();
    for (const b of reveal.boards) for (const c of b.cells) if (c.state === 'shown') m.set(c.answer.id, c.answer);
    return m;
  }, [reveal.boards]);
  const myLikes = useMemo(() => new Set(room.myLikes), [room.myLikes]);
  const nameOf = (id: string) => playersById.get(id)?.name ?? '?';

  const current = reveal.currentPlayerId;
  const focus = reveal.focusAnswerId ? (answersById.get(reveal.focusAnswerId) ?? null) : null;
  const focusGroup = focus ? groupsById.get(focus.groupId) : undefined;
  const pending = reveal.requests.filter((r) => r.status === 'pending');
  const currentBoard = boardsById.get(current)!;
  const isLast = reveal.currentIndex >= reveal.order.length - 1;

  // ดูกระดานคนอื่นที่เปิดไปแล้วได้ (เพื่อกลับไปกด Like) — เปลี่ยนคน = กลับมาดูคนที่กำลังเปิด
  const [viewId, setViewId] = useState(current);
  useEffect(() => setViewId(current), [current]);
  const viewBoard = boardsById.get(viewId) ?? currentBoard;

  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  // ── Match Request: เลือกคำบนกระดานตัวเอง ──
  const alreadyRequested = Boolean(focus && reveal.requests.some((r) => r.requesterId === me && r.target.answerId === focus.id));
  const canOffer =
    Boolean(focus) && focus!.playerId !== me && !alreadyRequested && !(focusGroup?.playerIds.includes(me) ?? false);
  const offerable = (i: number) => {
    const c = room.myBoard[i];
    return canOffer && c !== null && c.topicIndex === focus!.topicIndex;
  };
  const [offer, setOffer] = useState<number | null>(null);
  useEffect(() => setOffer(null), [reveal.focusAnswerId]);

  // ── JinxO burst: ตอนเปิดคำที่เป็น JinxO หรือ Host อนุมัติแล้วกลายเป็น JinxO ──
  const [burst, setBurst] = useState<{ key: string; group: AnswerGroupView } | null>(null);
  const seen = useRef<{ focus: string | null; approved: Set<string> }>({
    focus: reveal.focusAnswerId,
    approved: new Set(reveal.requests.filter((r) => r.status === 'approved').map((r) => r.id)),
  });
  // การ์ดผลการตัดสินล่าสุด (โชว์สั้น ๆ ให้ทุกคน)
  const [verdict, setVerdict] = useState<MatchRequestView | null>(null);
  const decided = useRef(new Set(reveal.requests.filter((r) => r.status !== 'pending').map((r) => r.id)));
  useEffect(() => {
    let g: AnswerGroupView | undefined;
    let key = '';
    if (reveal.focusAnswerId && reveal.focusAnswerId !== seen.current.focus) {
      seen.current.focus = reveal.focusAnswerId;
      const a = answersById.get(reveal.focusAnswerId);
      const fg = a ? groupsById.get(a.groupId) : undefined;
      if (fg?.kind === 'jinxo') {
        g = fg;
        key = `f-${reveal.revealCount}`;
      }
    }
    for (const r of reveal.requests) {
      if (r.status !== 'pending' && !decided.current.has(r.id)) {
        decided.current.add(r.id);
        setVerdict(r);
      }
      if (r.status === 'approved' && !seen.current.approved.has(r.id)) {
        seen.current.approved.add(r.id);
        const a = answersById.get(r.target.answerId);
        const ag = a ? groupsById.get(a.groupId) : undefined;
        if (ag?.kind === 'jinxo') {
          g = ag;
          key = `m-${r.id}`;
        }
      }
    }
    if (g) {
      setBurst({ key, group: g });
      const t = setTimeout(() => setBurst(null), 2300);
      return () => clearTimeout(t);
    }
  }, [reveal.focusAnswerId, reveal.requests, reveal.revealCount, answersById, groupsById]);
  useEffect(() => {
    if (!verdict) return;
    const t = setTimeout(() => setVerdict(null), 2200);
    return () => clearTimeout(t);
  }, [verdict]);

  const like = (answerId: string, on: boolean) => void actions.setLike(answerId, on);

  const renderPublicCell = (cell: RevealCell) => (
    <AnswerTile
      cell={cell}
      focused={cell.state === 'shown' && cell.answer.id === reveal.focusAnswerId}
      liked={cell.state === 'shown' && myLikes.has(cell.answer.id)}
      canLike={cell.state === 'shown' && cell.answer.playerId !== me}
      onLike={(on) => cell.state === 'shown' && like(cell.answer.id, on)}
    />
  );

  /** กระดานของฉัน: ข้อความเห็นเสมอ สถานะคะแนนโชว์เมื่อช่องนั้นถูกเปิดแล้วเท่านั้น */
  const myPublic = boardsById.get(me);
  const renderMyCell = (i: number) => {
    const mine = room.myBoard[i];
    const pub = myPublic?.cells[i];
    if (!mine) return <div className="h-full rounded-2xl border-2 border-dashed border-ink/20" />;
    const selectable = offerable(i);
    if (pub?.state === 'shown') {
      return (
        <button
          type="button"
          disabled={!selectable}
          onClick={() => setOffer(i)}
          className={`h-full w-full ${selectable ? 'animate-pulse rounded-2xl ring-4 ring-sky' : 'cursor-default'}`}
        >
          <AnswerTile cell={pub} canLike={false} />
        </button>
      );
    }
    const ts = topicStyle(mine.topicIndex);
    return (
      <button
        type="button"
        disabled={!selectable}
        onClick={() => setOffer(i)}
        className={`relative flex h-full w-full flex-col items-center justify-center rounded-2xl border-[2.5px] border-dashed border-ink p-1 text-center ${ts.solid} ${
          selectable ? 'animate-pulse cursor-pointer border-solid shadow-chunk-sm ring-4 ring-sky' : 'cursor-default'
        }`}
      >
        <span className={`absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${ts.dot}`} />
        <span className="line-clamp-3 font-display text-[15px] leading-tight break-words sm:text-lg">{mine.text}</span>
        <span className="text-[11px] text-ink-soft">{selectable ? 'แตะเพื่อเสนอ' : 'ยังไม่เปิด'}</span>
      </button>
    );
  };

  const offerText = offer !== null ? room.myBoard[offer]?.text : '';

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-40">
      <JinxOBurst
        burstKey={burst?.key ?? null}
        word={burst?.group.label ?? ''}
        names={burst?.group.playerIds.map(nameOf) ?? []}
      />

      <OrderStrip room={room} playersById={playersById} viewId={viewId} onView={setViewId} />

      <Spotlight
        room={room}
        focus={focus}
        focusGroup={focusGroup}
        nameOf={nameOf}
        liked={focus ? myLikes.has(focus.id) : false}
        onLike={(on) => focus && like(focus.id, on)}
        hint={
          !focus
            ? null
            : focus.playerId === me
              ? 'นี่คือคำของคุณ'
              : alreadyRequested
                ? 'ส่งคำขอสำหรับคำนี้แล้ว รอ Host ตัดสิน'
                : focusGroup?.playerIds.includes(me)
                  ? 'คุณมีคำที่ตรงกับคำนี้แล้ว'
                  : room.myBoard.some((_, i) => offerable(i))
                    ? 'มีคำที่ความหมายเดียวกันไหม? แตะคำนั้นบนกระดานของคุณเพื่อเสนอให้ Host'
                    : null
        }
      >
        {isHost ? (
          <div className="flex flex-wrap gap-2">
            <Button
              tone="pink"
              disabled={busy || pending.length > 0 || currentBoard.complete}
              onClick={() => void act(actions.revealNextAnswer)}
            >
              เปิดคำถัดไป
            </Button>
            <Button
              tone={currentBoard.complete ? 'mint' : 'paper'}
              disabled={busy || pending.length > 0 || !currentBoard.complete}
              onClick={() => void act(actions.nextPlayer)}
            >
              {isLast ? 'ไปหน้าสรุปรอบ' : `คนถัดไป: ${nameOf(reveal.order[reveal.currentIndex + 1])}`}
            </Button>
            {pending.length > 0 && <p className="w-full text-[14px] text-ink-soft">ตัดสินคำขอจับคู่ก่อนถึงจะไปต่อได้</p>}
          </div>
        ) : (
          <p className="text-[15px] text-ink-soft">Host เป็นคนกดเปิดคำตอบ</p>
        )}
      </Spotlight>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="slab p-3 sm:p-4">
          <BoardHeader
            player={playersById.get(me)}
            title="กระดานของฉัน"
            points={myPublic?.points ?? 0}
            likes={myPublic?.likes ?? 0}
          />
          <BoardFrame
            size="lg"
            scoring={room.config.scoring}
            achieved={myPublic?.bonusLines ?? []}
            renderCell={renderMyCell}
          />
        </section>

        <section className="slab order-first p-3 sm:p-4 lg:order-none">
          <BoardHeader
            player={playersById.get(viewBoard.playerId)}
            title={viewBoard.playerId === me ? 'กระดานของฉัน' : `กระดานของ ${nameOf(viewBoard.playerId)}`}
            badge={viewBoard.playerId === current ? 'กำลังเปิด' : viewBoard.complete ? 'เปิดครบแล้ว' : 'ยังไม่ถึงตา'}
            points={viewBoard.points}
            likes={viewBoard.likes}
            onBack={viewBoard.playerId !== current ? () => setViewId(current) : undefined}
          />
          <BoardFrame
            size="lg"
            scoring={room.config.scoring}
            achieved={viewBoard.bonusLines}
            renderCell={(i) => renderPublicCell(viewBoard.cells[i])}
          />
        </section>
      </div>

      <MatchLog room={room} nameOf={nameOf} isHost={isHost} onUndo={(id) => void act(() => actions.undoMatch(id))} />
      <LiveScores room={room} />

      {/* คำขอจับคู่ — การ์ดลอยที่ทุกคนเห็นตรงกัน */}
      <RequestQueue
        pending={pending}
        verdict={verdict}
        nameOf={nameOf}
        isHost={isHost}
        busy={busy}
        onDecide={(id, approve) => void act(() => actions.decideMatch(id, approve))}
      />

      <Modal open={offer !== null} title="เสนอให้จับคู่?" onClose={() => setOffer(null)}>
        <p className="mb-1 text-ink-soft">คำที่เปิด</p>
        <p className="mb-3 font-display text-2xl">“{focus?.text}” ของ {focus ? nameOf(focus.playerId) : ''}</p>
        <p className="mb-1 text-ink-soft">คำของคุณ</p>
        <p className="mb-4 font-display text-2xl">“{offerText}”</p>
        <p className="mb-5 text-[14px] text-ink-soft">ส่งได้ครั้งเดียวต่อคำที่เปิด Host จะเป็นคนตัดสินว่าความหมายเดียวกันไหม</p>
        <div className="flex justify-end gap-3">
          <Button tone="paper" onClick={() => setOffer(null)}>
            ยกเลิก
          </Button>
          <Button
            tone="pink"
            disabled={busy}
            onClick={() => {
              const cell = offer;
              setOffer(null);
              if (focus && cell !== null) void act(() => actions.requestMatch(focus.id, cell));
            }}
          >
            ส่งให้ Host ตัดสิน
          </Button>
        </div>
      </Modal>
    </main>
  );
}

function OrderStrip({
  room,
  playersById,
  viewId,
  onView,
}: {
  room: RoomView;
  playersById: Map<string, PlayerView>;
  viewId: string;
  onView: (id: string) => void;
}) {
  const reveal = room.reveal!;
  return (
    <nav aria-label="ลำดับการเปิดคำตอบ" className="-mx-4 overflow-x-auto px-4 pb-1">
      <ol className="flex w-max items-center gap-1.5">
        {reveal.order.map((pid, i) => {
          const p = playersById.get(pid);
          const done = i < reveal.currentIndex;
          const now = i === reveal.currentIndex;
          const viewable = i <= reveal.currentIndex;
          return (
            <li key={pid} className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!viewable}
                onClick={() => onView(pid)}
                aria-current={now ? 'step' : undefined}
                title={viewable ? `ดูกระดานของ ${p?.name}` : `ลำดับที่ ${i + 1}`}
                className={`flex items-center gap-1.5 rounded-full border-[2.5px] py-0.5 pr-2.5 pl-0.5 text-[14px] transition-transform ${
                  now ? 'border-ink bg-butter font-medium shadow-chunk-sm' : done ? 'border-ink bg-paper' : 'border-ink/25 bg-paper/50 text-ink-soft'
                } ${pid === viewId && !now ? 'ring-4 ring-sky' : ''}`}
              >
                {p && <Avatar name={p.name} color={p.color} size={24} dim={!viewable} />}
                <span className="max-w-[7rem] truncate">{p?.name}</span>
                {done && <span aria-label="เปิดครบแล้ว">✓</span>}
              </button>
              {i < reveal.order.length - 1 && <span className="text-ink/30" aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Spotlight({
  room,
  focus,
  focusGroup,
  nameOf,
  liked,
  onLike,
  hint,
  children,
}: {
  room: RoomView;
  focus: AnswerView | null;
  focusGroup: AnswerGroupView | undefined;
  nameOf: (id: string) => string;
  liked: boolean;
  onLike: (on: boolean) => void;
  hint: string | null;
  children: React.ReactNode;
}) {
  const reveal = room.reveal!;
  const current = reveal.currentPlayerId;
  const board = reveal.boards.find((b) => b.playerId === current)!;
  const preShown = board.cells.filter((c) => c.state === 'shown' && c.answer.revealedBy === 'match').length;
  const topic = focus ? room.topics[focus.topicIndex] : null;
  const others = focusGroup ? focusGroup.playerIds.filter((id) => id !== focus?.playerId) : [];

  return (
    <section className="slab flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[15px] text-ink-soft">
          คนที่ {reveal.currentIndex + 1} จาก {reveal.order.length}: <span className="font-medium text-ink">{nameOf(current)}</span>
        </p>
        {/* ไม่ใช้ AnimatePresence mode="wait" — Host กดเร็ว ๆ แล้วข้อความเก่าค้างได้ ให้เล่นแค่ตอนเข้า */}
        <motion.div key={focus?.id ?? `p-${current}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {focus ? (
              <div className="flex flex-col gap-2">
                {topic && (
                  <p className="flex items-center gap-1.5 text-[14px] text-ink-soft">
                    <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${topicStyle(focus.topicIndex).dot}`} />
                    {topic.question}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-4xl font-medium break-words">“{focus.text}”</h2>
                  <span className={`rounded-xl border-[2.5px] border-ink px-2.5 py-0.5 font-display text-lg ${kindClass(focus)}`}>
                    {KIND_LABEL[focus.kind]}
                    {focus.kind !== 'none' && ` ${focus.groupSize} คน ได้คนละ +${focusGroup?.pointsPerCell ?? focus.points}`}
                  </span>
                  <LikeButton count={focus.likes} liked={liked} disabled={focus.playerId === room.you.id} onToggle={() => onLike(!liked)} />
                </div>
                {others.length > 0 && (
                  <p className="text-[15px]">
                    ตรงกับ <span className="font-medium">{others.map(nameOf).join(', ')}</span>
                    {focusGroup && focusGroup.variants.length > 1 && (
                      <span className="text-ink-soft"> ({focusGroup.variants.join(' = ')})</span>
                    )}
                  </p>
                )}
                {hint && <p className="text-[14px] text-ink-soft">{hint}</p>}
              </div>
            ) : (
              <div>
                <h2 className="text-3xl font-medium">ตาของ {nameOf(current)}</h2>
                <p className="text-[15px] text-ink-soft">
                  {board.complete
                    ? 'คำตอบของคนนี้เปิดครบแล้ว'
                    : preShown > 0
                      ? `คำที่ตรงกับคนก่อนหน้าเปิดไว้แล้ว ${preShown} ช่อง เหลือเปิดอีก ${board.cells.filter((c) => c.state === 'hidden').length} ช่อง`
                      : 'ยังไม่มีคำไหนถูกเปิด'}
                </p>
              </div>
            )}
        </motion.div>
      </div>
      <div className="shrink-0">{children}</div>
    </section>
  );
}

function BoardHeader({
  player,
  title,
  badge,
  points,
  likes,
  onBack,
}: {
  player: PlayerView | undefined;
  title: string;
  badge?: string;
  points: number;
  likes: number;
  onBack?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {player && <Avatar name={player.name} color={player.color} size={32} dim={!player.connected} />}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-medium">{title}</h2>
        {badge && <p className="text-[13px] text-ink-soft">{badge}</p>}
      </div>
      {onBack && (
        <Button tone="paper" size="sm" onClick={onBack}>
          กลับไปคนที่กำลังเปิด
        </Button>
      )}
      <span className="rounded-xl border-2 border-ink bg-paper px-2 text-[14px]" title="จำนวน Like (ไม่นับเป็นคะแนน)">
        ♥ {likes}
      </span>
      <motion.span
        key={points}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
        className="rounded-xl border-2 border-ink bg-butter px-2 font-display text-lg"
        title="คะแนนรอบนี้จากช่องที่เปิดแล้ว"
      >
        {points}
      </motion.span>
    </div>
  );
}

function RequestQueue({
  pending,
  verdict,
  nameOf,
  isHost,
  busy,
  onDecide,
}: {
  pending: MatchRequestView[];
  verdict: MatchRequestView | null;
  nameOf: (id: string) => string;
  isHost: boolean;
  busy: boolean;
  onDecide: (id: string, approve: boolean) => void;
}) {
  const head = pending[0];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-4">
      <AnimatePresence mode="popLayout">
        {head ? (
          <motion.div
            key={head.id}
            role="dialog"
            aria-live="assertive"
            aria-label="คำขอจับคู่คำตอบ"
            className="slab pointer-events-auto w-full max-w-md !bg-sky-soft p-4"
            initial={{ y: 80, scale: 0.8, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <p className="font-display text-lg">{nameOf(head.requesterId)} เสนอให้จับคู่คำตอบ</p>
            <div className="my-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
              <span className="text-ink-soft">คำที่เปิด</span>
              <span className="font-display">“{head.target.text}” ({nameOf(head.target.playerId)})</span>
              <span className="text-ink-soft">คำที่เสนอ</span>
              <span className="font-display">“{head.offered.text}”</span>
              <span className="text-ink-soft">สถานะ</span>
              <span>รอ Host ตัดสิน{pending.length > 1 ? ` (อีก ${pending.length - 1} คำขอในคิว)` : ''}</span>
            </div>
            {isHost && (
              <div className="mt-3 flex gap-2">
                <Button tone="mint" className="flex-1" disabled={busy} onClick={() => onDecide(head.id, true)}>
                  อนุมัติ ความหมายเดียวกัน
                </Button>
                <Button tone="paper" disabled={busy} onClick={() => onDecide(head.id, false)}>
                  ไม่ใช่
                </Button>
              </div>
            )}
          </motion.div>
        ) : verdict ? (
          <motion.div
            key={`v-${verdict.id}`}
            className={`slab pointer-events-auto px-4 py-3 font-display text-lg ${verdict.status === 'approved' ? '!bg-mint-soft' : '!bg-paper'}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {verdict.status === 'approved'
              ? `จับคู่สำเร็จ “${verdict.offered.text}” = “${verdict.target.text}”`
              : verdict.status === 'rejected'
                ? `Host ไม่นับ “${verdict.offered.text}” = “${verdict.target.text}”`
                : `ยกเลิกการจับคู่ “${verdict.offered.text}”`}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MatchLog({
  room,
  nameOf,
  isHost,
  onUndo,
}: {
  room: RoomView;
  nameOf: (id: string) => string;
  isHost: boolean;
  onUndo: (id: string) => void;
}) {
  const decided = room.reveal!.requests.filter((r) => r.status !== 'pending');
  if (decided.length === 0) return null;
  const label = { approved: 'อนุมัติ', rejected: 'ไม่นับ', undone: 'ยกเลิกแล้ว', pending: '' } as const;
  return (
    <section className="slab p-4">
      <h2 className="mb-2 text-lg font-medium">คำขอจับคู่รอบนี้</h2>
      <ul className="flex flex-wrap gap-2">
        {decided
          .slice()
          .reverse()
          .map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 rounded-2xl border-2 border-ink px-2.5 py-1 text-[14px] ${
                r.status === 'approved' ? 'bg-mint-soft' : 'bg-paper text-ink-soft'
              }`}
            >
              <span>
                <span className="font-display">{r.offered.text}</span> = <span className="font-display">{r.target.text}</span>
                <span className="ml-1">({nameOf(r.requesterId)}, {label[r.status]})</span>
              </span>
              {isHost && r.status === 'approved' && (
                <button type="button" className="rounded-lg border-2 border-ink bg-paper px-1.5 text-[13px]" onClick={() => onUndo(r.id)}>
                  ยกเลิก
                </button>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}

function LiveScores({ room }: { room: RoomView }) {
  const reveal = room.reveal!;
  const rows = reveal.boards
    .map((b) => {
      const p = room.players.find((x) => x.id === b.playerId);
      return { b, p, total: (p?.totalScore ?? 0) + b.points };
    })
    .sort((x, y) => y.total - x.total);
  return (
    <section className="slab p-4">
      <h2 className="mb-1 text-lg font-medium">คะแนนตอนนี้</h2>
      <p className="mb-3 text-[13px] text-ink-soft">นับจากคำที่เปิดแล้ว อัปเดตทันทีเมื่อ Host อนุมัติการจับคู่ ♥ ไม่นับเป็นคะแนน</p>
      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ b, p, total }) => (
          <li key={b.playerId} className="flex items-center gap-2 rounded-xl bg-mat/60 px-2 py-1">
            {p && <Avatar name={p.name} color={p.color} size={24} />}
            <span className="min-w-0 flex-1 truncate">{p?.name}</span>
            <span className="text-[13px] text-ink-soft">♥ {b.likes}</span>
            <span className="text-[13px] text-ink-soft">+{b.points}</span>
            <span className="w-8 text-right font-display text-lg">{total}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
