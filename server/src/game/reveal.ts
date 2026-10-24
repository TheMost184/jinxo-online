/**
 * Reveal engine — เปิดคำตอบทีละคนตามลำดับที่สุ่มไว้ + Match Request + Like
 *
 * หลักการที่กันคะแนนเพี้ยน:
 * - สถานะ "เปิดแล้ว" (revealed) แยกจากสถานะ "ตรงกัน" (คำนวณจากกลุ่มคำตอบ) — ไม่เก็บซ้ำซ้อน
 * - กลุ่มคำตอบ = คำที่พิมพ์เหมือนกันในหัวข้อเดียวกัน + เส้นเชื่อมจาก Match ที่ Host อนุมัติ
 *   คำนวณใหม่จากศูนย์ทุกครั้งที่มีการเปลี่ยนแปลง (ไม่มีการบวกคะแนนสะสม)
 * - การเปิดเป็นแบบปิดตัวเองภายในกลุ่ม: ถ้าคำใดในกลุ่มถูกเปิด คำอื่นในกลุ่มก็เปิดด้วย (MATCHED)
 *   ดังนั้นกลุ่มที่ยังไม่เปิดจะไม่รั่วข้อมูล และคะแนนที่โชว์ระหว่างเปิดเท่ากับคะแนนจริงของกลุ่มนั้นเสมอ
 *
 * ทุก method ทำงานแบบ synchronous จนจบ — Node.js รัน socket handler ทีละตัว จึงไม่มี race condition
 */
import {
  LINES,
  answerIdOf,
  type AnswerGroupView,
  type AnswerView,
  type Board,
  type LineId,
  type MatchRequestStatus,
  type MatchRequestView,
  type PublicScoringConfig,
  type RevealBoardView,
  type RevealCell,
  type RevealView,
  type TopLikedView,
  type TopMatchedView,
} from '@jinxo/shared';
import { GameError } from '../utils/errors.js';
import {
  aliasesFromEdges,
  baseKeyOf,
  buildGroups,
  indexGroups,
  lineBonusValue,
  rank,
  scoreBoard,
  tierFor,
  type AnswerGroup,
  type BaseKey,
  type BoardScore,
} from './scoring.js';

export interface AnswerRecord {
  id: string;
  playerId: string;
  cellIndex: number;
  topicIndex: number;
  text: string;
  baseKey: BaseKey;
}

interface RevealMark {
  seq: number;
  by: 'turn' | 'match';
}

export interface MatchRequest {
  id: string;
  requesterId: string;
  offeredId: string;
  targetId: string;
  status: MatchRequestStatus;
}

export class RevealEngine {
  readonly answers = new Map<string, AnswerRecord>();
  currentIndex = 0;
  focusId: string | null = null;
  readonly requests: MatchRequest[] = [];

  private readonly revealed = new Map<string, RevealMark>();
  private seq = 0;
  private turnReveals = 0;
  private readonly likes = new Map<string, Set<string>>();
  private aliases = new Map<BaseKey, string>();
  private groups: AnswerGroup[] = [];
  private byCell = new Map<string, AnswerGroup>();
  private nextRequestId = 1;

  constructor(
    private readonly boards: ReadonlyMap<string, Board>,
    readonly order: readonly string[],
    private readonly scoring: PublicScoringConfig,
  ) {
    for (const [playerId, board] of boards) {
      board.forEach((cell, cellIndex) => {
        if (!cell) return;
        const id = answerIdOf(playerId, cellIndex);
        this.answers.set(id, {
          id,
          playerId,
          cellIndex,
          topicIndex: cell.topicIndex,
          text: cell.text,
          baseKey: baseKeyOf(cell.topicIndex, cell.text),
        });
      });
    }
    this.recompute();
  }

  // ───────────────────────── derived state ─────────────────────────

  /** คำนวณกลุ่มใหม่ทั้งหมดจากกระดาน + เส้นเชื่อมที่อนุมัติ แล้วเปิดคำที่ตรงกับคำที่เปิดแล้ว */
  private recompute() {
    const edges: [BaseKey, BaseKey][] = this.requests
      .filter((r) => r.status === 'approved')
      .map((r) => [this.answers.get(r.offeredId)!.baseKey, this.answers.get(r.targetId)!.baseKey]);
    this.aliases = aliasesFromEdges(edges);
    this.groups = buildGroups(this.boards, this.aliases);
    this.byCell = indexGroups(this.groups);
    this.closeReveals();
  }

