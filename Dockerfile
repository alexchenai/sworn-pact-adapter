FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production 2>/dev/null || npm install --only=production
COPY . .
RUN npm install -D typescript @types/node @types/express ts-node
RUN npx tsc --version
RUN npx tsc
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/relay.js"]
