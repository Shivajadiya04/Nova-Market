# Nova Market: e-commerce microservices + React frontend

Eight Node.js/Express microservices, an API gateway, and a React frontend (Vite, JavaScript, plain CSS).
It deploys to **Render** straight from GitHub with the included [`render.yaml`](render.yaml) Blueprint,
and CI runs on **GitHub Actions** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Neither needs
any software on your own computer.

For local development, a **mock mode** replaces MongoDB, RabbitMQ, Redis, Razorpay and ImageKit with
in-memory stand-ins. Mock mode is refused in production.

## 1. Architecture

```
Browser ──HTTPS──► gateway (public)  ── serves the React app (frontend/dist)
                      │  /api/* proxy, websocket proxy, logout-revocation check, security headers
                      │  private network only:
     ┌────────┬───────┼─────────┬──────────┬──────────────────┬──────────┐
     auth   product  cart     order      payment      seller-dashboard  ai-buddy
     │        ▲        ▲      │  │         │  │                ▲          │
     │        └────────┼──────┘  │ reserve/│  │ confirm paid    │          └─► product, cart (tools)
     │                 └─────────┘ release │  └─► order          │
     │                             stock   └─► Razorpay (+ webhook)
     └── Redis (revoked tokens)
     RabbitMQ events ──► notification (Gmail) and seller-dashboard (its own copy of users/products/orders/payments)
Every DB service: Express → Mongoose → its own MongoDB database
```

| Service | Port (local) | Responsibility | Data |
|---|---|---|---|
| **gateway** | 8080 | Public entry point: React app, `/api/*` + websocket proxy, rejects revoked tokens, never exposes `/internal/*` | none |
| **auth** | 3000 | Register, login, logout (server-side revocation), profile, addresses. Issues the JWT (httpOnly cookie) | MongoDB `users`, Redis |
| **product** | 3001 | Catalogue, search, seller product CRUD, images (ImageKit), **atomic stock reservation** | MongoDB `products` |
| **cart** | 3002 | Per-user cart | MongoDB `carts` |
| **order** | 3003 | Orders from the cart with server-side prices; reserves stock, cancels (releases stock), confirms after payment | MongoDB `orders` |
| **payment** | 3004 | Razorpay orders, signature verification, webhook, idempotent payments | MongoDB `payments` |
| **seller-dashboard** | 3007 | Seller sales, revenue, inventory, orders (from RabbitMQ events) | MongoDB copy |
| **ai-buddy** | 3005 | Socket.IO shopping assistant (Google Gemini) that can search products and add to the cart | none |
| **notification** | 3006 | Emails on registration, payment initiated/completed/failed and product published (Gmail OAuth2) | none |

