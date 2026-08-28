# Build context = backend/. Coolify: Base Directory "backend", Dockerfile "Dockerfile".
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["npm", "run", "start"]
