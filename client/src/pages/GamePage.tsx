import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { normalizeAnswer, type Placement } from '@jinxo/shared';
import { BoardFrame } from '../components/BoardFrame';
import { PlayerList } from '../components/PlayerList';
import { Button, Modal } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';
import { topicStyle } from '../lib/palette';

export function GamePage() {
  const room = useRoom();
  if (room.phase !== 'answering' || room.currentTopicIndex === null) return null;
  // เปลี่ยนหัวข้อ = ล้างร่างคำตอบ
  return <AnswerRound key={`${room.roundIndex}-${room.currentTopicIndex}`} />;
}

function AnswerRound() {
  const room = useRoom();
  const { actions, toast } = useGame();
  const { answersPerTopic: need, maxAnswerLength, topicsPerRound } = room.config.game;
  const topicIndex = room.currentTopicIndex ?? 0;
  const topic = room.topics[topicIndex];
  const category = room.categories.find((c) => c.id === topic?.category);
  const style = topicStyle(topicIndex);

  const [drafts, setDrafts] = useState<Map<number, string>>(new Map());
  const [editing, setEditing] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const locked = room.myReady;

  /** ช่องไหนซ้ำกับคำอื่นบนกระดาน */
  const duplicates = useMemo(() => {
    const seen = new Map<string, number[]>();
    room.myBoard.forEach((c, i) => {
      if (c) seen.set(normalizeAnswer(c.text), [...(seen.get(normalizeAnswer(c.text)) ?? []), i]);
    });
    for (const [i, text] of drafts) {
      const k = normalizeAnswer(text);
      if (k) seen.set(k, [...(seen.get(k) ?? []), i]);
    }
    const dup = new Set<number>();
    for (const cells of seen.values()) if (cells.length > 1) for (const i of cells) if (drafts.has(i)) dup.add(i);
    return dup;
  }, [drafts, room.myBoard]);

  const filled = [...drafts.values()].filter((t) => normalizeAnswer(t).length > 0).length;
  const canConfirm = !locked && filled === need && drafts.size === need && duplicates.size === 0 && !sending;

  const commit = (i: number, text: string) => {
    setDrafts((d) => {
      const n = new Map(d);
      if (text.trim()) n.set(i, text);
      else n.delete(i);
      return n;
    });
    setEditing((e) => (e === i ? null : e));
  };

  const openCell = (i: number) => {
    if (locked || room.myBoard[i]) return;
    if (!drafts.has(i) && drafts.size >= need) {
      toast('info', `หัวข้อนี้วางได้ ${need} ช่อง ลบช่องเดิมก่อนถ้าอยากย้าย`);
      return;
    }
    setEditing(i);
  };

  const confirm = async () => {
    const placements: Placement[] = [...drafts].map(([cellIndex, text]) => ({ cellIndex, text }));
    setSending(true);
    await actions.submitAnswers(placements);
    setSending(false);
  };

  const pendingPlayers = room.players.filter((p) => !p.ready && !p.skipped && !p.left);

  const renderCell = (i: number) => {
    const cell = room.myBoard[i];
    if (cell) {
      const ts = topicStyle(cell.topicIndex);
      return (
        <div className={`relative flex h-full items-center justify-center rounded-2xl border-[2.5px] border-ink p-1.5 text-center shadow-chunk-sm ${ts.solid}`}>
          <span className={`absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${ts.dot}`} />
          <span className="line-clamp-3 font-display text-[15px] leading-tight break-words sm:text-lg">{cell.text}</span>
        </div>
      );
    }
    if (editing === i) {
      return (
        <CellInput
          initial={drafts.get(i) ?? ''}
          maxLength={maxAnswerLength}
          ringClass={style.ring}
          onDone={(t) => commit(i, t)}
        />
      );
    }
    const draft = drafts.get(i);
    if (draft !== undefined) {
      const dup = duplicates.has(i);
      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={() => openCell(i)}
            disabled={locked}
            className={`flex h-full w-full items-center justify-center rounded-2xl border-[2.5px] p-1.5 text-center shadow-chunk-sm ${
              dup ? 'border-danger bg-jinx-soft' : `border-ink ${style.solid}`
            }`}
          >
            <span className="line-clamp-3 font-display text-[15px] leading-tight break-words sm:text-lg">{draft}</span>
          </button>
          {!locked && (
            <button
              type="button"
              aria-label={`ลบ ${draft}`}
              onClick={() => commit(i, '')}
              className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-paper text-sm font-semibold shadow-chunk-sm"
            >
              ✕
            </button>
          )}
        </div>
      );
    }
    const available = !locked && drafts.size < need;
    return (
      <button
        type="button"
        onClick={() => openCell(i)}
        disabled={locked}
        aria-label={`ช่องว่าง แถว ${Math.floor(i / 3) + 1} คอลัมน์ ${(i % 3) + 1}`}
        className={`flex h-full w-full items-center justify-center rounded-2xl border-[2.5px] border-dashed text-3xl transition-colors ${
          available ? 'border-ink/45 bg-paper/60 text-ink/35 hover:bg-paper' : 'border-ink/15 bg-paper/25 text-transparent'
        }`}
      >
        +
      </button>
    );
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-36 lg:grid-cols-[1fr_320px] lg:pb-16">
      <section className="flex flex-col items-center gap-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={topic?.id}
            className="slab relative w-full max-w-xl overflow-hidden"
            initial={{ rotateX: -80, opacity: 0, y: -10 }}
            animate={{ rotateX: 0, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <div className={`h-3 border-b-[2.5px] border-ink ${style.dot}`} />
            <div className="px-5 pt-4 pb-5 sm:px-7">
              <div className="mb-1 flex items-center justify-between text-[15px] text-ink-soft">
                <span>
                  หัวข้อ {topicIndex + 1} จาก {topicsPerRound}
                </span>
                {topic?.authorId ? (
                  <span>✍️ โจทย์จาก {room.players.find((p) => p.id === topic.authorId)?.name ?? 'เพื่อน'}</span>
                ) : (
                  category && (
                    <span>
                      {category.emoji} {category.label}
                    </span>
                  )
                )}
              </div>
              <h1 className="text-3xl leading-tight font-medium sm:text-4xl">{topic?.question}</h1>
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-[16px] text-ink-soft">
          {locked
            ? 'ส่งแล้ว รอเพื่อนตอบให้ครบ'
            : `แตะช่องว่าง พิมพ์คำตอบ ${need} คำ คำที่เพื่อนน่าจะตอบเหมือนคุณได้แต้ม`}
        </p>

        <div className="w-full max-w-[460px]">
          <BoardFrame scoring={room.config.scoring} renderCell={renderCell} />
        </div>

        {room.topics.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 text-[14px]">
            {room.topics.slice(0, topicIndex).map((t, i) => (
              <span key={t.id} className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5">
                <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${topicStyle(i).dot}`} />
                {t.question}
              </span>
            ))}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-3">
        <div className="slab p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-medium">ใครตอบแล้วบ้าง</h2>
            <span className="font-display text-lg">
              {room.readyCount}/{room.requiredCount}
            </span>
          </div>
          <PlayerList players={room.players} youId={room.you.id} showReady />
          {room.you.isHost && pendingPlayers.length > 0 && room.readyCount > 0 && (
            <Button tone="paper" size="sm" className="mt-3 w-full" onClick={() => setConfirmSkip(true)}>
              ไม่รอคนที่ยังไม่ตอบ
            </Button>
          )}
        </div>
      </aside>

      {/* แถบยืนยันติดขอบล่าง — นิ้วโป้งกดถึงบนมือถือ */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[2.5px] border-ink bg-paper/95 px-4 py-3 backdrop-blur lg:static lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-xl lg:rounded-[22px] lg:border-[2.5px] lg:shadow-chunk">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex-1 text-[15px]">
            {locked ? (
              <span className="font-display text-lg">
                พร้อมแล้ว {room.readyCount}/{room.requiredCount} คน
              </span>
            ) : duplicates.size > 0 ? (
              <span className="font-medium text-danger">มีคำซ้ำกันบนกระดาน แก้ก่อนนะ</span>
            ) : (
              <span>
                วางแล้ว <span className="font-display text-lg">{filled}</span>/{need}
              </span>
            )}
          </div>
          <Button tone="mint" disabled={!canConfirm} onClick={() => void confirm()}>
            {locked ? 'ส่งแล้ว' : sending ? 'กำลังส่ง…' : 'ยืนยันคำตอบ'}
          </Button>
        </div>
      </div>

      <Modal open={confirmSkip} title="ไม่รอแล้ว?" onClose={() => setConfirmSkip(false)}>
        <p className="mb-5 text-ink-soft">
          {pendingPlayers.map((p) => p.name).join(', ')} จะไม่ได้ใส่คำตอบในหัวข้อนี้ (ช่องจะว่าง) แล้วเกมไปหัวข้อถัดไปทันที
        </p>
        <div className="flex justify-end gap-3">
          <Button tone="paper" onClick={() => setConfirmSkip(false)}>
            รอต่อ
          </Button>
          <Button
            tone="pink"
            onClick={() => {
              setConfirmSkip(false);
              void actions.skipWaiting();
            }}
          >
            ไปต่อเลย
          </Button>
        </div>
      </Modal>
    </main>
  );
}

function CellInput({
  initial,
  maxLength,
  ringClass,
  onDone,
}: {
  initial: string;
  maxLength: number;
  ringClass: string;
  onDone: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      autoFocus
      rows={3}
      value={value}
      maxLength={maxLength}
      enterKeyHint="done"
      placeholder="พิมพ์…"
      aria-label="คำตอบ"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onDone(value);
        }
        if (e.key === 'Escape') onDone(initial);
      }}
      className={`h-full w-full resize-none rounded-2xl border-[2.5px] border-ink bg-paper p-2 text-center font-display text-[15px] leading-tight ring-4 outline-none sm:text-lg ${ringClass}`}
    />
  );
}
