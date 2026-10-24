/**
 * Data models ที่ใช้ร่วมกันระหว่าง client และ server
 * ทุกอย่างในไฟล์นี้คือ "สิ่งที่ client มองเห็นได้" — server จะสร้าง RoomView แยกให้แต่ละคน
 * โดยไม่ใส่ข้อมูลลับ (คำตอบที่ยังไม่เปิด, token ของคนอื่น) ลงไป
 */

export type Phase =
  | 'lobby'
  /** โหมดคิดโจทย์เอง: รอผู้เล่นที่ถูกสุ่มพิมพ์โจทย์ */
  | 'authoring'
  | 'answering'
  /** เปิดคำตอบทีละคนตามลำดับที่สุ่มไว้ */
  | 'reveal'
  /** Round Summary */
  | 'roundResult'
  | 'finalResult';

/** id ของแนวโบนัส: r = แถว, c = คอลัมน์, d = แนวทแยง (d0 = ซ้ายบน→ขวาล่าง) */
export type LineId = 'r0' | 'r1' | 'r2' | 'c0' | 'c1' | 'c2' | 'd0' | 'd1';

export type MatchKind = 'none' | 'jinxo' | 'match';

/** หมวดพิเศษ "คิดโจทย์เอง" — ใช้ร่วมกับหมวดอื่นไม่ได้ */
export const CUSTOM_CATEGORY_ID = 'custom';

export interface CategoryInfo {
  id: string;
  label: string;
  emoji: string;
  count: number;
  custom?: boolean;
}

export interface Topic {
  id: number;
  category: string;
  question: string;
  /** โหมดคิดโจทย์เอง: ใครเป็นคนตั้งโจทย์ */
  authorId?: string;
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
  maxQuestionLength: number;
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
  /** Game Score สะสม (ไม่รวม Like) */
  totalScore: number;
  /** Popularity Score สะสม — จำนวน Like ที่ได้รับ ไม่มีผลกับอันดับ */
  totalLikes: number;
}

// ───────────────────────── Reveal ─────────────────────────

/** ช่องคำตอบที่ถูกเปิดแล้ว (ทุกคนเห็นเหมือนกัน) */
export interface AnswerView {
  /** "<playerId>:<cellIndex>" — Like และ Match Request ผูกกับ id นี้ ไม่ใช่ข้อความ */
  id: string;
  playerId: string;
  cellIndex: number;
  topicIndex: number;
  text: string;
  groupId: string;
  /** จำนวนผู้เล่น (ไม่ซ้ำคน) ในกลุ่มคำตอบ */
  groupSize: number;
  kind: MatchKind;
  points: number;
  /** คนนี้มีคำอื่นในกลุ่มเดียวกันที่นับแต้มไปแล้ว → ช่องนี้ 0 แต้ม */
  duplicate: boolean;
  /** turn = ถูกเปิดตอนถึงตาเจ้าของ, match = เปิดอัตโนมัติเพราะตรงกับคำที่เปิดไปก่อนแล้ว */
  revealedBy: 'turn' | 'match';
  likes: number;
}

export type RevealCell =
  | { state: 'empty' }
  | { state: 'hidden'; topicIndex: number }
  | { state: 'shown'; answer: AnswerView };

export interface RevealBoardView {
  playerId: string;
  cells: RevealCell[];
  /** แนวที่ได้โบนัสแล้ว (นับเฉพาะเมื่อทุกช่องในแนวเปิดแล้ว) */
  bonusLines: LineId[];
  /** คะแนนจากช่องที่เปิดแล้ว + โบนัส */
  points: number;
  bonusPoints: number;
  /** Like ที่ได้รับในรอบนี้ */
  likes: number;
  /** เปิดครบทุกช่องที่มีคำตอบแล้ว */
  complete: boolean;
}

export interface AnswerGroupView {
  id: string;
  topicIndex: number;
  /** ข้อความที่ใช้แสดง (คำที่มีคนพิมพ์มากที่สุดในกลุ่ม) */
  label: string;
  /** คำที่สะกดต่างกันซึ่งถูกนับเป็นกลุ่มเดียวกัน */
  variants: string[];
  playerIds: string[];
  size: number;
  kind: MatchKind;
  pointsPerCell: number;
}

export type MatchRequestStatus = 'pending' | 'approved' | 'rejected' | 'undone';

export interface MatchRequestView {
  id: string;
  requesterId: string;
  /** คำบนกระดานของผู้ส่ง */
  offered: { answerId: string; text: string };
  /** คำที่กำลังเปิดอยู่ ซึ่งผู้ส่งเสนอว่าความหมายเดียวกัน */
  target: { answerId: string; text: string; playerId: string };
  status: MatchRequestStatus;
}

export interface RevealView {
  /** ลำดับผู้เล่นที่จะเปิด (สุ่มครั้งเดียวต่อรอบ) */
  order: string[];
  currentIndex: number;
  currentPlayerId: string;
  /** คำที่เพิ่งเปิดล่าสุดของคนปัจจุบัน — Match Request ส่งได้เฉพาะคำนี้ */
  focusAnswerId: string | null;
  /** จำนวนครั้งที่เปิดไปแล้วทั้งรอบ (ใช้ trigger animation) */
  revealCount: number;
  boards: RevealBoardView[];
  /** เฉพาะกลุ่มที่มีคำถูกเปิดแล้ว */
  groups: AnswerGroupView[];
  /** คำขอจับคู่ของรอบนี้ทั้งหมด เรียงตามเวลาที่ส่ง */
  requests: MatchRequestView[];
}

// ───────────────────────── Results ─────────────────────────

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
  /** Popularity — ไม่มีผลกับ rank */
  likes: number;
  totalLikes: number;
}

export interface TopMatchedView {
  rank: number;
  groupId: string;
  topicIndex: number;
  label: string;
  variants: string[];
  playerIds: string[];
  size: number;
}

export interface TopLikedView {
  rank: number;
  answerId: string;
  playerId: string;
  topicIndex: number;
  text: string;
  likes: number;
}

export interface RoundResultView {
  roundIndex: number;
  /** เรียงตามอันดับแล้ว */
  scores: PlayerRoundScore[];
  boards: RevealBoardView[];
  topMatched: TopMatchedView[];
  topLiked: TopLikedView[];
}

export interface FinalStanding {
  playerId: string;
  name: string;
  color: number;
  total: number;
  rank: number;
  roundTotals: number[];
  jinxoCount: number;
  totalLikes: number;
}

export interface FinalResultView {
  winnerIds: string[];
  standings: FinalStanding[];
  /** คนที่ได้ Like รวมมากที่สุด (เสมอได้หลายคน, ว่างถ้าไม่มีใครได้ Like) */
  popularIds: string[];
}

export interface AuthoringView {
  authorId: string;
  topicIndex: number;
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
  /** โหมดคิดโจทย์เอง */
  customMode: boolean;
  /** รอบปัจจุบัน (0-based) */
  roundIndex: number;
  /** หัวข้อของรอบนี้ที่เปิดแล้ว */
  topics: Topic[];
  currentTopicIndex: number | null;
  authoring: AuthoringView | null;
  /** กระดานของตัวเอง — เห็นครบเสมอ */
  myBoard: Board;
  myReady: boolean;
  /** answer id ที่ตัวเองกด Like ไว้ */
  myLikes: string[];
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

export function answerIdOf(playerId: string, cellIndex: number): string {
  return `${playerId}:${cellIndex}`;
}
