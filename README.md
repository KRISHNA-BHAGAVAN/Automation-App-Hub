# Automation Hub

Automation Hub is an authenticated centralized portal designed for engineering, DevOps, and operations teams to discover, launch, and manage mini automation apps, internal dashboards, and operational tools by category.

---

## Key Features

- **Centralized Tool Directory**: Organize tools and internal workflows into clean, filterable categories (CI/CD, Monitoring, Data Pipelines, etc.).
- **Role-Based Access Control (RBAC)**: Distinct permissions for `admin` and standard `user` roles.
- **Access Request Workflows**: Self-service access request queue where administrators review, approve, or reject user access.
- **Admin Management Portal**: Real-time user management with capability to block/unblock accounts and manage categories and app cards.
- **Decoupled Architecture**: 100% free of vendor locks (completely removed Supabase SDK and proprietary dependencies).
- **Universal PostgreSQL Support**: Driven by [Drizzle ORM](https://orm.drizzle.team/) connecting to any standard PostgreSQL database (Neon, Supabase, AWS RDS, GCP Cloud SQL, or self-hosted Docker PostgreSQL).

---

## Default Administrator Credentials

A fully configured administrator account has been seeded into the database:

| Field | Value |
|---|---|
| **Email** | `krishnabhagavan910@gmail.com` |
| **Password** | `Aq1sw2de3fr4gt*` |
| **Role** | `admin` |
| **Access Approved** | `true` |
| **Email Verified** | `true` |
| **Blocked** | `false` |

You can immediately sign in with these credentials to access the full administrator dashboard, manage user access requests, and create or reorder automation cards.

---

## Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────┐
│                      Web Browser                       │
│          React 19 + TypeScript + Tailwind CSS          │
└───────────────────────────┬────────────────────────────┘
                            │ REST API (Cookies & Bearer)
┌───────────────────────────▼────────────────────────────┐
│                    Express Backend                     │
│    - JWT & HTTP-Only Cookie Authentication             │
│    - Bcrypt Password Hashing                           │
│    - Access Control & Session Middleware               │
│    - Dual-mode Storage Engine                          │
└──────────────┬───────────────────────────┬─────────────┘
               │ (DATABASE_URL provided)   │ (Fallback)
┌──────────────▼────────────┐   ┌──────────▼─────────────┐
│    PostgreSQL Database    │   │  Local Persistent File │
│   via Drizzle ORM & pg    │   │   /.data/local-db.json │
└───────────────────────────┘   └────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Backend API**: Node.js, Express, TypeScript.
- **Authentication**: Native bcrypt password hashing (10 salt rounds), JWT signing, HTTP-Only secure cookies (`hub_token`), and Bearer token fallback.
- **Database & ORM**: Drizzle ORM with `pg` connection pooling.
- **Resilience Engine**: Dual-mode storage: automatically runs DDL migration (`CREATE TABLE IF NOT EXISTS`) and connects to PostgreSQL if `DATABASE_URL` is set; seamlessly falls back to persistent disk storage (`/.data/local-db.json`) if running standalone.

---

## Environment Configuration

Configure environment variables in your `.env` or cloud secret manager:

```env
# Optional: Standard PostgreSQL connection string
# Supported providers: Supabase, Neon, AWS RDS, Cloud SQL, Railway, Local Postgres
DATABASE_URL=postgresql://postgres:yourpassword@db.example.com:5432/automation_hub?sslmode=require

# Optional: Custom JWT secret key for token signing (recommended in production)
JWT_SECRET=your-secure-random-jwt-secret-key-at-least-32-chars

# Optional: Server listening port (default: 3000)
PORT=3000

# Optional: Environment flag
NODE_ENV=production
```

> **Switching PostgreSQL Providers**: Simply update `DATABASE_URL` to point to your new database host. The server will automatically initialize tables, columns, indexes, and seed default data on next boot without requiring code modifications.

---

## Database Schema

The database consists of 5 core tables defined in `lib/db/src/schema/index.ts`:

1. **`profiles`**:
   - `id` (TEXT, PK): Unique user ID.
   - `email` (TEXT, UNIQUE): Normalized user email.
   - `password_hash` (TEXT): Bcrypt hashed password.
   - `role` (TEXT): User permission level (`admin` or `user`).
   - `is_blocked` (BOOLEAN): Administrative account lock flag.
   - `access_approved` (BOOLEAN): Approval gate for non-whitelisted domains.
   - `email_verified` (BOOLEAN): Email confirmation status.
   - `created_at` / `updated_at` (TIMESTAMPTZ).

2. **`categories`**:
   - `id` (TEXT, PK): Category identifier.
   - `name` (TEXT): Category display name.
   - `created_at` / `updated_at` (TIMESTAMPTZ).

3. **`app_cards`**:
   - `id` (TEXT, PK): Automation app identifier.
   - `category_id` (TEXT, FK -> `categories.id`): Associated category.
   - `name` (TEXT): Application name.
   - `link` (TEXT): Target application launch URL.
   - `created_at` / `updated_at` (TIMESTAMPTZ).

4. **`access_requests`**:
   - `id` (TEXT, PK): Access request ID.
   - `email` (TEXT): Requesting user's email.
   - `status` (TEXT): `pending`, `approved`, or `rejected`.
   - `reviewed_by` (TEXT, FK -> `profiles.id`).
   - `reviewed_at` (TIMESTAMPTZ).
   - `created_at` / `updated_at` (TIMESTAMPTZ).

5. **`password_resets`**:
   - `id` (TEXT, PK): Reset token entry ID.
   - `email` (TEXT): Target user email.
   - `token` (TEXT, UNIQUE): Cryptographic reset token.
   - `expires_at` (TIMESTAMPTZ): Token expiration timestamp.
   - `used` (BOOLEAN): One-time use flag.
   - `created_at` (TIMESTAMPTZ).

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Authenticate with email & password. Sets HTTP-Only cookie and returns user object + token.
- `POST /api/auth/sign-up` - Create a new user account.
- `GET /api/auth/me` - Retrieve currently authenticated session profile.
- `POST /api/auth/logout` - Clear session cookie.
- `POST /api/auth/password-reset` - Request password reset link / token (dispatched via Brevo email).
- `POST /api/auth/change-password-request` - Request a password reset link sent to your registered email via Brevo (available to all logged-in users, admin & member).
- `POST /api/auth/change-password` - Directly update password by verifying current password and setting new password (min 8 chars).
- `POST /api/auth/reset-password` - Complete password reset with secure one-time token.

### Directory Structure
```
├── frontend/          # React 19 SPA, Tailwind CSS, Glassmorphic UI components
├── backend/           # Express server, authentication routes, Brevo email dispatcher
├── lib/               # Shared database schema (Drizzle ORM), API contracts, types
├── server.ts          # Root dev & production server entry point
└── package.json       # Workspace configuration
```

### Email Integration (Brevo)
- Configure `BREVO_API_KEY` in environment secrets to send transactional emails via Brevo's REST API.
- Optional: Set `BREVO_SENDER_EMAIL` (defaults to `notifications@automation-hub.app`) and `BREVO_SENDER_NAME`.
- In local development or if `BREVO_API_KEY` is not yet set, the server prints the recovery link directly in the server console so flows can still be tested seamlessly.

### Access Requests
- `POST /api/auth/access-requests` - Submit a request for platform access.
- `GET /api/auth/access-requests` - *(Admin only)* List pending and reviewed access requests.
- `POST /api/auth/access-requests/:id/decision` - *(Admin only)* Approve or reject an access request.

### Categories & Automation Cards
- `GET /api/categories` - Fetch all categories.
- `POST /api/categories` - *(Admin only)* Create a category.
- `PATCH /api/categories/:id` - *(Admin only)* Update a category.
- `DELETE /api/categories/:id` - *(Admin only)* Remove a category.
- `GET /api/app-cards` - Fetch all automation cards.
- `POST /api/app-cards` - *(Admin only)* Create an automation card.
- `PATCH /api/app-cards/:id` - *(Admin only)* Update an automation card.
- `DELETE /api/app-cards/:id` - *(Admin only)* Remove an automation card.

### Admin User Management
- `GET /api/admin/users` - *(Admin only)* List all registered users.
- `PATCH /api/admin/users/:id/blocked` - *(Admin only)* Block or unblock a user account.
- `POST /api/auth/invite` - *(Admin only)* Invite a new team member directly.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development
```bash
npm run dev
```
The server will boot on port `3000` (or `PORT` specified in your environment) with Vite middleware serving the React SPA.

### 3. Build & Run for Production
```bash
# Build the React frontend
npm run build

# Start the full-stack server
npm start
```

---

## Testing & Verification

1. Navigate to `http://localhost:3000` in your browser.
2. Sign in with the seeded administrator credentials:
   - **Email**: `krishnabhagavan910@gmail.com`
   - **Password**: `Aq1sw2de3fr4gt*`
3. You will enter the Automation Hub with full administrative rights:
   - Launch team automation cards directly.
   - Switch between categories or search cards in real-time.
   - Click "Admin Portal" in the top bar to review access requests, view user directories, and manage accounts.