  private closeReveals() {
    for (const g of this.groups) {
      if (!g.members.some((m) => this.revealed.has(answerIdOf(m.playerId, m.cellIndex)))) continue;
      for (const m of g.members) {
        const id = answerIdOf(m.playerId, m.cellIndex);
        if (!this.revealed.has(id)) this.revealed.set(id, { seq: ++this.seq, by: 'match' });
      }
    }
  }

  groupOf(answerId: string): AnswerGroup {
    const a = this.answers.get(answerId)!;
    return this.byCell.get(`${a.playerId}#${a.cellIndex}`)!;
  }

  isRevealed(answerId: string): boolean {
    return this.revealed.has(answerId);
  }

  get currentPlayerId(): string {
    return this.order[this.currentIndex];
  }

  get isLastPlayer(): boolean {
    return this.currentIndex >= this.order.length - 1;
  }

  pendingRequests(): MatchRequest[] {
    return this.requests.filter((r) => r.status === 'pending');
  }

  /** ช่องของผู้เล่นที่ยังคว่ำอยู่ เรียงตามหัวข้อแล้วตามตำแหน่งช่อง */
  hiddenOf(playerId: string): AnswerRecord[] {
    return [...this.answers.values()]
      .filter((a) => a.playerId === playerId && !this.revealed.has(a.id))
      .sort((a, b) => a.topicIndex - b.topicIndex || a.cellIndex - b.cellIndex);
  }

  likeCount(answerId: string): number {
    return this.likes.get(answerId)?.size ?? 0;
  }

  likedBy(playerId: string): string[] {
    const out: string[] = [];
    for (const [id, set] of this.likes) if (set.has(playerId)) out.push(id);
    return out;
  }

  likesReceived(playerId: string): number {
    let n = 0;
    for (const [id, set] of this.likes) if (this.answers.get(id)?.playerId === playerId) n += set.size;
    return n;
  }

  // ───────────────────────── Host controls ─────────────────────────

  private requireNoPending() {
    if (this.pendingRequests().length > 0) {
      throw new GameError('PENDING_REQUESTS', 'ยังมีคำขอจับคู่รอตัดสินอยู่ ตัดสินให้ครบก่อนนะ');
    }
  }

  /** เปิดคำถัดไปของคนที่กำลังเปิด */
  revealNextAnswer(): AnswerRecord {
    this.requireNoPending();
    const next = this.hiddenOf(this.currentPlayerId)[0];
    if (!next) throw new GameError('NOTHING_TO_REVEAL', 'คำตอบของคนนี้เปิดครบแล้ว กดไปคนถัดไปได้เลย');
    this.revealed.set(next.id, { seq: ++this.seq, by: 'turn' });
    this.turnReveals += 1;
    this.focusId = next.id;
    this.closeReveals();
    return next;
  }

  /** ไปคนถัดไป — คืน 'done' ถ้าคนปัจจุบันคือคนสุดท้าย */
  nextPlayer(): 'next' | 'done' {
    this.requireNoPending();
    if (this.hiddenOf(this.currentPlayerId).length > 0) {
      throw new GameError('REVEAL_NOT_DONE', 'ยังมีคำของคนนี้ที่ยังไม่เปิด เปิดให้ครบก่อนนะ');
    }
    if (this.isLastPlayer) return 'done';
    this.currentIndex += 1;
    this.focusId = null;
    return 'next';
  }

  /** ตอนสรุปรอบ: เปิดทุกช่องที่เหลือ (กรณีปกติไม่มีเหลือแล้ว) */
  revealEverything() {
    for (const a of this.answers.values()) {
      if (!this.revealed.has(a.id)) this.revealed.set(a.id, { seq: ++this.seq, by: 'turn' });
    }
  }

  // ───────────────────────── Match requests ─────────────────────────

