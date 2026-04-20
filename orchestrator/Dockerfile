FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# NOTE: wallets.json is injected via WALLETS_JSON_B64 env var at runtime.
# Do NOT COPY it into the image.

# Default command — override with `start:audit` for the audit cron service.
CMD ["node", "dist/worker.js"]
