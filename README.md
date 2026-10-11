# Attendance Manager

A full-stack academic attendance system matching the supplied project abstract.

## Stack
- React + Vite frontend
- Node.js + Express REST API
- Java 17 Spring Boot processing service (attendance calculations)
- PostgreSQL database (Render-friendly)

## Features
- Demo login with administrator/faculty roles
- Dashboard summaries and low-attendance warnings
- Student and subject management
- Mark present/absent attendance by subject and date
- Attendance percentages calculated by Java service
- Reports and CSV export
- PostgreSQL persistence; automatic demo seed data

## Architecture
React → Node/Express API → PostgreSQL  
Node/Express → Java/Spring Boot attendance calculation service

## Run locally
Prerequisites: Node.js 20+, Java 17+, Maven, PostgreSQL.

1. Create a PostgreSQL database named `attendance_manager`.
2. Start Java service:
   ```bash
   cd java-service
   mvn spring-boot:run
   ```
3. Start API (new terminal):
   ```bash
   cd server
   cp .env.example .env
   npm install
   npm run dev
   ```
   Update `.env` with your PostgreSQL connection string.
4. Start frontend (new terminal):
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Open the Vite URL shown in terminal.

Demo login: `admin@college.edu` / `admin123`  
Faculty demo: `faculty@college.edu` / `faculty123`

> Demo authentication is intentionally simple for a college demonstration. Before real institutional use, add password hashing, secure session management, audit logging, and institutional access controls.

## Deploy
### One-click blueprint (Render)
The repository includes `render.yaml` and a Java Dockerfile. After pushing the public GitHub repo, open Render, choose **New → Blueprint**, connect the repository, review the proposed PostgreSQL database and three services, and apply. If the free plan or blueprint service types change in Render, create the services manually using the settings below. After deploy, confirm `https://YOUR-API.onrender.com/api/health` and `https://YOUR-JAVA.onrender.com/api/health` return JSON.

### Render (manual setup, recommended for the entire stack)
1. Push this repository to a **public GitHub repository**.
2. In Render, create a PostgreSQL database; copy its **Internal Database URL**.
3. Create a Web Service for `java-service`:
   - Root directory: `java-service`
   - Build command: `mvn clean package`
   - Start command: `java -jar target/attendance-java-service-1.0.0.jar`
4. Create a Web Service for `server`:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `DATABASE_URL` = Render PostgreSQL URL; `JAVA_SERVICE_URL` = Java service URL; `NODE_ENV` = `production`; `CLIENT_ORIGIN` = frontend URL
5. Create a Static Site for `client`:
   - Root directory: `client`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Environment variable `VITE_API_URL` = deployed Node API URL (include `https://`, no trailing slash)
6. Set the frontend URL as `CLIENT_ORIGIN` on the Node service and redeploy it.

### Vercel note
Vercel is best used for the React frontend. Deploy `client` as a Vercel project with root directory `client` and `VITE_API_URL` pointing to the Node API hosted on Render. Host the persistent Node API, Java service, and PostgreSQL on Render (or another always-on/server-capable host).

## GitHub public repository
This workspace cannot publish to your GitHub account without your authenticated GitHub access and explicit repository creation. Create a **public** repo on GitHub, then run:
```bash
git init
git add .
git commit -m "Build Attendance Manager full-stack project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/attendance-manager.git
git push -u origin main
```
Do not commit `.env`, passwords, or database credentials.
