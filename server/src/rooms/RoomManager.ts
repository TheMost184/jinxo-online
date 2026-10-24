import { randomInt } from 'node:crypto';
import { Room, type RoomDeps } from './Room.js';
import { GameError } from '../utils/errors.js';

/** ตัดตัวที่สับสนง่ายออก (0/O, 1/I/L) */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deps: RoomDeps,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(): Room {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.deps, this.now);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  mustGet(code: string): Room {
    const room = this.get(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND', `ไม่พบห้อง "${code.toUpperCase()}" ตรวจรหัสห้องอีกครั้งนะ`);
    return room;
  }

  delete(code: string) {
    this.rooms.delete(code);
  }

  /** เริ่มนาฬิกาจัดการกติกาที่ขึ้นกับเวลา (หลุดนาน, โอน host, ล้างห้องร้าง) */
  startTicking(onChanged: (room: Room) => void, intervalMs = 1000) {
    this.stopTicking();
    this.timer = setInterval(() => {
      for (const room of this.rooms.values()) {
        if (room.isAbandoned()) {
          this.rooms.delete(room.code);
          continue;
        }
        if (room.tick()) onChanged(room);
      }
    }, intervalMs);
    this.timer.unref();
  }

  stopTicking() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
