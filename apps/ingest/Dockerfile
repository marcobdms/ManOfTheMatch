# Build context = repo root.  Coolify: set "Base Directory" to /  and this Dockerfile path.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/ingest ./apps/ingest

RUN npm ci --omit=dev

CMD ["npm", "run", "ingest"]
