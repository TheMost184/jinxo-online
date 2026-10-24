/** สีประจำตัวผู้เล่น (index มาจาก server) — สดพอที่จะอ่านชื่อบนพื้นขาวได้ */
export const PLAYER_COLORS = ['#ff4f8b', '#7a5cff', '#14a7c9', '#ff8a1f', '#22b573', '#d6409f', '#4a6cf7', '#c9a100'];

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** สีของหัวข้อที่ 1/2/3 ในรอบ — ใช้ทั้งบนกระดานและป้ายหัวข้อ */
export const TOPIC_STYLES = [
  { solid: 'bg-jinx-soft', ring: 'ring-jinx', dot: 'bg-jinx', text: 'text-[#c2185b]', hex: '#ff4f8b', soft: '#ffd3e3' },
  { solid: 'bg-sky-soft', ring: 'ring-sky', dot: 'bg-sky', text: 'text-[#1572b6]', hex: '#7cc8ff', soft: '#d6eeff' },
  { solid: 'bg-butter-soft', ring: 'ring-butter', dot: 'bg-butter', text: 'text-[#8a6400]', hex: '#ffd75e', soft: '#fff1c4' },
] as const;

export function topicStyle(i: number) {
  return TOPIC_STYLES[i % TOPIC_STYLES.length];
}
