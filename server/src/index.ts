import { createJinxoServer } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const { httpServer, questions, hasClient } = createJinxoServer();
httpServer.listen(port, () => {
  console.log(`🎲 JinxO server พร้อมที่ http://localhost:${port}`);
  console.log(`   คำถาม ${questions.questions.length} ข้อ ใน ${questions.categories.length} หมวด`);
  console.log(hasClient ? '   เสิร์ฟหน้าเว็บจาก client/dist' : '   (dev) เปิดหน้าเว็บผ่าน Vite ที่ http://localhost:5173');
});
