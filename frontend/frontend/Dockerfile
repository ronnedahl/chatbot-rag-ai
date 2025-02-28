# Frontend Dockerfile
FROM node:18-alpine as build

WORKDIR /app

# Kopiera package.json och package-lock.json först för att utnyttja Docker cache
COPY package*.json ./

# Installera dependencies
RUN npm install

# Kopiera resten av applikationen
COPY . .

# Bygg applikationen för produktion
RUN npm run build


FROM nginx:alpine


COPY --from=build /app/dist /usr/share/nginx/html

# Kopiera nginx konfiguration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponera port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]