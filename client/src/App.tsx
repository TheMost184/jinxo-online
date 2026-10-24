import { AnimatePresence, motion } from 'framer-motion';
import type { Phase } from '@jinxo/shared';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { Button, Spinner } from './components/ui';
import { useGame } from './hooks/useGame';
import { FinalResultPage } from './pages/FinalResultPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LobbyPage } from './pages/LobbyPage';
import { RevealPage } from './pages/RevealPage';

/** หน้าที่แสดงขึ้นกับ phase ที่ server กำหนด — ทุกคนในห้องจึงอยู่หน้าเดียวกันเสมอ */
const PAGES: Record<Phase, () => React.JSX.Element | null> = {
  lobby: LobbyPage,
  answering: GamePage,
  reveal: RevealPage,
  review: RevealPage,
  roundResult: LeaderboardPage,
  finalResult: FinalResultPage,
};

export function App() {
  const { room, restoring, connection } = useGame();

  let content: React.ReactNode;
  let key: string;
  if (connection === 'replaced') {
    key = 'replaced';
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-3xl font-medium">เปิดเกมนี้อยู่ในหน้าต่างอื่น</h1>
        <p className="text-ink-soft">ผู้เล่นคนเดียวกันเล่นได้ทีละหน้าต่าง</p>
        <Button tone="pink" onClick={() => location.reload()}>
          เล่นต่อในหน้าต่างนี้
        </Button>
      </div>
    );
  } else if (room) {
    const Page = PAGES[room.phase];
    // reveal กับ review เป็นหน้าเดียวกัน ไม่ต้องเล่น transition
    key = room.phase === 'review' ? 'reveal' : `${room.phase}-${room.roundIndex}`;
    content = (
      <>
        <TopBar />
        <Page />
      </>
    );
  } else if (restoring) {
    key = 'restoring';
    content = <Spinner label="กำลังกลับเข้าห้อง…" />;
  } else {
    key = 'home';
    content = <HomePage />;
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
      <Toasts />
    </>
  );
}
