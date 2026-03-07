 ══ INICIO DEL PROMPT — COPIAR TODO DESDE AQUÍ ══

# Construye CopyTrader Pro — MVP v1.0 (Core)

Construye el MVP core de CopyTrader Pro — solo lo esencial para operar.
Crea todos los archivos necesarios. No pidas confirmación entre pasos.
Alcance MVP: TradingView webhook → recibir señal → copiar a cuentas Tradovate → ver en dashboard.
NO implementar en este MVP: reportes/bitácora, notificaciones, health panel, audit log, onboarding checklist.
Esos módulos van en v1.2-v1.4. Dejar estructura preparada pero sin implementar.

---

## STACK TECNOLÓGICO

- Backend:  Node.js 20 + TypeScript + Express.js
- DB:       PostgreSQL 15 + Prisma ORM
- Queue:    Bull + Redis
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS 3
- Auth:     JWT (access 15min + refresh 7d)
- Deploy:   Docker Compose (postgres + redis + api + web)
- Testing:  Vitest

## ESTRUCTURA DEL MONOREPO

```
copytrader-pro/
├── apps/
│   ├── api/              # Express backend
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── webhook.ts        # POST /api/webhook
│   │       │   ├── manual.ts         # POST /api/manual/signal
│   │       │   ├── accounts.ts       # CRUD cuentas
│   │       │   ├── groups.ts         # CRUD copy groups
│   │       │   ├── rules.ts          # Reglas por cuenta
│   │       │   ├── signals.ts        # Historial señales
│   │       │   └── orders.ts         # Historial órdenes
│   │       ├── services/
│   │       │   ├── signalValidator.ts
│   │       │   ├── scheduleFilter.ts
│   │       │   ├── riskEngine.ts
│   │       │   ├── copyRouter.ts
│   │       │   └── orderQueue.ts
│   │       ├── integrations/
│   │       │   ├── broker/                    # Adaptadores de destino (brokers)
│   │       │   │   ├── BrokerAdapter.ts       # Interface base
│   │       │   │   ├── tradovate/             # Adaptador Tradovate (MVP)
│   │       │   │   │   ├── auth.ts
│   │       │   │   │   ├── orders.ts
│   │       │   │   │   ├── account.ts
│   │       │   │   │   ├── contracts.ts
│   │       │   │   │   └── websocket.ts
│   │       │   │   └── rithmic/               # (futuro v2.1)
│   │       │   └── source/                    # Adaptadores de origen (señales)
│   │       │       ├── SignalSource.ts         # Interface base
│   │       │       ├── tradingview.ts          # Webhook TV (MVP)
│   │       │       └── ninjatrader.ts          # (futuro v1.3)
│   │       └── db/prisma/schema.prisma
│   └── web/              # React frontend
│       └── src/pages/
│           ├── Dashboard.tsx
│           ├── Accounts.tsx
│           ├── CopyGroups.tsx
│           ├── Rules.tsx
│           ├── ManualPanel.tsx
│           ├── Signals.tsx
│           ├── Orders.tsx
│           └── Reports.tsx
├── packages/shared/src/types.ts
├── docker-compose.yml
└── .env.example
```

## VARIABLES DE ENTORNO (.env.example)

```
DATABASE_URL=postgresql://copytrader:copytrader123@postgres:5432/copytrader
REDIS_URL=redis://redis:6379
JWT_SECRET=cambiar_en_produccion
WEBHOOK_SECRET=tu_secreto_webhook_aqui
TRADOVATE_APP_ID=tu_app_id
TRADOVATE_APP_VERSION=1.0.0
TRADOVATE_CLIENT_ID=tu_oauth_client_id       # Registrar app con Tradovate 1 sola vez (gratis)
TRADOVATE_CLIENT_SECRET=tu_oauth_client_secret
TRADOVATE_REDIRECT_URI=https://tu-app.com/api/auth/tradovate/callback
# Las siguientes variables NO son necesarias para el MVP:
# TELEGRAM_BOT_TOKEN    → activar en v1.3
# RESEND_API_KEY        → activar en v1.3
# TWILIO_ACCOUNT_SID    → activar en v1.3
PORT=3001
NODE_ENV=development
```

## ARQUITECTURA EXTENSIBLE — PATRÓN DE ADAPTADORES

