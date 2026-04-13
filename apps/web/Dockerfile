FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

FROM base AS build
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
