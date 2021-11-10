FROM node:17-alpine
RUN apk add --no-cache git
COPY . .
RUN yarn
