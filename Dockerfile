# Build หน้าเว็บ แล้วรัน server ตัวเดียวที่เสิร์ฟทั้งหน้าเว็บและ Socket.IO
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "start"]
