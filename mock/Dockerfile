FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY *.ts ./
RUN npx tsc

EXPOSE 4010

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4010/health || exit 1

CMD ["node", "dist/hcm-server.js"]
