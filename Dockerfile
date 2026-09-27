# Copyright 2026 上海如静知华信息科技有限公司 · https://www.zhuatech.cn/ · 商业咨询微信：zhuatech / zhuatech2
FROM node:24.19.0-alpine AS verify
WORKDIR /workspace
COPY . .
RUN npm run lint && npm test && npm run build
FROM node:24.19.0-alpine
WORKDIR /app
COPY --from=verify /workspace/package.json ./
COPY --from=verify /workspace/scripts ./scripts
COPY --from=verify /workspace/dist/server ./dist/server
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 4173
CMD ["node", "scripts/dev.mjs"]
