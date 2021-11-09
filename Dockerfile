FROM cennznet/bridge-relayer-service as builder
WORKDIR /workdir

COPY package.json yarn.lock ./
RUN yarn install
# production images
FROM node:12-alpine
ENV TZ utc
RUN yarn run api
RUN yarn run claimRelayer
