/**
 * Scoring engine — pure functions ไม่ผูกกับ socket/UI
 * รับกระดานของทุกคน + การรวมกลุ่มคำพ้องของ Host + config แล้วคืนผลคะแนน
 * เปลี่ยนกติกาได้ที่ server/config/scoring.json โดยไม่ต้องแตะโค้ดนี้
 */
import { LINES, normalizeAnswer, type Board, type LineId, type MatchKind, type PublicScoringConfig } from '@jinxo/shared';

/** key ของคำตอบก่อนรวมกลุ่ม: "<topicIndex>|<คำที่ normalize แล้ว>" */
export type BaseKey = string;

export function baseKeyOf(topicIndex: number, text: string): BaseKey {
  return `${topicIndex}|${normalizeAnswer(text)}`;
}

export interface GroupMember {
  playerId: string;
  cellIndex: number;
  text: string;
}

export interface AnswerGroup {
  /** canonical key ของกลุ่ม */
  id: string;
  topicIndex: number;
  baseKeys: BaseKey[];
  members: GroupMember[];
  playerIds: string[];
}

/** Host รวมกลุ่ม: base key → canonical key (ไม่มีใน map = เป็น canonical ของตัวเอง) */
export type AliasMap = ReadonlyMap<BaseKey, string>;

export function canonicalOf(key: BaseKey, aliases: AliasMap): string {
  return aliases.get(key) ?? key;
}

export function buildGroups(boards: ReadonlyMap<string, Board>, aliases: AliasMap = new Map()): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const [playerId, board] of boards) {
    board.forEach((cell, cellIndex) => {
      if (!cell) return;
      const base = baseKeyOf(cell.topicIndex, cell.text);
      const id = canonicalOf(base, aliases);
      let g = groups.get(id);
      if (!g) {
        g = { id, topicIndex: cell.topicIndex, baseKeys: [], members: [], playerIds: [] };
        groups.set(id, g);
      }
      if (!g.baseKeys.includes(base)) g.baseKeys.push(base);
      g.members.push({ playerId, cellIndex, text: cell.text });
      if (!g.playerIds.includes(playerId)) g.playerIds.push(playerId);
    });
  }
  return [...groups.values()];
}

export interface TierResult {
  points: number;
  kind: MatchKind;
}

/** คะแนนต่อช่อง ตามจำนวนผู้เล่น (ไม่ซ้ำคน) ที่ตอบคำนี้ */
export function tierFor(playerCount: number, config: PublicScoringConfig): TierResult {
  const tier = config.tiers.find(
    (t) => playerCount >= t.minPlayers && (t.maxPlayers === undefined || playerCount <= t.maxPlayers),
  );
  return tier ? { points: tier.points, kind: tier.kind } : { points: 0, kind: 'none' };
}

export function lineBonusValue(line: LineId, config: PublicScoringConfig): number {
  const lb = config.lineBonus;
  if (!lb.enabled) return 0;
  const idx = Number(line[1]);
  if (line[0] === 'r') return lb.rows[idx] ?? 0;
  if (line[0] === 'c') return lb.columns[idx] ?? 0;
  return lb.diagonals?.[idx] ?? 0;
}

export interface CellScore {
  cellIndex: number;
  groupId: string;
  playerCount: number;
  kind: MatchKind;
  points: number;
  /**
   * ผู้เล่นคนนี้มีช่องอื่นในกลุ่มเดียวกันที่ถูกนับไปแล้ว (เกิดได้จากการจับคู่คำพ้องเท่านั้น)
   * → ช่องนี้ 0 แต้ม และไม่นับเป็นช่องที่ตรงกันสำหรับโบนัสแนว กันการปั๊มคะแนน
   */
  duplicate: boolean;
}

export interface BoardScore {
  cells: (CellScore | null)[];
  basePoints: number;
  bonusPoints: number;
  bonusLines: LineId[];
  jinxoCount: number;
  matchCount: number;
}

