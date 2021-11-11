FROM node:17-alpine
ENV PYCURL_SSL_LIBRARY=openssl
RUN apk add --no-cache --virtual .build-deps build-base curl-dev python3-dev py3-pip git \
    && pip3 install pycurl \
    && rm -rf /var/cache/apk/*
COPY . .
RUN yarn && apk del .build-deps && rm -rf .git/ /root/.cache /usr/local/share/.cache