  requestMatch(requesterId: string, targetAnswerId: string, cellIndex: number): MatchRequest {
    if (!this.boards.has(requesterId)) {
      throw new GameError('NOT_A_PLAYER', 'คุณไม่ได้เล่นในรอบนี้');
    }
    if (targetAnswerId !== this.focusId) {
      throw new GameError('STALE_TARGET', 'คำนี้ผ่านไปแล้ว ส่งได้เฉพาะคำที่กำลังเปิดอยู่');
    }
    const target = this.answers.get(targetAnswerId)!;
    if (target.playerId === requesterId) {
      throw new GameError('OWN_ANSWER', 'จับคู่กับคำตอบของตัวเองไม่ได้');
    }
    if (this.requests.some((r) => r.requesterId === requesterId && r.targetId === targetAnswerId)) {
      throw new GameError('DUPLICATE_REQUEST', 'คุณส่งคำขอสำหรับคำนี้ไปแล้ว ส่งได้คำละ 1 ครั้ง');
    }
    const offered = this.answers.get(answerIdOf(requesterId, cellIndex));
    if (!offered) throw new GameError('INVALID_MATCH', 'ช่องนี้บนกระดานของคุณไม่มีคำตอบ');
    if (offered.topicIndex !== target.topicIndex) {
      throw new GameError('INVALID_MATCH', 'ต้องเลือกคำตอบของหัวข้อเดียวกันนะ');
    }
    const group = this.groupOf(target.id);
    if (group.playerIds.includes(requesterId)) {
      throw new GameError('INVALID_MATCH', 'คุณมีคำที่นับว่าตรงกับคำนี้อยู่แล้ว');
    }
    const req: MatchRequest = {
      id: `m${this.nextRequestId++}`,
      requesterId,
      offeredId: offered.id,
      targetId: target.id,
      status: 'pending',
    };
    this.requests.push(req);
    return req;
  }

