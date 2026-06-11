# Pendientes — SyncTrade Pro

_Actualizado: 2026-06-10_

## 🔴 Alta prioridad

1. **Notificaciones "offline" (mover al backend)** — hoy dependen de tener la app abierta en el navegador:
   - *Vencimiento de alertas de TradingView*: el chequeo corre en `apps/web/src/pages/Webhook.tsx` (cada 5 min, solo con esa página abierta) y las alertas viven en `localStorage`. Plan: tabla `TvAlert` en la DB + job en el servidor (BullMQ repeatable) que revise vencimientos y envíe email/Telegram aunque la app esté cerrada.
   - *Orden manual entrante (`awaiting_manual`)*: hoy solo notifica por SSE/popup del navegador. Plan: enviar también email/Telegram desde `copyRouter` al crearla, con el TTL en el mensaje.
   - Relacionado: la *expiración* de órdenes manuales también corre en el frontend (`ManualPanel.tsx`) — si la app está cerrada, las órdenes quedan en `awaiting_manual` para siempre. Agregar expiración server-side.

2. **Conexión a Tradovate** — el flujo OAuth no puede completarse tal como está:
   - El callback (`apps/api/src/routes/auth.ts`) usa `requireAuth`, pero el redirect del navegador no lleva el header Authorization.
   - Falta parámetro `state` (anti-CSRF).
   - Rehacer flujo: state firmado con el userId + callback sin JWT que valide el state.

3. **Commit + push** del trabajo acumulado (seguridad backend, RLS, índices, optimizaciones, UI, reportes).
   - ⚠️ Nota operativa descubierta el 2026-06-11: la API corre bajo PM2 con tsx **sin watch** — los cambios de backend NO se aplican hasta `pm2 restart synctrade-api`. Considerar agregar `watch` de tsx en `ecosystem.config.cjs` para desarrollo.

## 🟡 Media

4. ~~**Sección Reportes (v1.2)**~~ ✅ Hecho (2026-06-11): KPIs, curva de equity, heatmap de PnL, tablas por símbolo/cuenta, export XLSX/PDF (`GET /api/reports/summary` + `Reports.tsx`). Mejora futura: registrar PnL/winLoss en trades paper para que win rate y PnL dejen de salir en cero.

5. **Errores TypeScript pre-existentes** en `CopyGroups.tsx` (claves i18n dinámicas) y `Plans.tsx` — no rompen el dev server, pero romperían un build con typecheck.

6. **Consistencia de nombres** — "Grupos de copia" / "Copy Groups" / "Grupos de Copiado" → unificar; badges en inglés ("Processed", "Todos (all)") → pasar por i18n.

## 🟢 Ideas / pulido

7. Dashboard: gráfica de equity/PnL de los últimos 14 días con los `DailyStat` existentes.
8. Bitácora: agrupar las N filas de una misma señal en fila expandible; registrar `fillPrice` simulado en paper.
9. Página Grupos: empty-state explicando los modos de distribución.
10. Activar "Leaked password protection" en Supabase (manual: dashboard → Auth → Settings).
11. Plan Pro de Supabase o keep-alive — el free tier pausa el proyecto tras ~1 semana inactivo (pasó el 2026-06-10 y se pierden señales mientras tanto).
