import type { SessionInfo } from '@jinxo/shared';

/**
 * เก็บ session ต่อแท็บ (sessionStorage) — รีเฟรชแล้วกลับเข้าห้องเดิมได้
 * และเปิดหลายแท็บเพื่อทดสอบหลายผู้เล่นได้โดยไม่ชนกัน
 */
const KEY = 'jinxo.session';
const NAME_KEY = 'jinxo.lastName';

export function loadSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SessionInfo>;
    return s.roomCode && s.playerId && s.token ? (s as SessionInfo) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: SessionInfo) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์ — เล่นได้แต่ reconnect หลังรีเฟรชไม่ได้ */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** ชื่อล่าสุดที่ใช้ — จำข้ามแท็บเพื่อไม่ต้องพิมพ์ใหม่ */
export function loadLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