  /** Host ตัดสินคำขอ — ต้องตัดสินตามลำดับคิว */
  decide(requestId: string, approve: boolean): MatchRequest {
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) throw new GameError('INVALID_PAYLOAD', 'ไม่พบคำขอนี้');
    if (req.status !== 'pending') throw new GameError('ALREADY_DECIDED', 'คำขอนี้ตัดสินไปแล้ว');
    if (this.pendingRequests()[0].id !== req.id) {
      throw new GameError('INVALID_PAYLOAD', 'ตัดสินคำขอตามลำดับคิวนะ');
    }
    req.status = approve ? 'approved' : 'rejected';
    if (approve) this.recompute();
    return req;
  }

  /** Host ยกเลิกการจับคู่ที่อนุมัติไปแล้ว (กดพลาด) — คะแนนคิดใหม่ทันที */
  undo(requestId: string): MatchRequest {
    const req = this.requests.find((r) => r.id === requestId);
    if (!req || req.status !== 'approved') throw new GameError('INVALID_PAYLOAD', 'ยกเลิกได้เฉพาะคำขอที่อนุมัติแล้ว');
    req.status = 'undone';
    this.recompute();
    return req;
  }

  // ───────────────────────── Likes ─────────────────────────

  setLike(playerId: string, answerId: string, like: boolean) {
    const a = this.answers.get(answerId);
    if (!a || !this.revealed.has(answerId)) throw new GameError('NOT_REVEALED', 'คำตอบนี้ยังไม่ถูกเปิด');
    if (a.playerId === playerId) throw new GameError('OWN_ANSWER', 'กด Like คำตอบของตัวเองไม่ได้');
    let set = this.likes.get(answerId);
    if (!set) {
      set = new Set();
      this.likes.set(answerId, set);
    }
    if (like) set.add(playerId);
    else set.delete(playerId);
  }

  // ───────────────────────── scoring & views ─────────────────────────

  /** คะแนนเต็มของทุกคน (ใช้ตอนสรุปรอบ) */
  fullScores(): Map<string, BoardScore> {
    const out = new Map<string, BoardScore>();
    for (const [pid, board] of this.boards) out.set(pid, scoreBoard(pid, board, this.byCell, this.scoring));
    return out;
  }

  private answerView(a: AnswerRecord, score: BoardScore): AnswerView {
    const cs = score.cells[a.cellIndex]!;
    return {
      id: a.id,
      playerId: a.playerId,
      cellIndex: a.cellIndex,
      topicIndex: a.topicIndex,
      text: a.text,
      groupId: cs.groupId,
      groupSize: cs.playerCount,
      kind: cs.kind,
      points: cs.points,
      duplicate: cs.duplicate,
      revealedBy: this.revealed.get(a.id)!.by,
      likes: this.likeCount(a.id),
    };
  }

  /** กระดานของผู้เล่นในมุมมองสาธารณะ — เฉพาะช่องที่เปิดแล้วเท่านั้นที่มีข้อความ */
  boardView(playerId: string): RevealBoardView {
    const board = this.boards.get(playerId)!;
    const score = scoreBoard(playerId, board, this.byCell, this.scoring);
    const shown = board.map((_, i) => this.revealed.has(answerIdOf(playerId, i)));
    const cells: RevealCell[] = board.map((cell, i) => {
      if (!cell) return { state: 'empty' };
      if (!shown[i]) return { state: 'hidden', topicIndex: cell.topicIndex };
      return { state: 'shown', answer: this.answerView(this.answers.get(answerIdOf(playerId, i))!, score) };
    });
    // แนวที่ยังมีช่องคว่ำอยู่ยังไม่นับ — ไม่งั้นจะรั่วว่าช่องที่ยังไม่เปิดตรงกับใคร
    const bonusLines = score.bonusLines.filter((l: LineId) => LINES[l].every((i) => shown[i] || !board[i]));
    const bonusPoints = bonusLines.reduce((s, l) => s + lineBonusValue(l, this.scoring), 0);
    const base = score.cells.reduce((s, c, i) => s + (c && shown[i] ? c.points : 0), 0);
    return {
      playerId,
      cells,
      bonusLines,
      points: base + bonusPoints,
      bonusPoints,
      likes: this.likesReceived(playerId),
      complete: this.hiddenOf(playerId).length === 0,
    };
  }

  groupView(g: AnswerGroup): AnswerGroupView {
    const counts = new Map<string, number>();
    for (const m of g.members) counts.set(m.text, (counts.get(m.text) ?? 0) + 1);
    const variants = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
      .map(([t]) => t);
    const { points, kind } = tierFor(g.playerIds.length, this.scoring);
    return {
      id: g.id,
      topicIndex: g.topicIndex,
      label: variants[0],
      variants,
      playerIds: g.playerIds,
      size: g.playerIds.length,
      kind,
      pointsPerCell: points,
    };
  }

  private requestView(r: MatchRequest): MatchRequestView {
    const offered = this.answers.get(r.offeredId)!;
    const target = this.answers.get(r.targetId)!;
    return {
      id: r.id,
      requesterId: r.requesterId,
      offered: { answerId: offered.id, text: offered.text },
      target: { answerId: target.id, text: target.text, playerId: target.playerId },
      status: r.status,
    };
  }

  /** ส่วนที่ทุกคนเห็นเหมือนกัน — คำนวณครั้งเดียวต่อการ broadcast */
  publicView(): RevealView {
    const revealedGroups = this.groups.filter((g) =>
      g.members.some((m) => this.revealed.has(answerIdOf(m.playerId, m.cellIndex))),
    );
    return {
      order: [...this.order],
      currentIndex: this.currentIndex,
      currentPlayerId: this.currentPlayerId,
      focusAnswerId: this.focusId,
      revealCount: this.turnReveals,
      boards: this.order.map((pid) => this.boardView(pid)),
      groups: revealedGroups.map((g) => this.groupView(g)),
      requests: this.requests.map((r) => this.requestView(r)),
    };
  }

  /** Top 3 กลุ่มที่มีคนตอบเหมือนกันมากที่สุด (นับคนไม่ซ้ำ ไม่ใช่จำนวนช่อง) */
  topMatched(limit = 3): TopMatchedView[] {
    const candidates = this.groups
      .filter((g) => g.playerIds.length >= 2)
      .map((g) => this.groupView(g))
      .sort((a, b) => b.size - a.size || a.topicIndex - b.topicIndex || a.label.localeCompare(b.label, 'th'));
    return rank(candidates, (g) => g.size)
      .slice(0, limit)
      .map(({ item: g, rank: r }) => ({
        rank: r,
        groupId: g.id,
        topicIndex: g.topicIndex,
        label: g.label,
        variants: g.variants,
        playerIds: g.playerIds,
        size: g.size,
      }));
  }

  /** Top 3 คำตอบที่ได้ Like มากที่สุด — เสมอกันให้คำที่ถูกเปิดก่อนขึ้นก่อน */
  topLiked(limit = 3): TopLikedView[] {
    const candidates = [...this.answers.values()]
      .map((a) => ({ a, likes: this.likeCount(a.id), seq: this.revealed.get(a.id)?.seq ?? Infinity }))
      .filter((x) => x.likes > 0)
      .sort((x, y) => y.likes - x.likes || x.seq - y.seq || x.a.id.localeCompare(y.a.id));
    return rank(candidates, (x) => x.likes)
      .slice(0, limit)
      .map(({ item: { a, likes }, rank: r }) => ({
        rank: r,
        answerId: a.id,
        playerId: a.playerId,
        topicIndex: a.topicIndex,
        text: a.text,
        likes,
      }));
  }
}
