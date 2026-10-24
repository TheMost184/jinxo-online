import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  BOARD_SIZE,
  CUSTOM_CATEGORY_ID,
  cleanAnswer,
  normalizeAnswer,
  type Board,
  type CategoryInfo,
  type FinalResultView,
  type Notice,
  type Phase,
  type Placement,
  type PlayerRoundScore,
  type PlayerView,
  type RevealView,
  type RoomView,
  type RoundResultView,
  type Topic,
} from '@jinxo/shared';
import { publicGameConfig, type GameConfig, type ScoringConfig } from '../config.js';
import { RevealEngine } from '../game/reveal.js';
import { rank } from '../game/scoring.js';
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
  /** Popularity Score — แยกจากคะแนนแข่งขันเสมอ */
  totalLikes: number;
}

interface RoundState {
  index: number;
  /** โหมดปกติ: ครบตั้งแต่เริ่มรอบ / โหมดคิดโจทย์เอง: เพิ่มทีละข้อเมื่อมีคนตั้งโจทย์ */
  topics: Topic[];
  currentTopic: number;
  /** ผู้เล่นที่อยู่ในรอบนี้ตั้งแต่เริ่ม */
  participants: string[];
  boards: Map<string, Board>;
  submitted: Set<string>;
  skipped: Set<string>;
  reveal: RevealEngine | null;
  result: RoundResultView | null;
}

interface AuthoringState {
  authorId: string;
  topicIndex: number;
}

export interface RoomDeps {
  config: GameConfig;
  scoring: ScoringConfig;
  questions: QuestionBank;
}

const PLAYER_COLORS = 16;

export const CUSTOM_CATEGORY: CategoryInfo = {
  id: CUSTOM_CATEGORY_ID,
  label: 'คิดโจทย์เอง',
  emoji: '✍️',
  count: 0,
  custom: true,
};

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Game state machine ของห้องหนึ่งห้อง — ไม่รู้จัก socket
 * ทุก action ตรวจ ผู้เล่น → สิทธิ์ → phase → ข้อมูล และโยน GameError ถ้าไม่ผ่าน
 * ชั้น socket เป็นคน broadcast state หลัง action สำเร็จ
 */
export class Room {
  phase: Phase = 'lobby';
  players: PlayerState[] = [];
  hostId = '';
  selectedCategories: string[];
  private kickedIds = new Set<string>();
  private usedQuestionIds = new Set<number>();
  private gameTopics: Topic[] = [];
  private round: RoundState | null = null;
  private final: FinalResultView | null = null;
  private notices: Notice[] = [];
  private authoring: AuthoringState | null = null;
  /** คนที่ได้ตั้งโจทย์ไปแล้วในรอบการสุ่มนี้ (ครบทุกคนแล้วเริ่มใหม่) */
  private authorCycle = new Set<string>();
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

