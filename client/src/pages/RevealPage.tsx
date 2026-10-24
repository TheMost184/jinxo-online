import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerGroupView, PlayerView, RevealCell, RoomView } from '@jinxo/shared';
import { BoardFrame } from '../components/BoardFrame';
import { JinxOBurst } from '../components/Celebrate';
import { Avatar, Button } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';
import { topicStyle } from '../lib/palette';

const KIND_LABEL = { jinxo: 'JinxO!', match: 'ตรงกัน', none: 'ไม่ซ้ำใคร' } as const;

export function RevealPage() {
  const room = useRoom();
  // ระหว่าง transition ออกจากหน้า state อาจเปลี่ยน phase ไปแล้ว
  if (!room.reveal) return null;
  return <RevealContent room={room} />;
}

function RevealContent({ room }: { room: RoomView }) {
  const { actions } = useGame();
  const reveal = room.reveal!;
  const isHost = room.you.isHost;
  const reviewing = room.phase === 'review';
  const playersById = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const groupsById = useMemo(() => new Map(reveal.groups.map((g) => [g.id, g])), [reveal.groups]);

  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // กลุ่มที่เพิ่งเปิดในขั้นล่าสุด (ไว้ทำให้ช่องเด้ง)
  const freshIds = useMemo(
    () => (reviewing || !reveal.lastStep ? new Set<string>() : new Set(reveal.lastStep.groupIds)),
    [reviewing, reveal.lastStep],
  );
  const highlight = useMemo(() => new Set(selected), [selected]);

  // JinxO burst เฉพาะตอนเปิดทีละขั้น
  const [burst, setBurst] = useState<{ key: string; group: AnswerGroupView } | null>(null);
  const lastIndex = useRef<number | null>(reveal.lastStep?.index ?? null);
  useEffect(() => {
    const step = reveal.lastStep;
    if (!step || step.index === lastIndex.current) return;
    lastIndex.current = step.index;
    if (step.kind !== 'group') return;
    const g = groupsById.get(step.groupIds[0]);
    if (g?.kind !== 'jinxo') return;
    setBurst({ key: `${room.roundIndex}-${step.index}`, group: g });
    const t = setTimeout(() => setBurst(null), 2300);
    return () => clearTimeout(t);
  }, [reveal.lastStep, groupsById, room.roundIndex]);

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const toggleSelect = (g: AnswerGroupView) => {
    if (!isHost || !reviewing) return;
    setSelected((cur) => {
      const sameTopic = cur.every((id) => groupsById.get(id)?.topicIndex === g.topicIndex);
      if (!sameTopic) return [g.id];
      return cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id];
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16">
      <JinxOBurst
        burstKey={burst?.key ?? null}
        word={burst?.group.label ?? ''}
        names={burst?.group.playerIds.map((id) => playersById.get(id)?.name ?? '?') ?? []}
      />

      <TopicStrip room={room} />

      {reviewing ? (
        <ReviewPanel
          room={room}
          isHost={isHost}
          selected={selected}
          busy={busy}
          playersById={playersById}
          onToggle={toggleSelect}
          onMerge={() => {
            const topicIndex = groupsById.get(selected[0])!.topicIndex;
            void act(async () => {
              const ok = await actions.mergeGroups(topicIndex, selected);
              if (ok) setSelected([]);
              return ok;
            });
          }}
          onSplit={(id) => void act(() => actions.splitGroup(id))}
          onClear={() => setSelected([])}
          onFinalize={() => void act(actions.finalizeRound)}
        />
      ) : (
        <Spotlight room={room} playersById={playersById} groupsById={groupsById}>
          {isHost ? (
            <div className="flex flex-wrap gap-2">
              <Button tone="pink" size="lg" disabled={busy} onClick={() => void act(actions.revealNext)}>
                {reveal.revealedSteps === 0 ? 'เริ่มเปิดคำตอบ' : 'เปิดคำตอบถัดไป'}
              </Button>
              <Button tone="paper" disabled={busy} onClick={() => void act(actions.revealAll)}>
                เปิดที่เหลือทั้งหมด
              </Button>
            </div>
          ) : (
            <p className="font-display text-lg text-ink-soft">Host เป็นคนกดเปิดคำตอบ</p>
          )}
        </Spotlight>
      )}

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        {[...reveal.boards]
          // กระดานของตัวเองขึ้นก่อน
          .sort((a, b) => Number(b.playerId === room.you.id) - Number(a.playerId === room.you.id))
          .map((b) => {
          const p = playersById.get(b.playerId);
          return (
            <div key={b.playerId} className={`slab p-2 sm:p-3.5 ${b.playerId === room.you.id ? 'ring-4 ring-sky' : ''}`}>
              <div className="mb-2 flex items-center gap-2">
                {p && <Avatar name={p.name} color={p.color} size={28} dim={!p.connected} />}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p?.name}
                  {b.playerId === room.you.id && <span className="ml-1 text-sm text-ink-soft">(คุณ)</span>}
                </span>
                <motion.span
                  key={b.previewPoints}
                  initial={{ scale: 1.5 }}
                  animate={{ scale: 1 }}
                  className="rounded-xl border-2 border-ink bg-butter px-2 font-display text-lg"
                >
                  {b.previewPoints}
                </motion.span>
              </div>
              <BoardFrame
                size="sm"
                scoring={room.config.scoring}
                achieved={b.bonusLines}
                renderCell={(i) => (
                  <RevealCellView
                    cell={b.cells[i]}
                    fresh={b.cells[i].state === 'shown' && freshIds.has((b.cells[i] as { groupId: string }).groupId)}
                    highlighted={b.cells[i].state === 'shown' && highlight.has((b.cells[i] as { groupId: string }).groupId)}
                    names={
                      b.cells[i].state === 'shown'
                        ? (groupsById.get((b.cells[i] as { groupId: string }).groupId)?.playerIds ?? [])
                            .filter((id) => id !== b.playerId)
                            .map((id) => playersById.get(id)?.name ?? '')
                        : []
                    }
                  />
                )}
              />
            </div>
          );
        })}
      </section>
    </main>
  );
}

