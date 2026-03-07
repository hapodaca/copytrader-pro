FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate --schema=src/db/prisma/schema.prisma
RUN npx tsc

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/db/prisma/schema.prisma && node dist/index.js"]
