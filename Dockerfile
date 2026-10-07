# Fallback: host the Node + C backend anywhere that runs containers (Render, Railway, Fly.io).
FROM node:20-bookworm
WORKDIR /app
COPY . .
RUN sh scripts/build.sh
EXPOSE 3000
CMD ["node", "server.js"]