El sistema está diseñado para agregar nuevas fuentes de señal y nuevos brokers
sin modificar el core. Usar el patrón Adapter con interfaces TypeScript.

INTERFACE BrokerAdapter (apps/api/src/integrations/broker/BrokerAdapter.ts):
```typescript
interface BrokerAdapter {
  readonly brokerName: string          // 'tradovate' | 'rithmic' | 'interactivebrokers'
  connect(credentials: BrokerCredentials): Promise<void>
  placeOrder(account: Account, signal: Signal, qty: number): Promise<Order>
  cancelOrder(account: Account, orderId: string): Promise<void>
  getBalance(account: Account): Promise<number>
  getPositions(account: Account): Promise<Position[]>
  getInitialMargin(symbol: string): Promise<number>
  subscribeToUpdates(account: Account, cb: (event: BrokerEvent) => void): void
}
```

INTERFACE SignalSource (apps/api/src/integrations/source/SignalSource.ts):
```typescript
interface SignalSource {
  readonly sourceName: string          // 'tradingview' | 'ninjatrader' | 'ctrader'
  parseSignal(payload: unknown): Signal
  validateAuth(req: Request): boolean
}
```

BROKER REGISTRY — BrokerRegistry.ts:
Map que registra los adaptadores disponibles por nombre.
El CopyRouter consulta el registro para saber qué adaptador usar por cuenta.
Account tiene un campo brokerType: string que indica qué adaptador usar.
Agregar nuevo broker = crear clase que implemente BrokerAdapter + registrarla.
Agregar nueva fuente = crear clase que implemente SignalSource + registrarla.

MVP implementa: TradovateAdapter (broker) + TradingViewSource (signal source).
El resto del sistema (risk engine, copy router, queue) nunca sabe qué broker es.

## ARQUITECTURA MULTI-USUARIO

La app es multi-tenant. Cada usuario tiene su propio espacio aislado:
- Account.userId = User.id — cuentas nunca se comparten entre usuarios
- CopyGroups y TradingRules aislados implicitamente via Account.userId
- Cada usuario tiene webhookToken unico → URL: POST /api/webhook/:webhookToken
- Role admin: ve todos los usuarios, todas las cuentas, metricas globales
- Role user: ve SOLO sus propias cuentas, grupos y seniales
- Admin puede crear ConfigTemplate (plantillas de TradingRules) para proponer a usuarios
- Monetizacion: modelo Subscription por usuario (plan monthly | performance)

## PASO 1 — PRISMA SCHEMA COMPLETO

Crear apps/api/src/db/prisma/schema.prisma:

```prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Account {
  id            String    @id @default(cuid())
  name          String
  tradovateId   String    @unique
  tradovateSpec String
  environment   String    @default("demo")
  accessToken   String?
  refreshToken  String?
  tokenExpiry   DateTime?
  isActive      Boolean   @default(true)
  balance       Float     @default(0)
  createdAt     DateTime  @default(now())
  tradingRules  TradingRules?
  ordersPlaced  Order[]
  dailyStats    DailyStat[]
  masterGroups  CopyGroup[]     @relation("MasterAccount")
  followerLinks GroupFollower[]
}
model CopyGroup {
  id               String   @id @default(cuid())
  name             String
  masterAccountId  String
  master           Account  @relation("MasterAccount", fields:[masterAccountId], references:[id])
  isActive         Boolean  @default(true)
  distributionMode String   @default("all")
  batchSize        Int      @default(4)
  followers        GroupFollower[]
  createdAt        DateTime @default(now())
}
model GroupFollower {
  id                String    @id @default(cuid())
  groupId           String
  group             CopyGroup @relation(fields:[groupId], references:[id])
  followerAccountId String
  follower          Account   @relation(fields:[followerAccountId], references:[id])
  riskPct           Float     @default(1.0)
  isActive          Boolean   @default(true)
  rotateOrder       Int       @default(0)
  lastOrderAt       DateTime?
}
model TradingRules {
  id                     String   @id @default(cuid())
  accountId              String   @unique
  account                Account  @relation(fields:[accountId], references:[id])
  accountStage           String   @default("challenge")
  riskMode               String   @default("fixed_usd")
  fixedRiskAmount        Float    @default(650)
  maxEntriesPerDay       Int      @default(3)
  allowedDays            String[] @default(["MON","TUE","WED","THU","FRI"])
  startTime              String   @default("08:00")
  endTime                String   @default("15:30")
  maxDrawdownPct         Float    @default(5.0)
  reduceRiskAfterLosses  Boolean  @default(true)
  reduceRiskFactor       Float    @default(0.5)
  maxConsecutiveLosses   Int      @default(3)
  pauseAfterMaxLosses    Boolean  @default(true)
}
model Signal {
  id           String   @id @default(cuid())
  source       String   @default("tradingview")
  symbol       String
  action       String
  price        Float
  contracts    Int?
  strategy     String?
  timeframe    String?
  rawPayload   Json
  status       String   @default("received")
  rejectReason String?
  createdAt    DateTime @default(now())
  orders       Order[]
}
model Order {
  id               String   @id @default(cuid())
  signalId         String
  signal           Signal   @relation(fields:[signalId], references:[id])
  accountId        String
  account          Account  @relation(fields:[accountId], references:[id])
  symbol           String
  side             String
  qty              Int
  orderType        String   @default("Market")
  status           String   @default("pending")
  tradovateOrderId String?
  fillPrice        Float?
  skipReason       String?
  errorMsg         String?
  retryCount       Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
model DailyStat {
  id                String   @id @default(cuid())
  accountId         String
  account           Account  @relation(fields:[accountId], references:[id])
  date              DateTime
  entriesCount      Int      @default(0)
  pnl               Float    @default(0)
  winCount          Int      @default(0)
  lossCount         Int      @default(0)
  drawdownPct       Float    @default(0)
  consecutiveLosses Int      @default(0)
  isPaused          Boolean  @default(false)
  @@unique([accountId, date])
}
model User {
  id             String    @id @default(cuid())
  email          String    @unique
  passwordHash   String
  name           String?
  role           String    @default("user")   // 'admin' | 'user'
  webhookToken   String    @unique @default(cuid())
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  accounts       Account[]
  subscription   Subscription?
}
model Subscription {
  id             String    @id @default(cuid())
  userId         String    @unique
  user           User      @relation(fields:[userId], references:[id])
  plan           String    @default("monthly")
  status         String    @default("active")
  monthlyFeeUsd  Float     @default(0)
  performancePct Float     @default(0)
  startDate      DateTime  @default(now())
  nextBillingAt  DateTime?
}
```

## PASO 2 — WEBHOOK ENDPOINT (multi-usuario + seguridad completa)

Implementar apps/api/src/routes/webhook.ts:

URL del webhook es UNICA por usuario: POST /api/webhook/:webhookToken
El :webhookToken identifica al usuario. Buscar User por webhookToken en DB.
Si no existe el token: responder 404 inmediatamente.

SEGURIDAD en capas (implementar todas):
1. Solo aceptar HTTPS (puerto 443)
2. IP whitelist: verificar que req.ip este en las IPs publicadas por TradingView
   IPs de TV: 52.89.214.238, 34.212.75.30, 54.218.53.128, 52.32.178.7
   (cargar desde .env como TV_ALLOWED_IPS para facilitar actualización)
3. Verificar payload.secret === process.env.WEBHOOK_SECRET
4. Validar schema con Zod

RESPUESTA: el handler debe responder 200 OK en menos de 500ms.
Guardar Signal en DB y encolar en Bull ANTES de responder.
El procesamiento real ocurre asíncronamente en el worker.

Deduplicación: si llega señal con mismo (symbol + action + timestamp) en < 5 segundos,
rechazar como duplicado con status='rejected', reason='DUPLICATE'.

```typescript
// Zod schema del payload:
const WebhookPayload = z.object({
  secret: z.string(),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price: z.number().positive(),
  contracts: z.number().int().positive().optional(),
  strategy: z.string().optional(),
  timeframe: z.string().optional(),
  timestamp: z.string().optional(),
})
```

## PASO 3 — TRADOVATE AUTH OAUTH (apps/api/src/integrations/tradovate/auth.ts)

Implementar flujo OAuth completo para conectar cuentas de terceros:

RUTA 1 — Iniciar OAuth:
GET /api/auth/tradovate/connect  →  redirigir a:
  https://live-api-d.tradovate.com/auth/oauth/authorize
  ?response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI

