FROM cennznet/bridge-relayer-service as builder
COPY . .
RUN yarn
