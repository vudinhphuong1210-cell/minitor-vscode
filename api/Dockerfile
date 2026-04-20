FROM node:20-alpine

WORKDIR /app

# Cài dependencies trước (tận dụng layer cache)
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
