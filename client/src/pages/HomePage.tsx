import { motion } from 'framer-motion';
import { useMemo, useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import { useGame } from '../hooks/useGame';
import { loadLastName } from '../services/session';

/** กระดานตัวอย่างบนหน้าแรก: โชว์ว่า JinxO หน้าตาเป็นยังไงโดยไม่ต้องอ่านกติกา */
const DEMO = [
  { t: 'แอปเปิ้ล', k: 'match' },
  { t: 'มะเขือเทศ', k: 'jinxo' },
  { t: 'ทับทิม', k: 'none' },
  { t: 'แมว', k: 'match' },
  { t: 'กระต่าย', k: 'jinxo' },
  { t: 'หมา', k: 'match' },
  { t: 'มาม่า', k: 'jinxo' },
  { t: 'ข้าวต้ม', k: 'none' },
  { t: 'ไข่เจียว', k: 'match' },
] as const;

function DemoBoard() {
  return (
    <div className="relative mx-auto w-full max-w-[300px] rotate-2" aria-hidden>
      <div className="grid grid-cols-3 gap-2 rounded-[22px] border-[2.5px] border-ink bg-mat-deep p-2.5 shadow-chunk-lg">
        {DEMO.map((c, i) => (
          <motion.div
            key={c.t}
            className={`flex aspect-square items-center justify-center rounded-2xl border-[2.5px] border-ink p-1 text-center font-display text-[15px] leading-tight ${
              c.k === 'jinxo' ? 'bg-jinx text-white' : c.k === 'match' ? 'bg-butter' : 'bg-paper text-ink-soft'
            }`}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            transition={{ delay: 0.25 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
          >
            {c.t}
          </motion.div>
        ))}
      </div>
      <span className="absolute -top-4 -right-3 -rotate-6 rounded-xl border-[2.5px] border-ink bg-jinx px-2.5 py-1 font-display text-lg text-white shadow-chunk-sm">
        JinxO!
      </span>
    </div>
  );
}

export function HomePage() {
  const { actions, connection } = useGame();
  const inviteCode = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '', []);
  const [name, setName] = useState(loadLastName);
  const [code, setCode] = useState(inviteCode);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [nameError, setNameError] = useState(false);

  const ready = connection === 'online';

  const withName = async (kind: 'create' | 'join', fn: () => Promise<boolean>) => {
    if (!name.trim()) {
      setNameError(true);
      document.getElementById('player-name')?.focus();
      return;
    }
    setBusy(kind);
    await fn();
    setBusy(null);
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    void withName('join', () => actions.joinRoom(code, name));
  };

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:gap-14">
      <section className="flex flex-col gap-6">
        <Logo />
        <p className="max-w-md font-display text-2xl leading-snug text-ink sm:text-[28px]">
          ตอบให้ตรงใจเพื่อนสักคน แต่อย่าตรงกันทั้งห้อง
        </p>
        <ol className="flex max-w-md flex-col gap-2.5 text-[16px] text-ink-soft">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper font-display text-sm text-ink">1</span>
            ทุกคนได้หัวข้อเดียวกัน พิมพ์ 3 คำแล้ววางลงช่องไหนก็ได้บนกระดาน 3×3
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper font-display text-sm text-ink">2</span>
            ครบ 3 หัวข้อ กระดานเต็ม แล้วเปิดคำตอบพร้อมกันทั้งห้อง
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-jinx font-display text-sm text-white">3</span>
            ตรงกันพอดี 2 คนคือ JinxO ได้แต้มเยอะที่สุด
          </li>
        </ol>
        <div className="hidden md:block">
          <DemoBoard />
        </div>
      </section>

      <section className="slab flex flex-col gap-5 p-5 sm:p-7">
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">ชื่อที่เพื่อนจะเห็น</span>
          <input
            id="player-name"
            className={`field ${nameError ? '!border-danger' : ''}`}
            value={name}
            maxLength={16}
            autoComplete="nickname"
            placeholder="เช่น ต้นข้าว"
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
          />
          {nameError && <span className="text-[15px] text-danger">ใส่ชื่อก่อนนะ</span>}
        </label>

        {!inviteCode && (
          <>
            <Button
              tone="pink"
              size="lg"
              disabled={!ready || busy !== null}
              onClick={() => void withName('create', () => actions.createRoom(name))}
            >
              {busy === 'create' ? 'กำลังสร้างห้อง…' : 'สร้างห้องใหม่'}
            </Button>
            <div className="flex items-center gap-3 text-ink-soft">
              <span className="h-[2px] flex-1 bg-ink/15" />
              หรือเข้าห้องของเพื่อน
              <span className="h-[2px] flex-1 bg-ink/15" />
            </div>
          </>
        )}

        <form onSubmit={onJoin} className="flex flex-col gap-3">
          {inviteCode && <p className="font-display text-lg">เพื่อนชวนคุณเข้าห้อง</p>}
          <div className="flex gap-2">
            <input
              aria-label="รหัสห้อง"
              className="field min-w-0 flex-1 text-center font-display !text-2xl tracking-[0.3em] uppercase"
              value={code}
              maxLength={6}
              placeholder="รหัสห้อง"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
            />
            <Button
              tone={inviteCode ? 'pink' : 'butter'}
              type="submit"
              disabled={!ready || busy !== null || code.length < 6}
              className={inviteCode ? '!px-6' : ''}
            >
              {busy === 'join' ? 'กำลังเข้า…' : 'เข้าห้อง'}
            </Button>
          </div>
        </form>

        {inviteCode && (
          <button
            type="button"
            className="self-start text-[15px] text-ink-soft underline underline-offset-4"
            onClick={() => {
              history.replaceState(null, '', '/');
              location.reload();
            }}
          >
            สร้างห้องของตัวเองแทน
          </button>
        )}

        {!ready && <p className="text-[15px] text-ink-soft">กำลังเชื่อมต่อเซิร์ฟเวอร์…</p>}
      </section>

      <div className="md:hidden">
        <DemoBoard />
      </div>
    </main>
  );
}
