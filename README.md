# ⚡ CopyTrader Pro

Sistema de Copy Trading para Futuros — Apex Trader Funding

## Stack

- **Backend:** Node.js 20 + TypeScript + Express.js
- **DB:** PostgreSQL 15 + Prisma ORM
- **Queue:** Bull + Redis
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS 3
- **Auth:** JWT (access 15min + refresh 7d)
- **Deploy:** Docker Compose
- **Testing:** Vitest

## Estructura

```
copytrader-pro/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # React frontend
├── packages/shared/  # Types compartidos
├── docker-compose.yml
└── .env.example
```

## Inicio rápido

```bash
cp .env.example .env
docker-compose up
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:3001
- Webhook:  POST http://localhost:3001/api/webhook/:webhookToken

## Documentación

Ver `docs/copytrader_pro_v2.docx` para arquitectura completa, especificaciones de conexión y prompt maestro.

## Versiones

| Versión | Contenido |
|---|---|
| v1.0 MVP | Webhook + Copy Router + Dashboard + OAuth Tradovate |
| v1.2 | Bitácora y Reportes |
| v1.3 | Notificaciones (email, Telegram) |
| v1.4 | Onboarding checklist |
