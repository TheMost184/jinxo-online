import { useState } from 'react';
import { CUSTOM_CATEGORY_ID, type PlayerView } from '@jinxo/shared';
import { PlayerList } from '../components/PlayerList';
import { RulesSummary } from '../components/RulesSummary';
import { Button, Modal } from '../components/ui';
import { useGame, useRoom } from '../hooks/useGame';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http ที่ไม่ใช่ localhost ใช้ clipboard API ไม่ได้ → fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function LobbyPage() {
  const room = useRoom();
  const { actions, toast } = useGame();
  const [starting, setStarting] = useState(false);
  const [kickTarget, setKickTarget] = useState<PlayerView | null>(null);
  const isHost = room.you.isHost;
  const { minPlayers, maxPlayers, rounds, topicsPerRound } = room.config.game;
  const online = room.players.filter((p) => p.connected).length;
  const need = rounds * topicsPerRound;
  const selected = new Set(room.selectedCategories);
  const questionCount = room.categories.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.count, 0);
  const custom = room.customMode;
  const bankCategories = room.categories.filter((c) => !c.custom);
  const customCategory = room.categories.find((c) => c.custom);
  const inviteLink = `${location.origin}/?room=${room.code}`;

  const blocker =
    online < minPlayers
      ? `รอเพื่อนอีก ${minPlayers - online} คน (ต้องมีอย่างน้อย ${minPlayers} คน)`
      : !custom && questionCount < need
        ? `หมวดที่เลือกมีคำถาม ${questionCount} ข้อ ต้องมีอย่างน้อย ${need} ข้อ`
        : null;

  const toggleCustom = () => {
    if (!isHost) return;
    // เปิด = ใช้หมวดนี้หมวดเดียว / ปิด = กลับไปใช้ทุกหมวดปกติ
    void actions.setCategories(custom ? bankCategories.map((c) => c.id) : [CUSTOM_CATEGORY_ID]);
  };

  const toggleCategory = (id: string) => {
    if (!isHost || custom) return;
    const next = selected.has(id) ? room.selectedCategories.filter((c) => c !== id) : [...room.selectedCategories, id];
    if (next.length === 0) {
      toast('warn', 'ต้องเลือกอย่างน้อย 1 หมวด');
      return;
    }
    void actions.setCategories(next);
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-16 md:grid-cols-[1fr_1.15fr]">
      <section className="flex flex-col gap-5">
        <div className="slab overflow-hidden">
          <div className="bg-butter px-5 pt-5 pb-4">
            <p className="text-[15px] text-ink-soft">รหัสห้อง ส่งให้เพื่อนใน Discord ได้เลย</p>
            <p className="font-display text-6xl font-semibold tracking-[0.18em] sm:text-7xl">{room.code}</p>
          </div>
          <div className="flex flex-wrap gap-2 border-t-[2.5px] border-ink p-4">
            <Button
              tone="paper"
              size="sm"
              onClick={async () => toast('success', (await copyText(room.code)) ? 'คัดลอกรหัสห้องแล้ว' : 'คัดลอกไม่สำเร็จ')}
            >
              คัดลอกรหัส
            </Button>
            <Button
              tone="pink"
              size="sm"
              onClick={async () => toast('success', (await copyText(inviteLink)) ? 'คัดลอกลิงก์เชิญแล้ว' : 'คัดลอกไม่สำเร็จ')}
            >
              คัดลอกลิงก์เชิญ
            </Button>
          </div>
        </div>

        <div className="slab p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-medium">ผู้เล่น</h2>
            <span className="font-display text-ink-soft">
              {room.players.length}/{maxPlayers}
            </span>
          </div>
          <PlayerList
            players={room.players}
            youId={room.you.id}
            emptySeats={room.players.length > 7 ? 0 : Math.max(0, Math.min(maxPlayers - room.players.length, 3))}
            onKick={isHost ? setKickTarget : undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="slab p-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-medium">หมวดคำถาม</h2>
            <span className="text-[15px] text-ink-soft">{custom ? 'เพื่อนตั้งโจทย์เอง' : `${questionCount} ข้อ`}</span>
          </div>
          <p className="mb-4 text-[15px] text-ink-soft">
            {custom
              ? 'โหมดคิดโจทย์เอง: ปิดสวิตช์ด้านล่างก่อนถึงจะเลือกหมวดปกติได้'
              : isHost
                ? 'แตะเพื่อเปิด/ปิดหมวด เกมจะสุ่มหัวข้อจากหมวดที่เลือก'
                : 'Host เป็นคนเลือกหมวด'}
          </p>
          <div className="flex flex-wrap gap-2" aria-disabled={custom}>
            {bankCategories.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!isHost || custom}
                  aria-pressed={on}
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-2xl border-[2.5px] border-ink px-3.5 py-2 text-[16px] font-medium transition-[background,transform,opacity] ${
                    on ? 'bg-sky shadow-chunk-sm' : 'bg-paper text-ink-soft line-through decoration-2'
                  } ${custom ? 'opacity-35' : ''} ${isHost && !custom ? 'active:translate-y-0.5' : 'cursor-default'}`}
                >
                  <span className="mr-1.5 no-underline">{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>
          {customCategory && (
            <div className="mt-4 border-t-2 border-dashed border-ink/20 pt-4">
              <button
                type="button"
                disabled={!isHost}
                aria-pressed={custom}
                onClick={toggleCustom}
                className={`flex w-full items-center gap-3 rounded-2xl border-[2.5px] border-ink px-4 py-3 text-left transition-transform ${
                  custom ? 'bg-butter shadow-chunk-sm' : 'bg-paper'
                } ${isHost ? 'active:translate-y-0.5' : 'cursor-default'}`}
              >
                <span className="text-2xl">{customCategory.emoji}</span>
                <span className="flex-1">
                  <span className="block font-display text-lg">{customCategory.label}</span>
                  <span className="block text-[14px] text-ink-soft">
                    สุ่มเพื่อนมาตั้งโจทย์ทีละคน ใช้ร่วมกับหมวดอื่นไม่ได้
                  </span>
                </span>
                <span
                  className={`flex h-7 w-12 items-center rounded-full border-2 border-ink p-0.5 transition-colors ${
                    custom ? 'justify-end bg-mint' : 'justify-start bg-mat-deep'
                  }`}
                  aria-hidden
                >
                  <span className="h-5 w-5 rounded-full border-2 border-ink bg-paper" />
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="slab p-5">
          <h2 className="mb-3 text-xl font-medium">นับแต้มยังไง</h2>
          <RulesSummary scoring={room.config.scoring} />
          <p className="mt-3 text-[15px] text-ink-soft">
            เล่น {rounds} รอบ รอบละ {topicsPerRound} หัวข้อ เปิดคำตอบทีละคน ใครมีคำที่ความหมายเดียวกันแต่สะกดต่าง กดเสนอให้ Host ตัดสินได้
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          {isHost ? (
            <Button
              tone="mint"
              size="lg"
              disabled={Boolean(blocker) || starting}
              onClick={async () => {
                setStarting(true);
                await actions.startGame();
                setStarting(false);
              }}
            >
              {starting ? 'กำลังเริ่ม…' : 'เริ่มเกม'}
            </Button>
          ) : (
            <p className="rounded-2xl border-[2.5px] border-dashed border-ink/40 px-4 py-4 text-center font-display text-lg">
              รอ Host กดเริ่มเกม
            </p>
          )}
          {blocker && <p className="text-center text-[15px] text-ink-soft">{blocker}</p>}
        </div>
      </section>

      <Modal open={kickTarget !== null} title={`เตะ ${kickTarget?.name ?? ''} ออก?`} onClose={() => setKickTarget(null)}>
        <p className="mb-5 text-ink-soft">
          {kickTarget?.name} จะถูกนำออกจากห้องทันที ถ้าจะกลับมาต้องเข้าห้องใหม่ด้วยรหัสห้อง
        </p>
        <div className="flex justify-end gap-3">
          <Button tone="paper" onClick={() => setKickTarget(null)}>
            ยกเลิก
          </Button>
          <Button
            tone="pink"
            onClick={() => {
              const target = kickTarget;
              setKickTarget(null);
              if (target) void actions.kickPlayer(target.id);
            }}
          >
            เตะออก
          </Button>
        </div>
      </Modal>
    </main>
  );
}