RUTA 2 — Callback OAuth:
GET /api/auth/tradovate/callback?code=CODIGO
  → POST https://live-api-d.tradovate.com/auth/oauthtoken
     { grant_type: authorization_code, client_id, client_secret, redirect_uri, code }
  → Response: { accessToken, refreshToken, userId }
  → Guardar accessToken, refreshToken, tokenExpiry en Account (cifrados en DB)
  → NUNCA loguear accessToken ni refreshToken

Implementar TokenManager class por cuenta:
- getAccessToken(account): si token válido retorna existente, si no refresca
- ensureValidToken(account): auto-refresh si expira en < 5 minutos
- setupAutoRefresh(): timer que renueva token cada 55 minutos via renewaccesstoken
- Soportar environment demo y live:
  Demo: https://demo.tradovateapi.com/v1
  Live: https://live.tradovateapi.com/v1

## PASO 4 — TRADOVATE WEBSOCKET (apps/api/src/integrations/tradovate/websocket.ts)

Implementar TradovateWebSocketManager:
- Mantener 1 conexión WebSocket por cuenta activa
- Al conectar: autenticar con accessToken, luego enviar user/syncrequest
- Heartbeat cada 2500ms
- Auto-reconnect con exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Escuchar eventos y emitir internamente:
  * order fill → actualizar Order.status='filled', Order.fillPrice
  * position change → actualizar DailyStat.pnl, DailyStat.drawdownPct
  * account update → actualizar Account.balance

WebSocket endpoints:
  Demo: wss://demo.tradovateapi.com/v1/websocket
  Live: wss://live.tradovateapi.com/v1/websocket

## PASO 5 — TRADOVATE ORDERS (apps/api/src/integrations/tradovate/orders.ts)

placeOrder(account, signal, qty):
- Llamar ensureValidToken antes de cada orden
- Mapear acciones: BUY→'Buy', SELL→'Sell', CLOSE_LONG→'Sell', CLOSE_SHORT→'Buy'
- SIEMPRE incluir isAutomated: true (requerido por regulación CME)
- Body: { accountSpec, accountId, action, symbol, orderQty, orderType:'Market', isAutomated:true }
- Rate limit: máximo 10 requests/segundo por cuenta (usar bottleneck o similar)

## PASO 6 — SCHEDULE FILTER (apps/api/src/services/scheduleFilter.ts)

Evaluar 5 condiciones en orden para cada cuenta follower.
TODA la lógica de tiempo en America/Chicago (CT).

```typescript
async function canTrade(accountId: string, rules: TradingRules)
  : Promise<{ allowed: boolean; reason?: string }> {

  const now = toChicagoTime(new Date())
  const stats = await getDailyStats(accountId, now.date)

  // 1. Día permitido
  if (!rules.allowedDays.includes(now.dayOfWeek))
    return { allowed: false, reason: 'DIA_NO_PERMITIDO' }

  // 2. Horario
  if (now.time < rules.startTime || now.time > rules.endTime)
    return { allowed: false, reason: 'FUERA_DE_HORARIO' }

  // 3. Límite entradas del día
  if (stats.entriesCount >= rules.maxEntriesPerDay)
    return { allowed: false, reason: 'MAX_ENTRADAS_DIA' }

  // 4. Drawdown máximo
  if (stats.drawdownPct >= rules.maxDrawdownPct)
    return { allowed: false, reason: 'MAX_DRAWDOWN' }

  // 5. Pérdidas consecutivas
  if (rules.pauseAfterMaxLosses &&
      stats.consecutiveLosses >= rules.maxConsecutiveLosses)
    return { allowed: false, reason: 'MAX_LOSSES_CONSECUTIVOS' }

  return { allowed: true }
}
```

## PASO 7 — RISK ENGINE (apps/api/src/services/riskEngine.ts)

