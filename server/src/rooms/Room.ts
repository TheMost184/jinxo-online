import { randomBytes, randomUUID } from 'node:crypto';
import {
  BOARD_SIZE,
  LINES,
  cleanAnswer,
  normalizeAnswer,
  type AnswerGroupView,
  type Board,
  type FinalResultView,
  type Notice,
  type Phase,
  type Placement,
  type PlayerRoundScore,
  type PlayerView,
  type RevealBoardView,
  type RevealCell,
  type RevealView,
  type RoomView,
  type RoundResultView,
  type Topic,
} from '@jinxo/shared';
import { publicGameConfig, type GameConfig, type ScoringConfig } from '../config.js';
import { buildRevealSteps, type RevealStep } from '../game/reveal.js';
import {
  baseKeyOf,
  buildGroups,
  canonicalOf,
  indexGroups,
  lineBonusValue,
  rank,
  scoreBoard,
  scoreRound,
  tierFor,
  type AnswerGroup,
  type BaseKey,
} from '../game/scoring.js';
import type { QuestionBank } from '../questions/questionBank.js';
import { GameError } from '../utils/errors.js';

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  color: number;
  joinedAt: number;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  /** กดออกจากห้องระหว่างเกม — ยังเก็บคะแนนไว้แสดง แต่ไม่รอและเข้ากลับไม่ได้ */
  left: boolean;
  totalScore: number;
  roundTotals: number[];
  jinxoTotal: number;
}

interface RoundState {
  index: number;
  topics: Topic[];
  currentTopic: number;
  /** ผู้เล่นที่อยู่ในรอบนี้ตั้งแต่เริ่ม */
  participants: string[];
  boards: Map<string, Board>;
  submitted: Set<string>;
  skipped: Set<string>;
  aliases: Map<BaseKey, string>;
  steps: RevealStep[];
  revealed: number;
  result: RoundResultView | null;
}

export interface RoomDeps {
  config: GameConfig;
  scoring: ScoringConfig;
  questions: QuestionBank;
}

const PLAYER_COLORS = 8;

/**
 * Game state machine ของห้องหนึ่งห้อง — ไม่รู้จัก socket
 * ทุก action ตรวจสิทธิ์ + phase + ข้อมูลเสมอ และโยน GameError ถ้าไม่ผ่าน
 * ชั้น socket เป็นคน broadcast state หลัง action สำเร็จ
 */
