FROM node:24-slim AS base

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