```typescript
async function calculateQty(follower, signal, rules): Promise<number> {
  const balance = await tradovate.getCashBalance(follower.accountId)
  const margin  = await tradovate.getInitialMargin(signal.symbol)

  // riskMode: 'fixed_usd' para challenge/funded Apex
  //           'pct_balance' para modo libre
  let riskAmount = rules.riskMode === 'fixed_usd'
    ? rules.fixedRiskAmount
    : balance * (follower.riskPct / 100)

  // Reducción por losses consecutivos
  if (rules.reduceRiskAfterLosses) {
    const stats = await getDailyStats(follower.accountId, today)
    riskAmount *= Math.pow(rules.reduceRiskFactor, stats.consecutiveLosses)
  }

  return Math.max(0, Math.floor(riskAmount / margin))
}
```

## PASO 8 — COPY ROUTER (apps/api/src/services/copyRouter.ts)

Orquestar el flujo completo:
1. Recibir señal validada
2. Buscar todos los CopyGroups activos donde signal.accountId === group.masterAccountId
   (o si source='manual', usar el groupId del request)
3. Para cada grupo, aplicar distributionMode:
   - 'all': iterar todos los followers activos
   - 'rotate': solo el follower en posicion group.rotateIndex, luego incrementar
   - 'batch_rotate': seleccionar group.batchSize followers ordenados por lastOrderAt ASC
     (los que llevan mas tiempo sin operar primero).
     Saltar cuentas pausadas. Si disponibles < batchSize: usar todos los disponibles.
     Al finalizar: actualizar GroupFollower.lastOrderAt = now() para cada cuenta que opero.
4. Por cada follower seleccionado:
   a. scheduleFilter → si falla: crear Order{status:'skipped', skipReason}
   b. riskEngine → calcular qty
   c. Si qty === 0: crear Order{status:'rejected', skipReason:'SALDO_INSUFICIENTE'}
   d. Si qty >= 1: encolar en Bull con { orderId, signalId, accountId, qty, ... }
5. Actualizar Signal.status = 'processed'

## PASO 9 — ORDER QUEUE (apps/api/src/services/orderQueue.ts)

```typescript
const orderQueue = new Bull('orders', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false
  }
})

// Worker:
orderQueue.process(async (job) => {
  const { orderId, accountId, symbol, side, qty } = job.data
  await tradovate.ensureValidToken(account)
  const result = await tradovate.placeOrder(account, { symbol, side, qty })
  await prisma.order.update({ where:{ id:orderId },
    data:{ status:'sent', tradovateOrderId: result.orderId } })
  await incrementDailyStat(accountId, 'entriesCount')
})
```

## PASO 10 — API ROUTES COMPLETAS

