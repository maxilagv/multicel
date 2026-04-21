FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod-deps
RUN npm ci --omit=dev

FROM prod-deps AS runner
ENV NODE_ENV=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