**Key flows**
- **Checkout:** the order service reads the cart and current prices from the services (never from the
  client), then reserves stock atomically (all or nothing; the last unit can't be sold twice). It then creates a
  `PENDING` order, and the frontend empties the cart.
- **Payment:**
  1. `POST /api/payments/create/:orderId` creates the Razorpay order in **paise** from the server-side total.
     It's idempotent: an unfinished attempt is reused, and paid or cancelled orders are refused.
  2. The customer pays in Razorpay Checkout.
  3. `POST /api/payments/verify` checks the HMAC signature with Razorpay's official helper. The update is
     atomic and scoped to the paying user. Then the payment service calls the order service's internal endpoint.
  4. The order service confirms the order only if the amount matches its total: `PENDING → CONFIRMED`.
  5. The Razorpay **webhook** (`payment.captured` / `payment.failed`) does the same if the browser never
     comes back. Redeliveries are harmless.
- **Logout:** auth stores a SHA-256 hash of the token in Redis until it expires. Auth and the gateway reject it
  everywhere from then on.
- **Service-to-service calls** to `/internal/*` endpoints carry the shared `INTERNAL_SERVICE_TOKEN`. The gateway
  never routes `/internal`, and strips that header from client requests.

## 2. Prerequisites

- **To deploy:** a GitHub account and the cloud accounts in [section 6](#6-accounts-and-credentials-you-must-create).
  Nothing to install.
- **For local development (optional):** Node.js 18+ (tested on 22 LTS). Mock mode needs nothing else: no
  database, no Docker, no admin rights. The original Jest suites use `mongodb-memory-server` (a real `mongod`).
  On Windows that needs the Visual C++ 2015-2022 x64 runtime, which needs admin rights, but they also run in
  GitHub Actions.

## 3. Local development (mock mode)

```bash
npm run setup
```
Creates every missing `.env` from its `.env.example`, adds newly introduced keys, and generates shared random
development values for `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN`. It never overwrites a value or prints a secret.

```bash
npm run install:all
```

```bash
npm run dev
```
Starts auth, product, cart, order, payment, seller-dashboard, the gateway (:8080) and Vite (:5173).

Open **http://localhost:5173**. If the very first load is blank, reload once: Vite was still pre-bundling dependencies.

| Role | Email | Username | Password |
|---|---|---|---|
| Customer | `user@example.com` | `demo_user` | `User@1234` |
| Customer | `rahul@example.com` | `rahul_k` | `User@1234` |
| Seller | `seller@example.com` | `demo_seller` | `Seller@123` |
| Seller | `crafts@example.com` | `craft_corner` | `Seller@123` |

These **development-only** accounts and the sample catalogue live in [`mock-data/index.js`](mock-data/index.js).
Data is in memory and resets when a service restarts.

How mock mode works (`USE_MOCK_DB=true`, allowed only with `NODE_ENV=development` or `test`):

| Dependency | Mock-mode stand-in |
|---|---|
| MongoDB | Mongoose attached to the pure-JS driver [`mock-data/memory-driver.js`](mock-data/memory-driver.js). Models, validation, defaults, timestamps and `select: false` run unchanged. Unsupported features (aggregation, bulkWrite, positional `$`) throw a clear error. |
| RabbitMQ | When `RABBIT_URL` is empty: events are logged and dropped (seller-dashboard shows its seeded data, no emails). |
| Redis | When `REDIS_URL`/`REDIS_HOST` are empty: an in-memory store. |
| Razorpay | When `RAZORPAY_KEY_ID` is empty: fake order ids. A dev-only `POST /api/payments/mock/checkout` signs the payment with a random per-process secret, so the real `/verify` code still checks the signature. The route doesn't exist in real mode. |
| ImageKit | When `IMAGEKIT_PRIVATE_KEY` is empty: uploaded images are stored inline as data URLs. |
| Gmail, Gemini | No mock: notification and ai-buddy need real credentials (`npm run dev:all` starts them). |

**Tests**
- `npm run smoke`, with the stack running: 91 end-to-end checks through Vite and the gateway. They cover auth,
  validation, roles, cart, stock reservation and the last-unit race, orders, payment idempotency and
  confirmation, signed webhooks, internal-endpoint protection, the seller dashboard and logout revocation.
  Restart the stack before re-running.
- `npm test`: the original Jest suites. They need a working `mongod` (see Prerequisites).

## 4. Put the project on GitHub

`.gitignore` excludes `.env` files, `node_modules`, build output, logs and the MongoDB test binary.
Only `.env.example` templates (placeholders, no secrets) are committed.

- **Option A: no software at all.**
  1. Create an empty repository on github.com.
  2. Click **uploading an existing file**.
  3. Drag the project folder's contents in.
  4. Commit.

  Don't upload `node_modules` or any `.env` file. GitHub's web upload takes up to 100 files at a time, so upload
  in a few batches (for example, one service folder per commit). Folder structure is kept when you drag folders.
- **Option B: git.**
  ```bash
  git init
  ```
  ```bash
  git add .
  ```
  ```bash
  git commit -m "Initial commit"
  ```
  ```bash
  git branch -M main
  ```
  ```bash
  git remote add origin https://github.com/<you>/<repo>.git
  ```
  ```bash
  git push -u origin main
  ```

After the push, the **Actions** tab runs CI (install, frontend build, Jest, full-stack smoke test) on GitHub's servers.

## 5. Deploy to Render (from GitHub, nothing installed locally)

[`render.yaml`](render.yaml) creates:
- `gateway`: public web service.
- 7 private services (`pserv`): auth, product, cart, order, payment, seller-dashboard, ai-buddy.
- `notification`: background worker.
- `nova-redis`: Key Value instance.

They talk over Render's private network. `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN` are generated by Render and
shared through the `nova-shared` environment group.

1. Create the external accounts and collect the values in [section 6](#6-accounts-and-credentials-you-must-create).
2. In Render: **New → Blueprint**, connect GitHub, pick this repository and branch `main`.
3. Render asks for every `sync: false` value: `MONGO_URI` per service, `RABBIT_URL`, the Razorpay, ImageKit,
   Gmail and Gemini credentials. Paste them and click **Apply**.
4. Wait for all builds. Then open `https://<gateway>.onrender.com/health/services`: every service should say `ok`.
5. In the Razorpay dashboard, go to **Webhooks → Add**:
   - URL: `https://<gateway-host>/api/payments/webhook/razorpay`
   - Events: `payment.captured`, `payment.failed`
   - Secret: a value you choose, which you then set as `RAZORPAY_WEBHOOK_SECRET` on the `payment` service.

   In **Payment capture settings**, enable automatic capture.
6. Optional: add your own domain to `gateway` (Render provides HTTPS).

Region is `singapore` (closest to India and Razorpay). Change it in `render.yaml` **before** the first deploy
if needed. Pick the same or a nearby region for MongoDB Atlas and CloudAMQP.

**Cost:** Render has no free plan for private services or background workers, and free web services can't receive
private-network traffic. So this Blueprint uses the `starter` instance type for the gateway, 7 private services and
the worker: 9 instances, roughly US$7/month each at the time of writing (check render.com/pricing). Key Value uses
the free plan (25 MB, no persistence, see Known limitations). To save money, you can drop `ai-buddy` (the
Assistant page then shows "unavailable") and `notification` (no emails). Remove them from `render.yaml` and the
gateway's `AI_BUDDY_SERVICE_URL`.

**Production startup commands** (what Render runs): each service runs `npm ci --omit=dev`, then `node server.js`,
from its folder. The gateway runs `npm ci --include=dev --prefix frontend`, then `npm run build --prefix frontend`,
then `npm ci --omit=dev --prefix gateway`, then `node gateway/server.js`. Every service honours `PORT`, exposes
`GET /health` (503 when its database is down), returns JSON errors without stack traces, and shuts down gracefully
on `SIGTERM`.

Any other Node host works the same way (one process per service plus the gateway). Set the same environment
variables, keep the backends private, and point the gateway's `*_SERVICE_URL` at them.

## 6. Accounts and credentials you must create

| What | Where | Used by | Notes |
|---|---|---|---|
| MongoDB | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free M0 cluster works) | auth, product, cart, order, payment, seller-dashboard | One cluster, **one database per service**: `.../auth`, `.../product`, … Create a database user. Under Network Access, allow Render's outbound IPs (Render dashboard → service → Connect → Outbound) or `0.0.0.0/0` with a strong password. |
| RabbitMQ | [CloudAMQP](https://www.cloudamqp.com) (free "Little Lemur") | auth, product, order, payment, seller-dashboard, notification | Use the `amqps://` URL. The same URL goes to every service. |
| Razorpay | [Razorpay dashboard](https://dashboard.razorpay.com) → API Keys | payment | Start with `rzp_test_…` keys. Live keys need KYC. Also set up the webhook (section 5, step 5). |
| ImageKit | [ImageKit](https://imagekit.io) → Developer → API keys | product | Public key, private key, URL endpoint. Required in production (product images). |
| Gmail OAuth2 | Google Cloud Console (enable the Gmail API, create an OAuth client) + [OAuth Playground](https://developers.google.com/oauthplayground) for a refresh token | notification | `EMAIL_USER`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` |
| Gemini | [Google AI Studio](https://aistudio.google.com/app/apikey) | ai-buddy | `GOOGLE_API_KEY`. Set `GEMINI_MODEL` if the default model is retired. |
| Redis | Created by the Blueprint (`nova-redis`) | auth | Or any Redis: set `REDIS_URL` (`rediss://` for TLS). |

`JWT_SECRET` and `INTERNAL_SERVICE_TOKEN` are generated by Render. Elsewhere, use 32+ random characters, the
same value in every service; production startup refuses shorter ones. **Never** put secrets in `VITE_*`
variables: those are bundled into the browser code.

## 7. Environment variables

Each folder's `.env.example` documents its variables. Summary:

| Service | Always | Real mode (`USE_MOCK_DB=false`) | Optional |
|---|---|---|---|
| all DB services | `NODE_ENV`, `JWT_SECRET` | `MONGO_URI` | `PORT`, `USE_MOCK_DB` |
| auth | `INTERNAL_SERVICE_TOKEN` | `RABBIT_URL`, `REDIS_URL` (or `REDIS_HOST`) | `REDIS_PORT`, `REDIS_PASSWORD` |
| product | `INTERNAL_SERVICE_TOKEN` | `RABBIT_URL`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | |
| cart | | | |
| order | `INTERNAL_SERVICE_TOKEN`, `CART_SERVICE_URL`, `PRODUCT_SERVICE_URL` | `RABBIT_URL` | |
| payment | `INTERNAL_SERVICE_TOKEN`, `ORDER_SERVICE_URL` | `RABBIT_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | `RAZORPAY_WEBHOOK_SECRET` (strongly recommended) |
| seller-dashboard | | `RABBIT_URL` | `LOW_STOCK_THRESHOLD` |
| notification | `RABBIT_URL`, `EMAIL_USER`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` | | `EMAIL_FROM_NAME`, `PORT` |
| ai-buddy | `JWT_SECRET`, `GOOGLE_API_KEY`, `PRODUCT_SERVICE_URL`, `CART_SERVICE_URL` | | `GEMINI_MODEL`, `PORT` |
| gateway | `INTERNAL_SERVICE_TOKEN`, `AUTH_`/`PRODUCT_`/`CART_`/`ORDER_`/`PAYMENT_`/`SELLER_DASHBOARD_SERVICE_URL` | | `AI_BUDDY_SERVICE_URL`, `FRONTEND_DIST`, `PORT` |
| frontend | `VITE_API_BASE_URL` (keep `/api`) | | `GATEWAY_URL` (dev proxy only) |

`*_SERVICE_URL` values can be a full URL or a bare `host:port` (what Render's private network provides).
A missing required value stops startup with a message naming it. Real mode never falls back to mock storage.

## 8. Database setup and persistence

- **No migrations or seed data are required.** Collections and indexes are created by Mongoose on first start:
  unique `username`/`email`, the product text index for search, one cart per user, the order history index,
  and unique `razorpayOrderId`.
- Start using it by registering a seller account in the app and adding products (with stock and images).
  `mock-data/` is never loaded in real mode.
- Atlas keeps the data persistent and backed up. The services hold no data on local disk; product images live in ImageKit.
- Upgrading an existing database from the earlier code: payments created before this version stored amounts in
  rupees, not paise, and orders created before it never reserved stock (cancelling one adds its quantity back).
  New installs are unaffected.

## 9. Security notes

- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, 1 day. The JWT can't be read by JavaScript, and HTTPS is
  provided by Render.
- Prices, totals, payment amounts and order status are computed server-side. Clients can't set them, and roles
  are enforced by each service. Self-registration offers `user` or `seller` (a marketplace feature); `admin`
  is rejected.
- No password hashes in responses or events, and no payloads, tokens or secrets in logs.
- Inputs are validated: express-validator rules, JSON body limits, image-only uploads up to 5 MB × 5, and
  user-supplied text is HTML-escaped in emails.
- Not included (consider adding): login rate limiting / account lockout, and an admin role for refunds.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variables: …` | Set them on that service (Render → service → Environment) or in its `.env`. |
| `JWT_SECRET … at least 32 characters in production` | Use a longer secret (Render's generated value is fine). |
| `USE_MOCK_DB=true is only allowed when …` | Mock mode is development-only. Set `USE_MOCK_DB=false` in production. |
| `/health/services` shows `unreachable` | That service failed to start. Open its logs on Render, usually a wrong `MONGO_URI` or an Atlas IP allowlist issue. |
| `MongooseServerSelectionError` | Atlas network access doesn't allow Render's IPs, or the URI or password is wrong. |
| Login works but other pages return 401 | Services have different `JWT_SECRET` values. They must all come from `nova-shared`. |
| `503 Authentication service unavailable` | The gateway can't reach auth, or auth can't reach Redis. Requests fail closed on purpose. |
| Paid but order still `PENDING` | Check the payment service logs. Configure the Razorpay webhook so missed confirmations are retried. |
| Product image upload fails in production | Check the ImageKit keys and URL endpoint. |
| Assistant says unavailable | ai-buddy isn't deployed, `GOOGLE_API_KEY` is missing, or the Gemini model is retired (`GEMINI_MODEL`). |
| No emails | Check the notification worker logs (Gmail OAuth2 values) and `RABBIT_URL`. |
| `… is not supported by the in-memory mock database` | Mock-mode limitation. Use real MongoDB, or extend `mock-data/memory-driver.js`. |

## 11. Known limitations

- **Unpaid orders hold their stock** until the customer cancels them. There's no automatic expiry yet.
- **Refunds are manual.** If a customer pays for an order that was cancelled at the same moment, the order service
  logs `refund required` and returns 409. Refund it from the Razorpay dashboard.
- **Seller-dashboard data is eventually consistent:** it's updated from RabbitMQ events, so it lags by
  seconds, and messages sent while RabbitMQ is down are lost (publishing is best-effort and logged).
  In mock mode it only shows seeded data.
- **Logout across several gateway instances:** another gateway instance may accept a revoked token for up to
  5 seconds (its cache). The free Key Value instance has no persistence: if it restarts, tokens revoked before
  the restart work again until they expire (at most 1 day). Use a paid Key Value plan to avoid this.
- Order status beyond `CONFIRMED` (`SHIPPED`, `DELIVERED`) has no API yet; there is no admin interface.
- The AI assistant depends on Google's Gemini API and model availability.

## 12. Change log (why each change was made)

**This release (production readiness)**
- **Orders confirmed after payment:**
  - payment → order internal call after signature verification (amount checked against the order total).
  - Signed Razorpay webhook as a fallback.
  - The order stores `payment` details.
- **Paise:** Razorpay orders are created in the smallest currency unit, and notifications convert back for display.
- **Idempotent payments:** reuse of pending attempts, refusal of paid or cancelled orders, verification scoped to
  the paying user with an atomic `PENDING → COMPLETED` transition, and a unique `razorpayOrderId`.
- **Inventory:**
  - Atomic all-or-nothing stock reservation when ordering, released on cancel.
  - Orders with an empty cart or mixed currencies are refused, and missing products return 409 instead of 500.
- **Logout:** server-side revocation (hashed token in Redis with TTL), enforced by auth and the gateway.
- **Events:**
  - The queue-name mismatch (`PAYMENT_UPDATE` → `PAYMENT_UPDATED`) is fixed.
  - Product update/delete and order update events are added, applied in seller-dashboard by idempotent upserts.
  - Password hashes are no longer sent.
  - The broker reconnects, publishes best-effort and stops logging payloads.
- **Seller dashboard:** inventory totals, out-of-stock count and low-stock list.
- **Production plumbing:** `PORT`, `/health`, JSON 404/error handlers, graceful shutdown, `trust proxy`, body
  limits, upload limits, `SameSite` cookie, production secret-length check, `/me` reads the profile from the database.
- **Gateway:** new public service with security headers, SPA hosting and websocket proxying.
- **Notification:** HTML escaping, payload fields fixed. **ai-buddy:** errors handled, configurable model,
  session expiry check.
- **Frontend:** payment config fetched from the backend (no build-time Razorpay key), the order reloads after
  payment to show the server-confirmed status, inventory panel, role-aware redirect after login, dev proxy via
  the gateway.
- **Deployment:** `render.yaml`, GitHub Actions CI, updated `.env.example` files and `.gitignore`.

**Earlier (local mock mode)**
- Mock mode (`src/config/env.js`, `src/db/mock.js`, `mock-data/`).
- Inter-service URLs moved from a hardcoded AWS load balancer to environment variables.
- Cart item removal and cart clearing.
- Optional product `stock`.
- `pincode` kept on saved addresses.
- seller-dashboard route, `req.user.id`, ObjectId matching and revenue fixes.
- Dockerfiles removed (Render builds natively from `package.json`, so no Docker configuration is required).
