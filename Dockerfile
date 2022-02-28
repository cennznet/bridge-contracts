FROM node:16.5.0-alpine
ENV PYCURL_SSL_LIBRARY=openssl
RUN apk add --no-cache --virtual .build-deps build-base python3-dev py3-pip git \
    # keep libcurl in the image
    && apk add --no-cache curl-dev \
    && pip3 install pycurl \
    && rm -rf /var/cache/apk/*
COPY . .
RUN yarn && apk del .build-deps && rm -rf .git/ /root/.cache /usr/local/share/.cache