  get customMode(): boolean {
    return this.selectedCategories.length === 1 && this.selectedCategories[0] === CUSTOM_CATEGORY_ID;
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

  private get engine(): RevealEngine {
    const e = this.round?.reveal;
    if (!e || this.phase !== 'reveal') {
      throw new GameError('WRONG_PHASE', 'ตอนนี้ไม่ได้อยู่ในช่วงเปิดคำตอบ');
    }
    return e;
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

  private resetScores() {
    for (const p of this.players) {
      p.totalScore = 0;
      p.roundTotals = [];
      p.jinxoTotal = 0;
      p.totalLikes = 0;
    }
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
      totalLikes: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    else this.notice('info', `${name} เข้าห้องแล้ว`);
    return player;
  }

  /** ตรวจ token ตอน reconnect */
  authenticate(playerId: string, token: string): PlayerState {
    if (this.kickedIds.has(playerId)) {
      throw new GameError('KICKED', 'คุณถูกนำออกจากห้องโดย Host ถ้าจะกลับเข้าห้อง ให้เข้าใหม่ด้วยรหัสห้อง');
    }
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
    if (this.phase === 'authoring' && this.authoring?.authorId === playerId) this.reassignAuthor('left');
  }

  /**
   * Host เตะผู้เล่นออก (เฉพาะ Lobby — ไม่กระทบคะแนนระหว่างเกม)
   * token เดิมใช้ไม่ได้อีก ถ้าจะกลับต้อง Join ใหม่ได้ session ใหม่
   * คืน socket id ของคนที่ถูกเตะ ให้ชั้น socket แจ้งเตือนและตัดออกจากห้อง
   */
  kick(hostId: string, targetId: string): { socketId: string | null; name: string } {
    this.requireHost(hostId);
    this.requirePhase('lobby');
    if (targetId === hostId) throw new GameError('INVALID_PAYLOAD', 'เตะตัวเองไม่ได้นะ');
    const target = this.getPlayer(targetId);
    if (!target) throw new GameError('INVALID_PAYLOAD', 'ไม่พบผู้เล่นคนนี้ในห้องแล้ว');
    this.players = this.players.filter((p) => p.id !== targetId);
    this.kickedIds.add(targetId);
    this.notice('info', `${target.name} ถูกนำออกจากห้อง`);
    if (this.players.every((x) => !x.connected)) this.emptySince = this.now();
    return { socketId: target.socketId, name: target.name };
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

  get categoryList(): CategoryInfo[] {
    return [...this.deps.questions.categories, CUSTOM_CATEGORY];
  }

  setCategories(playerId: string, categories: string[]) {
    this.requireHost(playerId);
    this.requirePhase('lobby');
    const unique = [...new Set(categories)];
    if (unique.length === 0) throw new GameError('INVALID_PAYLOAD', 'เลือกอย่างน้อย 1 หมวดหมู่');
    if (unique.includes(CUSTOM_CATEGORY_ID) && unique.length > 1) {
      throw new GameError('INVALID_PAYLOAD', '"คิดโจทย์เอง" ใช้ร่วมกับหมวดอื่นไม่ได้');
    }
    for (const c of unique) {
      if (c !== CUSTOM_CATEGORY_ID && !this.deps.questions.hasCategory(c)) {
        throw new GameError('INVALID_PAYLOAD', `ไม่รู้จักหมวด "${c}"`);
      }
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
    if (this.customMode) {
      this.gameTopics = [];
    } else {
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
    }
    this.authorCycle.clear();
    this.resetScores();
    this.final = null;
    this.startRound(0);
  }

  private startRound(index: number) {
    const tpr = this.cfg.topicsPerRound;
    const participants = this.activePlayers.map((p) => p.id);
    this.round = {
      index,
      topics: this.customMode ? [] : this.gameTopics.slice(index * tpr, (index + 1) * tpr),
      currentTopic: 0,
      participants,
      boards: new Map(participants.map((id) => [id, Array<null>(BOARD_SIZE).fill(null)])),
      submitted: new Set(),
      skipped: new Set(),
      reveal: null,
      result: null,
    };
    this.beginTopic();
  }

  /** เริ่มหัวข้อ currentTopic — โหมดคิดโจทย์เองต้องมีคนตั้งโจทย์ก่อน */
  private beginTopic() {
    const r = this.round!;
    r.submitted.clear();
    r.skipped.clear();
    if (this.customMode) {
      this.phase = 'authoring';
      this.authoring = { authorId: this.pickAuthor(null), topicIndex: r.currentTopic };
    } else {
      this.phase = 'answering';
      this.authoring = null;
      this.applyAutoSkips();
    }
  }

  // ── โหมดคิดโจทย์เอง ──

  /** สุ่มคนตั้งโจทย์จากคนที่ออนไลน์ โดยไม่ซ้ำคนที่ตั้งไปแล้วจนกว่าทุกคนจะได้ตั้ง */
  private pickAuthor(exclude: string | null): string {
    const r = this.round!;
    const active = r.participants.filter((id) => {
      const p = this.getPlayer(id);
      return p && !p.left;
    });
    const online = active.filter((id) => this.getPlayer(id)!.connected);
    // ไม่มีใครออนไลน์เลย → ไม่สลับไปมาระหว่างคนที่หลุด รอให้มีคนกลับมาก่อน
    if (online.length === 0 && exclude) return exclude;
    let candidates = online.length > 0 ? online : active;
    if (exclude && candidates.length > 1) candidates = candidates.filter((id) => id !== exclude);
    let pool = candidates.filter((id) => !this.authorCycle.has(id));
    if (pool.length === 0) {
      // ทุกคนที่เลือกได้เคยตั้งโจทย์แล้ว → เริ่มรอบการสุ่มใหม่
      for (const id of candidates) this.authorCycle.delete(id);
      pool = candidates;
    }
    return pool[randomInt(pool.length)] ?? '';
  }

  private reassignAuthor(reason: 'left' | 'timeout' | 'host'): boolean {
    if (this.phase !== 'authoring' || !this.authoring) return false;
    const prev = this.authoring.authorId;
    const next = this.pickAuthor(prev);
    if (next === prev) return false;
    this.authoring.authorId = next;
    const prevName = this.getPlayer(prev)?.name ?? 'คนตั้งโจทย์';
    const nextName = this.getPlayer(next)?.name ?? '?';
    const why = reason === 'host' ? 'Host สุ่มใหม่' : reason === 'left' ? `${prevName} ออกจากห้อง` : `${prevName} หลุดนานเกินไป`;
    this.notice('info', `${why} — ตอนนี้ ${nextName} เป็นคนคิดโจทย์`);
    return true;
  }

  submitQuestion(playerId: string, rawQuestion: string) {
    this.mustGetPlayer(playerId);
    this.requirePhase('authoring');
    const a = this.authoring!;
    if (a.authorId !== playerId) throw new GameError('NOT_AUTHOR', 'ตอนนี้ไม่ใช่ตาคุณคิดโจทย์');
    const question = cleanAnswer(rawQuestion);
    if ([...question].length < 2) throw new GameError('INVALID_PAYLOAD', 'พิมพ์โจทย์ก่อนนะ');
    if ([...question].length > this.cfg.maxQuestionLength) {
      throw new GameError('INVALID_PAYLOAD', `โจทย์ยาวได้ไม่เกิน ${this.cfg.maxQuestionLength} ตัวอักษร`);
    }
    const r = this.round!;
    r.topics[a.topicIndex] = {
      id: -(r.index * this.cfg.topicsPerRound + a.topicIndex + 1),
      category: CUSTOM_CATEGORY_ID,
      question,
      authorId: playerId,
    };
    this.authorCycle.add(playerId);
    this.authoring = null;
    this.phase = 'answering';
    this.applyAutoSkips();
  }

  rerollAuthor(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('authoring');
    if (!this.reassignAuthor('host')) throw new GameError('INVALID_PAYLOAD', 'ไม่มีคนอื่นให้สุ่มแทน');
  }

  // ── ตอบคำถาม ──

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
    if (r.currentTopic < this.cfg.topicsPerRound - 1) {
      r.currentTopic += 1;
      this.beginTopic();
      if (this.phase === 'answering') this.maybeAdvanceTopic();
    } else {
      this.startReveal();
    }
    return true;
  }

  // ───────────────────────── reveal ─────────────────────────

  private startReveal() {
    const r = this.round!;
    // ลำดับเปิดสุ่มครั้งเดียวต่อรอบ เก็บไว้ใน state ทุกคนเห็นเหมือนกัน
    const order = shuffle(r.participants);
    r.reveal = new RevealEngine(r.boards, order, this.deps.scoring);
    this.phase = 'reveal';
  }

  revealNextAnswer(playerId: string) {
    this.requireHost(playerId);
    this.engine.revealNextAnswer();
  }

  /** ไปคนถัดไป — คนสุดท้ายแล้ว = สรุปรอบ */
  nextPlayer(playerId: string) {
    this.requireHost(playerId);
    if (this.engine.nextPlayer() === 'done') this.finalizeRound();
  }

  /** ทุกคนเห็นคำขอผ่านการ์ดคิวใน state อยู่แล้ว จึงไม่ต้องส่ง notice ซ้ำ */
  requestMatch(playerId: string, targetAnswerId: string, cellIndex: number) {
    this.mustGetPlayer(playerId);
    this.engine.requestMatch(playerId, targetAnswerId, cellIndex);
  }

  decideMatch(playerId: string, requestId: string, approve: boolean) {
    this.requireHost(playerId);
    this.engine.decide(requestId, approve);
  }

  undoMatch(playerId: string, requestId: string) {
    this.requireHost(playerId);
    this.engine.undo(requestId);
  }

  setLike(playerId: string, answerId: string, like: boolean) {
    this.mustGetPlayer(playerId);
    this.engine.setLike(playerId, answerId, like);
  }

  private finalizeRound() {
    const r = this.round!;
    const engine = r.reveal!;
    engine.revealEverything();
    const scores = engine.fullScores();
    for (const id of r.participants) {
      const p = this.getPlayer(id);
      const s = scores.get(id);
      if (!p || !s) continue;
      const roundTotal = s.basePoints + s.bonusPoints;
      p.roundTotals[r.index] = roundTotal;
      p.totalScore += roundTotal;
      p.jinxoTotal += s.jinxoCount;
      p.totalLikes += engine.likesReceived(id);
    }
    // อันดับใช้เฉพาะ Game Score — Like ไม่เกี่ยว
    const ranked = rank(
      r.participants.map((id) => this.getPlayer(id)).filter((p): p is PlayerState => Boolean(p)),
      (p) => p.totalScore,
    );
    r.result = {
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
          likes: engine.likesReceived(p.id),
          totalLikes: p.totalLikes,
        };
      }),
      boards: engine.order.map((pid) => engine.boardView(pid)),
      topMatched: engine.topMatched(),
      topLiked: engine.topLiked(),
    };
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
    const maxLikes = Math.max(0, ...everyone.map((p) => p.totalLikes));
    this.final = {
      winnerIds: ranked.filter((x) => x.rank === 1).map((x) => x.item.id),
      popularIds: maxLikes > 0 ? everyone.filter((p) => p.totalLikes === maxLikes).map((p) => p.id) : [],
      standings: ranked.map(({ item: p, rank: rk }) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        total: p.totalScore,
        rank: rk,
        roundTotals: Array.from({ length: this.cfg.rounds }, (_, i) => p.roundTotals[i] ?? 0),
        jinxoCount: p.jinxoTotal,
        totalLikes: p.totalLikes,
      })),
    };
    this.phase = 'finalResult';
  }

  playAgain(playerId: string) {
    this.requireHost(playerId);
    this.requirePhase('finalResult');
    this.players = this.players.filter((p) => !p.left);
    this.resetScores();
    this.round = null;
    this.final = null;
    this.gameTopics = [];
    this.authoring = null;
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

    if (this.phase === 'authoring' && this.authoring) {
      const author = this.getPlayer(this.authoring.authorId);
      const timedOut =
        !author ||
        author.left ||
        (!author.connected &&
          author.disconnectedAt !== null &&
          now - author.disconnectedAt >= this.cfg.disconnectGraceMs);
      if (timedOut) changed = this.reassignAuthor(author?.left ? 'left' : 'timeout') || changed;
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

  /**
   * ส่วนของ state ที่ทุกคนเห็นเหมือนกัน — คำนวณครั้งเดียวต่อการ broadcast
   * (สำคัญตอนห้อง 15 คน: ไม่ต้องคิดคะแนน/กระดานซ้ำ 15 รอบ)
   */
  sharedView(): Omit<RoomView, 'you' | 'myBoard' | 'myReady' | 'myLikes'> {
    const r = this.round;
    const inGame = this.phase !== 'lobby' && this.phase !== 'finalResult';
    const players: PlayerView[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.id === this.hostId,
      connected: p.connected,
      left: p.left,
      ready: Boolean(this.phase === 'answering' && r?.submitted.has(p.id)),
      skipped: Boolean(this.phase === 'answering' && r?.skipped.has(p.id)),
      totalScore: p.totalScore,
      totalLikes: p.totalLikes,
    }));

    let topics: Topic[] = [];
    if (r && this.phase === 'answering') topics = r.topics.slice(0, r.currentTopic + 1);
    else if (r && inGame) topics = r.topics.filter(Boolean);

    const pending = this.phase === 'answering' ? this.pendingRequired().length : 0;
    const readyCount = this.phase === 'answering' && r ? r.submitted.size : 0;
    const reveal: RevealView | null = this.phase === 'reveal' && r?.reveal ? r.reveal.publicView() : null;

    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players,
      config: { game: publicGameConfig(this.cfg), scoring: this.deps.scoring },
      categories: this.categoryList,
      selectedCategories: this.selectedCategories,
      customMode: this.customMode,
      roundIndex: r?.index ?? 0,
      topics,
      currentTopicIndex: (this.phase === 'answering' || this.phase === 'authoring') && r ? r.currentTopic : null,
      authoring: this.phase === 'authoring' ? this.authoring : null,
      readyCount,
      requiredCount: readyCount + pending,
      reveal,
      roundResult: this.phase === 'roundResult' ? (r?.result ?? null) : null,
      final: this.phase === 'finalResult' ? this.final : null,
    };
  }

  /** state ในมุมมองของผู้เล่นคนหนึ่ง — เติมเฉพาะข้อมูลของเขาเองลงบนส่วนที่แชร์ */
  viewFor(playerId: string, shared = this.sharedView()): RoomView {
    const me = this.getPlayer(playerId)!;
    const r = this.round;
    const inGame = this.phase !== 'lobby' && this.phase !== 'finalResult';
    return {
      ...shared,
      you: { id: me.id, name: me.name, isHost: me.id === this.hostId },
      myBoard: (inGame && r?.boards.get(playerId)) || Array<null>(BOARD_SIZE).fill(null),
      myReady: Boolean(this.phase === 'answering' && r?.submitted.has(playerId)),
      myLikes: this.phase === 'reveal' && r?.reveal ? r.reveal.likedBy(playerId) : [],
    };
  }
}