/** index สำหรับหาว่าช่องไหนของใครอยู่กลุ่มไหน */
export function indexGroups(groups: AnswerGroup[]): Map<string, AnswerGroup> {
  const byCell = new Map<string, AnswerGroup>();
  for (const g of groups) for (const m of g.members) byCell.set(`${m.playerId}#${m.cellIndex}`, g);
  return byCell;
}

export function cellQualifiesForBonus(cell: CellScore | null, config: PublicScoringConfig): boolean {
  if (!cell || cell.duplicate) return false;
  return config.lineBonus.condition === 'jinxo' ? cell.kind === 'jinxo' : cell.playerCount >= 2;
}

export function scoreBoard(
  playerId: string,
  board: Board,
  byCell: Map<string, AnswerGroup>,
  config: PublicScoringConfig,
): BoardScore {
  // ช่องแรก (cellIndex น้อยสุด) ของผู้เล่นในแต่ละกลุ่มเท่านั้นที่ได้แต้ม — ผลเหมือนเดิมทุกครั้ง (deterministic)
  const counted = new Set<string>();
  const cells: (CellScore | null)[] = board.map((cell, cellIndex) => {
    if (!cell) return null;
    const g = byCell.get(`${playerId}#${cellIndex}`);
    if (!g) return null;
    const duplicate = counted.has(g.id);
    counted.add(g.id);
    const { points, kind } = tierFor(g.playerIds.length, config);
    return {
      cellIndex,
      groupId: g.id,
      playerCount: g.playerIds.length,
      kind,
      points: duplicate ? 0 : points,
      duplicate,
    };
  });

  const basePoints = cells.reduce((s, c) => s + (c?.points ?? 0), 0);
  const bonusLines: LineId[] = [];
  let bonusPoints = 0;
  if (config.lineBonus.enabled) {
    for (const line of Object.keys(LINES) as LineId[]) {
      const value = lineBonusValue(line, config);
      if (value === 0) continue;
      if (LINES[line].every((i) => cellQualifiesForBonus(cells[i], config))) {
        bonusLines.push(line);
        bonusPoints += value;
      }
    }
  }
  return {
    cells,
    basePoints,
    bonusPoints,
    bonusLines,
    jinxoCount: cells.filter((c) => c?.kind === 'jinxo' && !c.duplicate).length,
    matchCount: cells.filter((c) => c && !c.duplicate && c.playerCount >= 2).length,
  };
}

export function scoreRound(
  boards: ReadonlyMap<string, Board>,
  aliases: AliasMap,
  config: PublicScoringConfig,
): Map<string, BoardScore> {
  const byCell = indexGroups(buildGroups(boards, aliases));
  const out = new Map<string, BoardScore>();
  for (const [playerId, board] of boards) out.set(playerId, scoreBoard(playerId, board, byCell, config));
  return out;
}

/** อันดับแบบแข่งขัน: คะแนนเท่ากันได้อันดับเดียวกัน แล้วข้ามอันดับถัดไป (1, 1, 3) */
export function rank<T>(items: T[], scoreOf: (t: T) => number): { item: T; rank: number }[] {
  const sorted = [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((item, i) => {
    const s = scoreOf(item);
    if (s !== lastScore) {
      lastRank = i + 1;
      lastScore = s;
    }
    return { item, rank: lastRank };
  });
}

/**
 * รวม base key เป็นกลุ่มตาม "เส้นเชื่อม" ที่ Host อนุมัติ (union-find)
 * คืน AliasMap: base key → id ของกลุ่ม (base key ที่น้อยที่สุดในกลุ่ม เพื่อให้ id คงที่ไม่ขึ้นกับลำดับการอนุมัติ)
 */
export function aliasesFromEdges(edges: Iterable<readonly [BaseKey, BaseKey]>): Map<BaseKey, string> {
  const parent = new Map<BaseKey, BaseKey>();
  const find = (k: BaseKey): BaseKey => {
    let root = k;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = k;
    while (parent.has(cur) && parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const [a, b] of edges) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    // root = key ที่น้อยกว่า → id กลุ่มคงที่
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  }
  const out = new Map<BaseKey, string>();
  for (const k of parent.keys()) {
    const r = find(k);
    if (r !== k) out.set(k, r);
  }
  return out;
}
