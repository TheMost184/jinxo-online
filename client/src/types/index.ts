// Type ของเกมทั้งหมดมาจากแพ็กเกจ shared ที่ server ใช้ร่วมกัน
export type * from '@jinxo/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'replaced';

export interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'error' | 'success';
  message: string;
}