Todos los endpoints requieren JWT excepto /api/webhook y /api/auth/*

POST   /api/webhook/:webhookToken        # Modo A: seniales TV (URL unica por usuario, no requiere JWT)
POST   /api/manual/signal               # Modo B: orden manual desde UI (requiere JWT)
#   body: { groupId, symbol, action, qty? } — usa mismo CopyRouter que Modo A

GET    /api/accounts                    # listar con balance
POST   /api/accounts                    # crear
GET    /api/accounts/:id                # detalle
PUT    /api/accounts/:id                # editar
DELETE /api/accounts/:id                # soft delete
GET    /api/auth/tradovate/connect      # inicia flujo OAuth → redirect a Tradovate
GET    /api/auth/tradovate/callback     # callback OAuth → intercambia código por token
GET    /api/accounts/:id/balance        # balance en tiempo real

GET    /api/groups                      # listar con master y followers
POST   /api/groups                      # crear
PUT    /api/groups/:id                  # editar (incluye distributionMode)
POST   /api/groups/:id/followers        # agregar follower
PUT    /api/groups/:id/followers/:fid   # editar riskPct, rotateOrder, isActive
DELETE /api/groups/:id/followers/:fid   # remover

GET    /api/accounts/:id/rules          # ver reglas
PUT    /api/accounts/:id/rules          # actualizar (upsert)

GET    /api/signals?limit=50&offset=0&status=&from=&to=
GET    /api/orders?accountId=&date=&status=
GET    /api/stats/daily?accountId=&from=&to=

POST   /api/auth/register               # registro de nuevo usuario
POST   /api/auth/login                  # { email, password } → tokens
POST   /api/auth/refresh                # { refreshToken } → accessToken

# Admin only (role=admin — middleware verifica rol)
GET    /api/admin/users                 # todos los usuarios con sus metricas
GET    /api/admin/users/:id             # detalle usuario + cuentas + suscripcion
PATCH  /api/admin/users/:id             # activar/desactivar, cambiar plan
GET    /api/admin/metrics               # metricas globales plataforma
GET    /api/health                      # { status, db, redis, timestamp }

## PASO 11 — FRONTEND REACT (dark theme profesional)

### Dashboard.tsx
- Métricas globales: cuentas activas, señales hoy, órdenes ejecutadas, P&L total del día
- Tabla de cuentas con balance, entradas hoy, P&L, estado (activa/pausada/sin token)
- Feed de últimas señales con polling cada 5s
- Banner de alerta si alguna cuenta está pausada por max losses
- Indicador de etapa Apex por cuenta (challenge / funded_to_withdrawal / funded_active)

### Accounts.tsx
- Tabla: nombre, ambiente (demo/live), balance, etapa Apex, estado
- Modal crear/editar: nombre, tradovateId, tradovateSpec, environment
- Botón Conectar Tradovate → redirige a OAuth de Tradovate (usuario hace login directo en Tradovate)
- Callback exitoso → cuenta queda vinculada y aparece en la lista con estado Conectada
- Badge estado: Conectada (verde) / Sin token (amarillo) / Inactiva (gris)

### CopyGroups.tsx
- Lista de grupos del usuario autenticado (aislados por userId via JWT)
- Crear/editar: nombre, cuenta master, distributionMode, batchSize (solo visible si mode=batch_rotate)
- Panel followers: agregar/editar riskPct, rotateOrder, toggle activo
- Visualización del turno actual cuando distributionMode = 'rotate'

### Rules.tsx
- Selector de cuenta
- Sección 'Etapa Apex': selector de accountStage, riskMode, fixedRiskAmount
- Sección 'Horario': allowedDays (checkboxes), startTime, endTime CT
- Sección 'Protección': maxEntriesPerDay, maxDrawdownPct, reduceRiskAfterLosses,
  reduceRiskFactor (slider), maxConsecutiveLosses, pauseAfterMaxLosses

### ManualPanel.tsx  (Modo B — panel manual con copy y reglas Apex activas)
- Selector de CopyGroup destino (obligatorio antes de enviar)
- Input de símbolo (ej: MNQU25) con validación de formato
- 4 botones grandes: BUY (verde) | SELL (rojo) | CLOSE LONG (azul) | CLOSE SHORT (naranja)
- Modal de confirmación: muestra grupo, símbolo, acción y cuántas cuentas recibirán la orden
- Al confirmar: POST /api/manual/signal — mismas reglas Apex y batch_rotate activas
- Log de últimas 20 órdenes manuales de la sesión con timestamp y resultado

### AdminDashboard.tsx  (solo visible para role=admin)
- Tabla de usuarios: nombre, email, plan, nº cuentas, P&L total, estado
- Click en usuario: drawer con todas sus cuentas y métricas
- Métricas globales: total señales hoy, total órdenes, usuarios activos
- Botón 'Proponer config': seleccionar template y aplicar a un usuario

### Signals.tsx
- Tabla paginada: fecha, símbolo, acción, precio, estrategia, status
- Filtros: status, fecha, símbolo
- Click en señal: drawer con detalle + lista de órdenes generadas

### Orders.tsx
- Tabla paginada: fecha, cuenta, símbolo, lado, qty, status, fill price
- Filtros: cuenta, fecha, status
- Mostrar skipReason o errorMsg cuando status = 'skipped' o 'error'

### Reports.tsx  (Placeholder — se implementa en v1.2)
Mostrar pantalla con mensaje: 'Bitácora disponible en v1.2'
Incluir lista de lo que tendrá: estadísticas, equity curve, análisis temporal, lista de trades.

## PASO 11.5 — STUBS PARA MÓDULOS FUTUROS

Crear archivos vacíos/stub para módulos que se implementarán en versiones futuras.
Esto permite que el compilador no falle y deja la estructura lista:

apps/api/src/routes/reports.ts   → exportar router vacío con comentario // TODO v1.2
apps/api/src/routes/audit.ts     → exportar router vacío con comentario // TODO v1.3
apps/api/src/routes/health.ts    → exportar router vacío con comentario // TODO v1.3
apps/api/src/services/notifications.ts → clase NotificationService vacía // TODO v1.3
apps/web/src/pages/Reports.tsx   → componente con mensaje 'Disponible en v1.2'

## PASO 13 — DOCKER COMPOSE

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: copytrader
      POSTGRES_USER: copytrader
      POSTGRES_PASSWORD: copytrader123
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U copytrader']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  api:
    build: ./apps/api
    ports: ['3001:3001']
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    env_file: .env
    command: sh -c 'npx prisma migrate deploy && node dist/index.js'

  web:
    build: ./apps/web
    ports: ['3000:3000']
    depends_on: [api]
    environment:
      VITE_API_URL: http://localhost:3001

volumes:
  pgdata:
```

## PASO 13 — TESTS UNITARIOS (Vitest)

Crear tests para:

signalValidator.test.ts:
- payload válido → pasa
- secret incorrecto → lanza error
- action inválida → error Zod
- campos faltantes → error Zod

scheduleFilter.test.ts:
- mockear fecha/hora para cada condición
- día no permitido → DIA_NO_PERMITIDO
- fuera de horario → FUERA_DE_HORARIO
- maxEntradas alcanzado → MAX_ENTRADAS_DIA
- drawdown superado → MAX_DRAWDOWN
- losses consecutivos → MAX_LOSSES_CONSECUTIVOS
- todas las condiciones OK → allowed: true

riskEngine.test.ts:
- riskMode fixed_usd: qty correcto con $650 / $40 margin = 16
- riskMode pct_balance: qty correcto con balance $5000, 1% = $50 / $40 = 1
- 2 losses consecutivos con factor 0.5: riskAmount * 0.25
- balance insuficiente → qty = 0

## CONSIDERACIONES IMPORTANTES

1. WEBHOOK TIMEOUT: el endpoint /api/webhook debe responder en < 500ms.
   Guardar en DB y encolar ANTES de responder. Procesar en worker async.

2. SEGURIDAD WEBHOOK: implementar las 4 capas de seguridad descritas.
   IP whitelist de TradingView: 52.89.214.238, 34.212.75.30, 54.218.53.128, 52.32.178.7

3. CME REGULATION: isAutomated: true es OBLIGATORIO en todas las órdenes automatizadas.

4. TIMEZONE: toda lógica de horarios en America/Chicago. Guardar en DB en UTC.

5. TOKEN SEGURIDAD: NUNCA loguear accessToken ni refreshToken de Tradovate.

6. RATE LIMIT TRADOVATE: máximo 10 req/seg. Implementar rate limiter en orders.ts.

7. DEDUPLICACIÓN: rechazar webhooks duplicados (mismo symbol+action+timestamp < 5s).

8. WEBSOCKET: 1 conexión WS por cuenta activa. Reconectar con exponential backoff.

9. ACOSTADO: distributionMode='rotate' incrementa group.rotateIndex después de cada señal.
   El índice se resetea a 0 cuando supera el número de followers activos.

10. SEED: al iniciar crear usuario: admin@copytrader.local / Admin1234!

## RESULTADO ESPERADO — MVP v1.0

FUNCIONALIDAD CORE:
- TradingView webhook → señal recibida → copiada a cuentas Tradovate seleccionadas
- Panel manual: botones Buy/Sell/Close → misma lógica de copia
- Sistema Apex activo: etapas (challenge/funded), riskMode, batch_rotate
- OAuth Tradovate: usuario conecta sus cuentas via login en Tradovate
- Dashboard: cuentas activas, señales del día, órdenes, P&L
- Señales y Órdenes: historial paginado con detalle

INFRAESTRUCTURA:
- docker-compose up levanta todo (postgres + redis + api + web)
- Migraciones se aplican automáticamente al iniciar
- npm test pasa todos los tests
- Frontend en http://localhost:3000
- Backend en http://localhost:3001
- Webhook: POST http://localhost:3001/api/webhook/:webhookToken

NO incluido en MVP (implementar en versiones futuras):
- Bitácora/Reportes → v1.2
- Notificaciones (email, push, Telegram, WhatsApp) → v1.3
- Panel de salud de conexiones → v1.3
- Audit log → v1.3
- Onboarding checklist → v1.4

Empieza por PASO 1 y avanza en orden hasta completar todos los pasos.
Crea archivos reales — no muestres snippets sin crear los archivos.
══ FIN DEL PROMPT ══

6