export class Room {
  phase: Phase = 'lobby';
  players: PlayerState[] = [];
  hostId = '';
  selectedCategories: string[];
  private usedQuestionIds = new Set<number>();
  private gameTopics: Topic[] = [];
  private round: RoundState | null = null;
  private history: RoundResultView[] = [];
  private final: FinalResultView | null = null;
  private notices: Notice[] = [];
  /** เวลาที่ห้องไม่มีใครเชื่อมต่ออยู่เลย (null = มีคนอยู่) */
  emptySince: number | null = null;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
    private readonly now: () => number = Date.now,
  ) {
    this.selectedCategories = deps.questions.categories.map((c) => c.id);
  }

  // ───────────────────────── helpers ─────────────────────────

  private get cfg() {
    return this.deps.config;
  }

  private get activePlayers(): PlayerState[] {
    return this.players.filter((p) => !p.left);
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  private mustGetPlayer(id: string): PlayerState {
    const p = this.getPlayer(id);
    if (!p || p.left) throw new GameError('NOT_IN_ROOM', 'คุณไม่ได้อยู่ในห้องนี้แล้ว');
    return p;
  }

  private requireHost(playerId: string) {
    this.mustGetPlayer(playerId);
    if (playerId !== this.hostId) throw new GameError('NOT_HOST', 'เฉพาะ Host เท่านั้นที่ทำสิ่งนี้ได้');
  }

  private requirePhase(...phases: Phase[]) {
    if (!phases.includes(this.phase)) {
      throw new GameError('WRONG_PHASE', 'ทำรายการนี้ไม่ได้ในช่วงนี้ของเกม ลองรีเฟรชหน้าดูนะ');
    }
  }

  private notice(kind: Notice['kind'], message: string) {
    this.notices.push({ kind, message });
  }

  /** ดึง notice ที่ค้างไว้ (ชั้น socket เรียกตอน broadcast) */
  takeNotices(): Notice[] {
    const n = this.notices;
    this.notices = [];
    return n;
  }

  private pickColor(): number {
    const used = new Set(this.activePlayers.map((p) => p.color));
    for (let i = 0; i < PLAYER_COLORS; i++) if (!used.has(i)) return i;
    return this.players.length % PLAYER_COLORS;
  }

  private cleanName(raw: string): string {
    const name = cleanAnswer(raw);
    if (name.length === 0) throw new GameError('INVALID_PAYLOAD', 'กรุณากรอกชื่อผู้เล่น');
    if ([...name].length > this.cfg.maxNameLength) {
      throw new GameError('INVALID_PAYLOAD', `ชื่อยาวได้ไม่เกิน ${this.cfg.maxNameLength} ตัวอักษร`);
    }
    return name;
  }

  // ───────────────────────── lobby / membership ─────────────────────────

  /** เพิ่มผู้เล่นใหม่ (ทั้งคนสร้างห้องและคนเข้าร่วม) */
  addPlayer(rawName: string): PlayerState {
    const name = this.cleanName(rawName);
    if (this.phase !== 'lobby') {
      throw new GameError('GAME_IN_PROGRESS', 'ห้องนี้กำลังเล่นอยู่ รอให้จบเกมก่อนแล้วค่อยเข้าใหม่นะ');
    }
    if (this.activePlayers.length >= this.cfg.maxPlayers) {
      throw new GameError('ROOM_FULL', `ห้องเต็มแล้ว (สูงสุด ${this.cfg.maxPlayers} คน)`);
    }
    const key = normalizeAnswer(name);
    if (this.activePlayers.some((p) => normalizeAnswer(p.name) === key)) {
      throw new GameError('NAME_TAKEN', `ชื่อ "${name}" มีคนใช้แล้วในห้องนี้ ลองชื่ออื่นนะ`);
    }
    const player: PlayerState = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      name,
      color: this.pickColor(),
      joinedAt: this.now(),
      socketId: null,
      connected: false,
      disconnectedAt: this.now(),
      left: false,
      totalScore: 0,
      roundTotals: [],
      jinxoTotal: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    else this.notice('info', `${name} เข้าห้องแล้ว`);
    return player;
  }

  /** ตรวจ token ตอน reconnect */
  authenticate(playerId: string, token: string): PlayerState {
    const p = this.getPlayer(playerId);
    if (!p || p.left || p.token !== token) {
      throw new GameError('SESSION_INVALID', 'เซสชันหมดอายุแล้ว กรุณาเข้าห้องใหม่อีกครั้ง');
    }
    return p;
  }

  attachSocket(playerId: string, socketId: string) {
    const p = this.mustGetPlayer(playerId);
    const wasAway = !p.connected;
    p.socketId = socketId;
    p.connected = true;
    p.disconnectedAt = null;
    this.emptySince = null;
    // กลับมาทันก่อนหัวข้อจบ → ให้ตอบต่อได้
    if (this.phase === 'answering' && this.round && !this.round.submitted.has(p.id)) {
      this.round.skipped.delete(p.id);
    }
    if (wasAway && this.phase !== 'lobby') this.notice('info', `${p.name} กลับเข้ามาแล้ว`);
  }

  /** socket หลุด — คืน true ถ้า state เปลี่ยน */
  detachSocket(socketId: string): boolean {
    const p = this.players.find((x) => x.socketId === socketId);
    if (!p) return false;
    p.socketId = null;
    p.connected = false;
    p.disconnectedAt = this.now();
    if (!p.left) this.notice('warn', `${p.name} หลุดการเชื่อมต่อ`);
    if (this.players.every((x) => !x.connected)) this.emptySince = this.now();
    return true;
  }

  leave(playerId: string) {
    const p = this.mustGetPlayer(playerId);
    p.socketId = null;
    p.connected = false;
    p.disconnectedAt = this.now();
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x.id !== playerId);
    } else {
      p.left = true;
      if (this.round) this.round.skipped.add(p.id);
    }
    this.notice('info', `${p.name} ออกจากห้อง`);
    if (this.hostId === playerId) this.transferHost();
    if (this.players.every((x) => !x.connected)) this.emptySince = this.now();
    if (this.phase === 'answering') this.maybeAdvanceTopic();
  }

  private transferHost(): boolean {
    const candidates = this.activePlayers
      .filter((p) => p.id !== this.hostId && p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates[0];
    if (!next) {
      // ไม่มีใครออนไลน์ให้โอน — ถ้า host เดิมออกไปแล้วให้คนที่ยังอยู่คนแรกเป็นแทน
      const current = this.getPlayer(this.hostId);
      if (!current || current.left) {
        const fallback = this.activePlayers[0];
        this.hostId = fallback?.id ?? '';
        return Boolean(fallback);
      }
      return false;
    }
    this.hostId = next.id;
    this.notice('info', `${next.name} เป็น Host คนใหม่`);
    return true;
  }

  setCategories(playerId: string, categories: string[]) {
    this.requireHost(playerId);
    this.requirePhase('lobby');
    const unique = [...new Set(categories)];
    if (unique.length === 0) throw new GameError('INVALID_PAYLOAD', 'เลือกอย่างน้อย 1 หมวดหมู่');
    for (const c of unique) {
      if (!this.deps.questions.hasCategory(c)) throw new GameError('INVALID_PAYLOAD', `ไม่รู้จักหมวด "${c}"`);
    }
    this.selectedCategories = unique;
  }

  // ───────────────────────── game flow ─────────────────────────

  get topicsNeeded(): number {
    return this.cfg.rounds * this.cfg.topicsPerRound;
  }

  start(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('lobby');
    // คนที่หลุดค้างอยู่ใน lobby ไม่ถูกพาเข้าเกม
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < this.cfg.minPlayers) {
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `ต้องมีผู้เล่นออนไลน์อย่างน้อย ${this.cfg.minPlayers} คนถึงจะเริ่มได้`,
      );
    }
    const topics = this.deps.questions.pick(this.selectedCategories, this.topicsNeeded, this.usedQuestionIds);
    if (!topics) {
      throw new GameError(
        'NOT_ENOUGH_QUESTIONS',
        `หมวดที่เลือกมีคำถามไม่พอ (ต้องการ ${this.topicsNeeded} ข้อ) เลือกเพิ่มอีกหน่อยนะ`,
      );
    }
    for (const t of topics) this.usedQuestionIds.add(t.id);
    // ถ้าเล่นจนคำถามในหมวดหมดแล้ว ให้เริ่มนับใหม่ในเกมถัดไป
    if (this.usedQuestionIds.size >= this.deps.questions.countIn(this.selectedCategories)) {
      this.usedQuestionIds = new Set(topics.map((t) => t.id));
    }
    this.gameTopics = topics;
    for (const p of this.players) {
      p.totalScore = 0;
      p.roundTotals = [];
      p.jinxoTotal = 0;
    }
    this.history = [];
    this.final = null;
    this.startRound(0);
  }

  private startRound(index: number) {
    const tpr = this.cfg.topicsPerRound;
    const participants = this.activePlayers.map((p) => p.id);
    this.round = {
      index,
      topics: this.gameTopics.slice(index * tpr, (index + 1) * tpr),
      currentTopic: 0,
      participants,
      boards: new Map(participants.map((id) => [id, Array<null>(BOARD_SIZE).fill(null)])),
      submitted: new Set(),
      skipped: new Set(),
      aliases: new Map(),
      steps: [],
      revealed: 0,
      result: null,
    };
    this.phase = 'answering';
    this.applyAutoSkips();
  }

  private pendingRequired(): string[] {
    const r = this.round;
    if (!r) return [];
    return r.participants.filter((id) => !r.submitted.has(id) && !r.skipped.has(id));
  }

  /** ข้ามคนที่ออกไปแล้ว หรือหลุดนานเกินเวลาผ่อนผัน — คืน true ถ้ามีการเปลี่ยนแปลง */
  private applyAutoSkips(): boolean {
    const r = this.round;
    if (!r || this.phase !== 'answering') return false;
    const anyoneOnline = r.participants.some((id) => this.getPlayer(id)?.connected);
    let changed = false;
    for (const id of this.pendingRequired()) {
      const p = this.getPlayer(id);
      const away =
        !p ||
        p.left ||
        (anyoneOnline &&
          !p.connected &&
          p.disconnectedAt !== null &&
          this.now() - p.disconnectedAt >= this.cfg.disconnectGraceMs);
      if (away) {
        r.skipped.add(id);
        changed = true;
      }
    }
    return changed;
  }

  submitAnswers(playerId: string, placements: Placement[]) {
    this.mustGetPlayer(playerId);
    this.requirePhase('answering');
    const r = this.round!;
    if (!r.participants.includes(playerId)) {
      throw new GameError('NOT_A_PLAYER', 'คุณเข้าห้องมาหลังเกมเริ่ม รอเล่นเกมถัดไปนะ');
    }
    if (r.submitted.has(playerId)) {
      throw new GameError('ALREADY_SUBMITTED', 'คุณยืนยันคำตอบของหัวข้อนี้ไปแล้ว');
    }
    const need = this.cfg.answersPerTopic;
    if (placements.length !== need) {
      throw new GameError('INVALID_PAYLOAD', `ต้องใส่คำตอบให้ครบ ${need} ช่องพอดี`);
    }
    const board = r.boards.get(playerId)!;
    const seenCells = new Set<number>();
    const seenAnswers = new Set(board.filter((c) => c !== null).map((c) => normalizeAnswer(c!.text)));
    const cleaned: Placement[] = [];
    for (const pl of placements) {
      if (!Number.isInteger(pl.cellIndex) || pl.cellIndex < 0 || pl.cellIndex >= BOARD_SIZE) {
        throw new GameError('INVALID_PAYLOAD', 'ตำแหน่งช่องไม่ถูกต้อง');
      }
      if (seenCells.has(pl.cellIndex) || board[pl.cellIndex] !== null) {
        throw new GameError('CELL_TAKEN', 'ช่องนี้มีคำตอบอยู่แล้ว เลือกช่องว่างนะ');
      }
      seenCells.add(pl.cellIndex);
      const text = cleanAnswer(pl.text);
      const key = normalizeAnswer(text);
      if (key.length === 0) throw new GameError('INVALID_PAYLOAD', 'มีช่องที่ยังไม่ได้พิมพ์คำตอบ');
      if ([...text].length > this.cfg.maxAnswerLength) {
        throw new GameError('INVALID_PAYLOAD', `คำตอบยาวได้ไม่เกิน ${this.cfg.maxAnswerLength} ตัวอักษร`);
      }
      if (seenAnswers.has(key)) {
        throw new GameError('DUPLICATE_ANSWER', `คำว่า "${text}" มีอยู่บนกระดานของคุณแล้ว ห้ามตอบซ้ำนะ`);
      }
      seenAnswers.add(key);
      cleaned.push({ cellIndex: pl.cellIndex, text });
    }
    for (const pl of cleaned) board[pl.cellIndex] = { text: pl.text, topicIndex: r.currentTopic };
    r.submitted.add(playerId);
    r.skipped.delete(playerId);
    this.maybeAdvanceTopic();
  }

  /** Host ไม่รอคนที่ยังไม่ตอบ (เช่น AFK) */
  skipWaiting(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('answering');
    const r = this.round!;
    const pending = this.pendingRequired();
    if (pending.length === 0) return;
    for (const id of pending) r.skipped.add(id);
    const names = pending.map((id) => this.getPlayer(id)?.name).filter(Boolean);
    this.notice('info', `Host ข้าม ${names.join(', ')} ในหัวข้อนี้`);
    this.maybeAdvanceTopic();
  }

  private maybeAdvanceTopic(): boolean {
    if (this.phase !== 'answering' || !this.round) return false;
    this.applyAutoSkips();
    if (this.pendingRequired().length > 0) return false;
    const r = this.round;
    // ทุกคนถูกข้ามหมด (ไม่มีใครตอบเลย) และไม่มีใครออนไลน์ → รอไว้ก่อน ไม่เดินเกมทิ้ง
    if (r.submitted.size === 0 && !r.participants.some((id) => this.getPlayer(id)?.connected)) return false;
    if (r.currentTopic < r.topics.length - 1) {
      r.currentTopic += 1;
      r.submitted.clear();
      r.skipped.clear();
      this.maybeAdvanceTopic();
    } else {
      this.startReveal();
    }
    return true;
  }

  private startReveal() {
    const r = this.round!;
    r.steps = buildRevealSteps(buildGroups(r.boards), r.topics.length);
    r.revealed = 0;
    this.phase = r.steps.length === 0 ? 'review' : 'reveal';
  }

  revealNext(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('reveal');
    const r = this.round!;
    r.revealed = Math.min(r.revealed + 1, r.steps.length);
    if (r.revealed >= r.steps.length) this.phase = 'review';
  }

  revealAll(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('reveal');
    const r = this.round!;
    r.revealed = r.steps.length;
    this.phase = 'review';
  }

  private currentGroups(): AnswerGroup[] {
    const r = this.round!;
    return buildGroups(r.boards, r.aliases);
  }

  /** Host รวมคำที่สะกดต่างกันแต่ความหมายเดียวกันให้นับว่าตรงกัน */
  mergeGroups(playerId: string, topicIndex: number, groupIds: string[]) {
    this.requireHost(playerId);
    this.requirePhase('review');
    const r = this.round!;
    const ids = [...new Set(groupIds)];
    if (ids.length < 2) throw new GameError('INVALID_PAYLOAD', 'เลือกอย่างน้อย 2 คำเพื่อรวมกลุ่ม');
    const groups = new Map(this.currentGroups().map((g) => [g.id, g]));
    const selected = ids.map((id) => groups.get(id));
    if (selected.some((g) => !g || g.topicIndex !== topicIndex)) {
      throw new GameError('INVALID_PAYLOAD', 'รวมได้เฉพาะคำตอบในหัวข้อเดียวกัน');
    }
    const target = ids[0];
    for (const g of selected) {
      for (const base of g!.baseKeys) {
        if (base === target) r.aliases.delete(base);
        else r.aliases.set(base, target);
      }
    }
  }

  splitGroup(playerId: string, groupId: string) {
    this.requireHost(playerId);
    this.requirePhase('review');
    const r = this.round!;
    const g = this.currentGroups().find((x) => x.id === groupId);
    if (!g || g.baseKeys.length < 2) throw new GameError('INVALID_PAYLOAD', 'กลุ่มนี้ไม่ได้ถูกรวมไว้');
    for (const base of g.baseKeys) r.aliases.delete(base);
  }

  finalizeRound(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('review');
    const r = this.round!;
    const scores = scoreRound(r.boards, r.aliases, this.deps.scoring);
    for (const id of r.participants) {
      const p = this.getPlayer(id);
      const s = scores.get(id);
      if (!p || !s) continue;
      const roundTotal = s.basePoints + s.bonusPoints;
      p.roundTotals[r.index] = roundTotal;
      p.totalScore += roundTotal;
      p.jinxoTotal += s.jinxoCount;
    }
    const ranked = rank(
      r.participants.map((id) => this.getPlayer(id)).filter((p): p is PlayerState => Boolean(p)),
      (p) => p.totalScore,
    );
    const result: RoundResultView = {
      roundIndex: r.index,
      scores: ranked.map(({ item: p, rank: rk }): PlayerRoundScore => {
        const s = scores.get(p.id)!;
        return {
          playerId: p.id,
          name: p.name,
          color: p.color,
          basePoints: s.basePoints,
          bonusPoints: s.bonusPoints,
          roundTotal: s.basePoints + s.bonusPoints,
          total: p.totalScore,
          rank: rk,
          jinxoCount: s.jinxoCount,
          matchCount: s.matchCount,
          bonusLines: s.bonusLines,
        };
      }),
    };
    r.result = result;
    this.history.push(result);
    this.phase = 'roundResult';
  }

  nextRound(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('roundResult');
    const r = this.round!;
    if (r.index + 1 < this.cfg.rounds) {
      this.startRound(r.index + 1);
      return;
    }
    const everyone = this.players.filter((p) => p.roundTotals.length > 0 || !p.left);
    const ranked = rank(everyone, (p) => p.totalScore);
    this.final = {
      winnerIds: ranked.filter((x) => x.rank === 1).map((x) => x.item.id),
      standings: ranked.map(({ item: p, rank: rk }) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        total: p.totalScore,
        rank: rk,
        roundTotals: Array.from({ length: this.cfg.rounds }, (_, i) => p.roundTotals[i] ?? 0),
        jinxoCount: p.jinxoTotal,
      })),
    };
    this.phase = 'finalResult';
  }

  playAgain(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('finalResult');
    this.players = this.players.filter((p) => !p.left);
    for (const p of this.players) {
      p.totalScore = 0;
      p.roundTotals = [];
      p.jinxoTotal = 0;
    }
    this.round = null;
    this.history = [];
    this.final = null;
    this.gameTopics = [];
    this.phase = 'lobby';
  }

  // ───────────────────────── time-based rules ─────────────────────────

  /** เรียกทุก ๆ วินาทีจาก RoomManager — คืน true ถ้า state เปลี่ยน */
  tick(): boolean {
    const now = this.now();
    let changed = false;

    if (this.phase === 'lobby') {
      const before = this.players.length;
      const removed = this.players.filter(
        (p) =>
          !p.connected &&
          p.disconnectedAt !== null &&
          now - p.disconnectedAt >= this.cfg.lobbyDisconnectRemoveMs,
      );
      if (removed.length > 0) {
        this.players = this.players.filter((p) => !removed.includes(p));
        for (const p of removed) this.notice('info', `${p.name} ถูกนำออกจากห้องเพราะหลุดนานเกินไป`);
      }
      changed ||= this.players.length !== before;
    }

    const host = this.getPlayer(this.hostId);
    if (
      !host ||
      host.left ||
      (!host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= this.cfg.hostTransferGraceMs)
    ) {
      changed = this.transferHost() || changed;
    }

    if (this.phase === 'answering') {
      changed = this.applyAutoSkips() || changed;
      changed = this.maybeAdvanceTopic() || changed;
    }
    return changed;
  }

  isAbandoned(): boolean {
    if (this.activePlayers.length === 0) return true;
    return this.emptySince !== null && this.now() - this.emptySince >= this.cfg.emptyRoomTtlMs;
  }

  // ───────────────────────── views ─────────────────────────

  /** สร้าง state ในมุมมองของผู้เล่นคนหนึ่ง — ไม่มีข้อมูลที่เขาไม่ควรเห็น */
  viewFor(playerId: string): RoomView {
    const me = this.getPlayer(playerId)!;
    const r = this.round;
    const inGame = this.phase !== 'lobby' && this.phase !== 'finalResult';

    const players: PlayerView[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.id === this.hostId,
      connected: p.connected,
      left: p.left,
      ready: Boolean(inGame && r?.submitted.has(p.id)),
      skipped: Boolean(inGame && r?.skipped.has(p.id)),
      totalScore: p.totalScore,
    }));

    let topics: Topic[] = [];
    if (r && this.phase === 'answering') topics = r.topics.slice(0, r.currentTopic + 1);
    else if (r && inGame) topics = r.topics;

    const pending = this.phase === 'answering' ? this.pendingRequired().length : 0;
    const readyCount = this.phase === 'answering' && r ? r.submitted.size : 0;

    return {
      code: this.code,
      phase: this.phase,
      you: { id: me.id, name: me.name, isHost: me.id === this.hostId },
      hostId: this.hostId,
      players,
      config: { game: publicGameConfig(this.cfg), scoring: this.deps.scoring },
      categories: this.deps.questions.categories,
      selectedCategories: this.selectedCategories,
      roundIndex: r?.index ?? 0,
      topics,
      currentTopicIndex: this.phase === 'answering' && r ? r.currentTopic : null,
      myBoard: (inGame && r?.boards.get(playerId)) || Array<null>(BOARD_SIZE).fill(null),
      myReady: Boolean(this.phase === 'answering' && r?.submitted.has(playerId)),
      readyCount,
      requiredCount: readyCount + pending,
      reveal: this.phase === 'reveal' || this.phase === 'review' ? this.revealView() : null,
      roundResult: this.phase === 'roundResult' ? (r?.result ?? null) : null,
      final: this.phase === 'finalResult' ? this.final : null,
    };
  }

  /** เหมือนกันทุกคน (ไม่มีข้อมูลส่วนตัว) */
  private revealView(): RevealView {
    const r = this.round!;
    const scoring = this.deps.scoring;
    const groups = buildGroups(r.boards, r.aliases);
    const byCell = indexGroups(groups);
    const revealedBase = new Set(r.steps.slice(0, r.revealed).flatMap((s) => s.baseKeys));

    const boards: RevealBoardView[] = r.participants.map((pid) => {
      const board = r.boards.get(pid)!;
      const score = scoreBoard(pid, board, byCell, scoring);
      const shown = board.map((cell) => Boolean(cell && revealedBase.has(baseKeyOf(cell.topicIndex, cell.text))));
      const cells: RevealCell[] = board.map((cell, i) => {
        if (!cell) return { state: 'empty' };
        if (!shown[i]) return { state: 'hidden', topicIndex: cell.topicIndex };
        const cs = score.cells[i]!;
        return {
          state: 'shown',
          topicIndex: cell.topicIndex,
          text: cell.text,
          groupId: cs.groupId,
          kind: cs.kind,
          playerCount: cs.playerCount,
          points: cs.points,
        };
      });
      const bonusLines = score.bonusLines.filter((l) => LINES[l].every((i) => shown[i]));
      const previewPoints =
        score.cells.reduce((s, c, i) => s + (c && shown[i] ? c.points : 0), 0) +
        bonusLines.reduce((s, l) => s + lineBonusValue(l, scoring), 0);
      return { playerId: pid, cells, bonusLines, previewPoints };
    });

    const groupViews: AnswerGroupView[] = groups
      .filter((g) => g.baseKeys.some((k) => revealedBase.has(k)))
      .map((g) => {
        const counts = new Map<string, number>();
        for (const m of g.members) counts.set(m.text, (counts.get(m.text) ?? 0) + 1);
        const variants = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
        const { points, kind } = tierFor(g.playerIds.length, scoring);
        return {
          id: g.id,
          topicIndex: g.topicIndex,
          label: variants[0],
          variants,
          baseKeyCount: g.baseKeys.length,
          playerIds: g.playerIds,
          playerCount: g.playerIds.length,
          kind,
          pointsPerCell: points,
        };
      })
      .sort((a, b) => a.topicIndex - b.topicIndex || b.playerCount - a.playerCount || a.label.localeCompare(b.label, 'th'));

    const last = r.revealed > 0 ? r.steps[r.revealed - 1] : null;
    return {
      revealedSteps: r.revealed,
      totalSteps: r.steps.length,
      lastStep: last
        ? {
            index: r.revealed - 1,
            topicIndex: last.topicIndex,
            kind: last.kind,
            groupIds: [...new Set(last.baseKeys.map((k) => canonicalOf(k, r.aliases)))],
          }
        : null,
      boards,
      groups: groupViews,
    };
  }
}
