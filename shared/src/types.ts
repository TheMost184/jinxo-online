/**
 * Data models ที่ใช้ร่วมกันระหว่าง client และ server
 * ทุกอย่างในไฟล์นี้คือ "สิ่งที่ client มองเห็นได้" — server จะสร้าง RoomView แยกให้แต่ละคน
 * โดยไม่ใส่ข้อมูลลับ (คำตอบของคนอื่นก่อนเปิดเผย, token ของคนอื่น) ลงไป
 */

export type Phase =
  | 'lobby'
  | 'answering'
  | 'reveal'
  | 'review'
  | 'roundResult'
  | 'finalResult';

/** id ของแนวโบนัส: r = แถว, c = คอลัมน์, d = แนวทแยง (d0 = ซ้ายบน→ขวาล่าง) */
export type LineId = 'r0' | 'r1' | 'r2' | 'c0' | 'c1' | 'c2' | 'd0' | 'd1';

export type MatchKind = 'none' | 'jinxo' | 'match';

export interface CategoryInfo {
  id: string;
  label: string;
  emoji: string;
  count: number;
}

export interface Topic {
  id: number;
  category: string;
  question: string;
}

/** ช่องบนกระดานของผู้เล่น (null = ยังว่าง) */
export interface BoardCell {
  text: string;
  topicIndex: number;
}

export type Board = (BoardCell | null)[];

export interface ScoringTier {
  /** จำนวนผู้เล่น (ไม่ซ้ำคน) ที่ตอบคำนี้ ขั้นต่ำ */
  minPlayers: number;
  /** ขั้นสูง (ไม่ใส่ = ไม่จำกัด) */
  maxPlayers?: number;
  /** คะแนนต่อช่อง */
  points: number;
  kind: MatchKind;
}

export interface LineBonusConfig {
  enabled: boolean;
  /**
   * matched = ทุกช่องในแนวตรงกับคนอื่นอย่างน้อย 1 คน
   * jinxo   = ทุกช่องในแนวต้องเป็น JinxO (ตรงกันพอดี 2 คน)
   */
  condition: 'matched' | 'jinxo';
  rows: [number, number, number];
  columns: [number, number, number];
  /** ใส่ [0, 0] หรือไม่ใส่เพื่อปิดโบนัสแนวทแยง */
  diagonals?: [number, number];
}

export interface PublicScoringConfig {
  tiers: ScoringTier[];
  lineBonus: LineBonusConfig;
}

export interface PublicGameConfig {
  minPlayers: number;
  maxPlayers: number;
  rounds: number;
  topicsPerRound: number;
  answersPerTopic: number;
  maxAnswerLength: number;
  maxNameLength: number;
}

export interface PlayerView {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
  connected: boolean;
  /** ออกจากห้องระหว่างเกม (ยังโชว์คะแนนไว้) */
  left: boolean;
  /** ยืนยันคำตอบของหัวข้อปัจจุบันแล้ว */
  ready: boolean;
  /** ไม่ต้องรอคนนี้ในหัวข้อปัจจุบัน (หลุดนานเกินกำหนด/Host กดข้าม) */
  skipped: boolean;
  totalScore: number;
}

export interface AnswerGroupView {
  id: string;
  topicIndex: number;
  /** ข้อความที่ใช้แสดง (คำตอบแรกในกลุ่ม) */
  label: string;
  /** คำที่สะกดต่างกันซึ่ง Host รวมเข้ามา */
  variants: string[];
  /** กลุ่มนี้รวมมาจาก base key กี่ตัว (>1 = ถูก merge) */
  baseKeyCount: number;
  playerIds: string[];
  playerCount: number;
  kind: MatchKind;
  pointsPerCell: number;
}

export type RevealCell =
  | { state: 'empty' }
  | { state: 'hidden'; topicIndex: number }
  | {
      state: 'shown';
      topicIndex: number;
      text: string;
      groupId: string;
      kind: MatchKind;
      playerCount: number;
      points: number;
    };

export interface RevealBoardView {
  playerId: string;
  cells: RevealCell[];
  /** แนวที่ได้โบนัสแล้ว (คำนวณเฉพาะเมื่อทุกช่องถูกเปิด) */
  bonusLines: LineId[];
  /** คะแนนเบื้องต้นจากช่องที่เปิดแล้ว */
  previewPoints: number;
}

export interface RevealStepView {
  index: number;
  topicIndex: number;
  kind: 'group' | 'unmatched';
  groupIds: string[];
}

export interface RevealView {
  revealedSteps: number;
  totalSteps: number;
  lastStep: RevealStepView | null;
  boards: RevealBoardView[];
  /** เฉพาะกลุ่มที่เปิดแล้ว */
  groups: AnswerGroupView[];
}

export interface PlayerRoundScore {
  playerId: string;
  name: string;
  color: number;
  basePoints: number;
  bonusPoints: number;
  roundTotal: number;
  total: number;
  rank: number;
  jinxoCount: number;
  matchCount: number;
  bonusLines: LineId[];
}

export interface RoundResultView {
  roundIndex: number;
  /** เรียงตามอันดับแล้ว */
  scores: PlayerRoundScore[];
}

export interface FinalStanding {
  playerId: string;
  name: string;
  color: number;
  total: number;
  rank: number;
  roundTotals: number[];
  jinxoCount: number;
}

export interface FinalResultView {
  winnerIds: string[];
  standings: FinalStanding[];
}

export interface RoomView {
  code: string;
  phase: Phase;
  you: { id: string; name: string; isHost: boolean };
  hostId: string;
  players: PlayerView[];
  config: { game: PublicGameConfig; scoring: PublicScoringConfig };
  categories: CategoryInfo[];
  selectedCategories: string[];
  /** รอบปัจจุบัน (0-based) */
  roundIndex: number;
  /** หัวข้อของรอบนี้ที่เปิดแล้ว */
  topics: Topic[];
  currentTopicIndex: number | null;
  myBoard: Board;
  myReady: boolean;
  readyCount: number;
  requiredCount: number;
  reveal: RevealView | null;
  roundResult: RoundResultView | null;
  final: FinalResultView | null;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface Placement {
  cellIndex: number;
  text: string;
}