function TopicStrip({ room }: { room: RoomView }) {
  return (
    <div className="flex flex-wrap gap-2">
      {room.topics.map((t, i) => (
        <span key={t.id} className={`flex items-center gap-2 rounded-2xl border-[2.5px] border-ink px-3 py-1.5 font-display ${topicStyle(i).solid}`}>
          <span className={`h-3 w-3 rounded-full border-2 border-ink ${topicStyle(i).dot}`} />
          {t.question}
        </span>
      ))}
    </div>
  );
}

function RevealCellView({
  cell,
  fresh,
  highlighted,
  names,
}: {
  cell: RevealCell;
  fresh: boolean;
  highlighted: boolean;
  names: string[];
}) {
  if (cell.state === 'empty') {
    return <div className="h-full rounded-lg border-2 border-dashed border-ink/20" title="ไม่ได้ตอบ" />;
  }
  if (cell.state === 'hidden') {
    const ts = topicStyle(cell.topicIndex);
    return (
      <div className={`flex h-full items-center justify-center rounded-lg border-2 border-ink font-display text-lg text-ink/40 ${ts.solid}`}>
        ?
      </div>
    );
  }
  const ts = topicStyle(cell.topicIndex);
  const color =
    cell.kind === 'jinxo' ? 'bg-jinx text-white' : cell.kind === 'match' ? 'bg-butter text-ink' : 'bg-paper text-ink-soft';
  return (
    <motion.div
      key={`${cell.groupId}-${cell.kind}`}
      initial={fresh ? { rotateY: 90, scale: 1.1 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      title={names.length ? `ตรงกับ ${names.join(', ')}` : 'ไม่ตรงกับใคร'}
      className={`relative flex h-full flex-col items-center justify-center rounded-lg border-2 border-ink p-0.5 text-center ${color} ${
        highlighted ? 'ring-4 ring-sky' : ''
      } ${fresh ? 'shadow-chunk-sm' : ''}`}
    >
      <span className={`absolute top-1 left-1 h-1.5 w-1.5 rounded-full ${ts.dot}`} />
      <span className="line-clamp-2 font-display text-[11px] leading-tight break-words sm:text-[13px]">{cell.text}</span>
      {cell.points > 0 && <span className="text-[10px] leading-none opacity-80">+{cell.points}</span>}
    </motion.div>
  );
}

function Spotlight({
  room,
  playersById,
  groupsById,
  children,
}: {
  room: RoomView;
  playersById: Map<string, PlayerView>;
  groupsById: Map<string, AnswerGroupView>;
  children: React.ReactNode;
}) {
  const reveal = room.reveal!;
  const step = reveal.lastStep;
  const topic = step ? room.topics[step.topicIndex] : null;
  const groups = step ? step.groupIds.map((id) => groupsById.get(id)).filter((g): g is AnswerGroupView => Boolean(g)) : [];

  return (
    <section className="slab flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-soft">
          <span>
            เปิดแล้ว {reveal.revealedSteps}/{reveal.totalSteps} ขั้น
          </span>
          {topic && step && (
            <span className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${topicStyle(step.topicIndex).dot}`} />
              {topic.question}
            </span>
          )}
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={step?.index ?? 'start'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {!step && <h2 className="text-3xl font-medium">ทุกคนตอบครบแล้ว มาดูกันว่าใครคิดเหมือนใคร</h2>}
            {step?.kind === 'group' && groups[0] && (
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-4xl font-medium">“{groups[0].label}”</h2>
                <span
                  className={`rounded-xl border-[2.5px] border-ink px-2.5 py-0.5 font-display text-lg ${
                    groups[0].kind === 'jinxo' ? 'bg-jinx text-white' : 'bg-butter'
                  }`}
                >
                  {KIND_LABEL[groups[0].kind]} {groups[0].playerCount} คน ได้คนละ +{groups[0].pointsPerCell}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {groups[0].playerIds.map((id) => {
                    const p = playersById.get(id);
                    return p ? (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper py-0.5 pr-2.5 pl-0.5">
                        <Avatar name={p.name} color={p.color} size={24} />
                        {p.name}
                      </span>
                    ) : null;
                  })}
                </span>
              </div>
            )}
            {step?.kind === 'unmatched' && (
              <div>
                <h2 className="mb-2 text-2xl font-medium">คำที่ไม่ซ้ำใครในหัวข้อนี้</h2>
                <p className="text-[16px] text-ink-soft">{groups.map((g) => g.label).join(', ')}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="shrink-0">{children}</div>
    </section>
  );
}

function ReviewPanel({
  room,
  isHost,
  selected,
  busy,
  playersById,
  onToggle,
  onMerge,
  onSplit,
  onClear,
  onFinalize,
}: {
  room: RoomView;
  isHost: boolean;
  selected: string[];
  busy: boolean;
  playersById: Map<string, PlayerView>;
  onToggle: (g: AnswerGroupView) => void;
  onMerge: () => void;
  onSplit: (id: string) => void;
  onClear: () => void;
  onFinalize: () => void;
}) {
  const groups = room.reveal!.groups;
  return (
    <section className="slab flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-2xl font-medium">เปิดครบแล้ว ตรวจคำพ้องก่อนสรุปคะแนน</h2>
          <p className="text-[15px] text-ink-soft">
            {isHost
              ? 'คำที่สะกดต่างแต่หมายถึงสิ่งเดียวกัน (เช่น หมู กับ สุกร) แตะเลือก 2 คำขึ้นไปในหัวข้อเดียวกันแล้วกดรวม'
              : 'Host กำลังรวมคำที่หมายถึงสิ่งเดียวกัน เห็นคำไหนควรนับว่าตรงกัน บอก Host ใน Discord ได้เลย'}
          </p>
        </div>
        {isHost && (
          <Button tone="mint" size="lg" disabled={busy} onClick={onFinalize}>
            สรุปคะแนนรอบนี้
          </Button>
        )}
      </div>

      {room.topics.map((t, ti) => {
        const inTopic = groups.filter((g) => g.topicIndex === ti);
        if (inTopic.length === 0) return null;
        return (
          <div key={t.id}>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-medium">
              <span className={`h-3 w-3 rounded-full border-2 border-ink ${topicStyle(ti).dot}`} />
              {t.question}
            </h3>
            <div className="flex flex-wrap gap-2">
              {inTopic.map((g) => {
                const on = selected.includes(g.id);
                const names = g.playerIds.map((id) => playersById.get(id)?.name).join(', ');
                return (
                  <span key={g.id} className="relative inline-flex">
                    <button
                      type="button"
                      onClick={() => onToggle(g)}
                      disabled={!isHost}
                      aria-pressed={on}
                      title={names}
                      className={`flex items-center gap-2 rounded-2xl border-[2.5px] border-ink px-3 py-1.5 text-left text-[15px] transition-transform ${
                        g.kind === 'jinxo' ? 'bg-jinx text-white' : g.kind === 'match' ? 'bg-butter' : 'bg-paper'
                      } ${on ? '-translate-y-1 shadow-chunk ring-4 ring-sky' : ''} ${isHost ? '' : 'cursor-default'}`}
                    >
                      <span className="font-display">{g.variants.join(' = ')}</span>
                      <span className="rounded-lg bg-ink/10 px-1.5 text-sm">{g.playerCount} คน</span>
                    </button>
                    {isHost && g.baseKeyCount > 1 && (
                      <button
                        type="button"
                        onClick={() => onSplit(g.id)}
                        className="ml-1 rounded-xl border-2 border-ink bg-paper px-2 text-sm"
                        title="แยกคำที่รวมไว้กลับเป็นคำละกลุ่ม"
                      >
                        แยก
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {isHost && selected.length > 0 && (
          <motion.div
            className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-sky-soft px-4 py-3 shadow-chunk"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <span className="flex-1 text-[15px]">
              เลือก {selected.length} คำ{selected.length < 2 ? ' เลือกอีกอย่างน้อย 1 คำในหัวข้อเดียวกัน' : ''}
            </span>
            <Button tone="paper" size="sm" onClick={onClear}>
              ยกเลิก
            </Button>
            <Button tone="pink" size="sm" disabled={selected.length < 2 || busy} onClick={onMerge}>
              รวมเป็นคำเดียวกัน
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
