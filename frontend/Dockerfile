FROM node:24-alpine AS dependencies
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci && npm cache clean --force

FROM dependencies AS test
COPY . .
CMD ["npm", "test"]

FROM test AS build
ENV VITE_API_URL=""
RUN npm run build && npm run test:assets

FROM nginx:stable-alpine AS runtime
COPY deploy/nginx.docker.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
