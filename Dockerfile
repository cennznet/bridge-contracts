FROM node:16-alpine as dependencies
MAINTAINER Yang Gao <gaoyang.public@gmail.com>
ENV workdir /app
RUN apk add git --no-cache

WORKDIR ${workdir}
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM node:16-alpine as builder
MAINTAINER Yang Gao <gaoyang.public@gmail.com>
ENV workdir /app
ENV NODE_ENV production

WORKDIR ${workdir}
COPY . .
COPY --from=dependencies ${workdir}/node_modules ./node_modules

ENTRYPOINT ["yarn", "validatorRelayer"]

CMD ["ropsten"]
