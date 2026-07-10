# ビルドステージ：devDependencies込みでTypeScriptをコンパイル
FROM apify/actor-node:22 AS builder
COPY package*.json ./
RUN npm install --include=dev --audit=false
COPY . ./
RUN npx tsc

# 実行ステージ：本番依存のみの軽量イメージ
FROM apify/actor-node:22
COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional --audit=false
COPY --from=builder /usr/src/app/dist ./dist
COPY .actor ./.actor

CMD ["node", "dist/actor-main.js"]
