FROM node:24-alpine AS dependencies
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM dependencies AS test
RUN apk add --no-cache mongodb-tools
COPY . ./
RUN npm run prepare:assets
CMD ["sh", "-c", "export JWT_SECRET=$(node -e \"process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))\"); exec npm test"]

FROM dependencies AS runtime
ENV NODE_ENV=production
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
RUN npm run prepare:assets && chown -R node:node /app/backend/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/servicos?limit=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
