# JobTrail

A full-stack app for keeping track of a job search: every application, where it stands, upcoming interviews, and the people you've talked to at each company.

**Stack:** React, TypeScript, Node.js, Express, PostgreSQL, React Router, Vite, Vitest

## Features

- Sign up / log in with sessions stored in Postgres (httpOnly cookie, passwords hashed with scrypt)
- Add, edit and delete applications with status, salary range, posting link and notes
- Every status change is recorded, so each application has a timeline
- Schedule interviews and mark them passed / failed
- Companies and contacts, with all applications for a company in one place
- Search, filter by status, sort and paginate the application list (all done server-side)
- Dashboard with totals, response rate, applications per week and upcoming interviews
- Input validation on every endpoint, with field-level errors shown in the forms
- Users can only ever see their own data (checked in every query, and covered by tests)

## Database

Seven normalized tables:

```
users ──< sessions
  │
  ├──< companies ──< contacts
  │        │
  └──< applications ──< interviews
             │
             └──< status_history
```

- `applications.company_id` references `companies`, so company details live in one place
- `status_history` is append-only and written in the same transaction as the status update
- `CHECK` constraints enforce valid statuses, interview outcomes and `salary_min <= salary_max`
- Foreign keys use `ON DELETE CASCADE`, so deleting a user or company cleans up after itself

Migrations are plain SQL files in [`server/src/db/migrations`](server/src/db/migrations), applied in order by a small runner that tracks them in a `schema_migrations` table.

## Performance

I seeded the database with 500 users and 200,000 applications (`npm run seed -- --bulk`) and measured with `npm run benchmark`:

| What | Before | After | Change |
| --- | --- | --- | --- |
| Application list + status counts query | 176.65 ms | 2.38 ms | **98.6% faster** with composite indexes |
| `GET /api/stats` response time | 15.22 ms | 0.65 ms | **95.7% faster** with per-user caching |

- **Indexes:** every query is scoped to a single user, so the composite indexes lead with `user_id` (`(user_id, status)` and `(user_id, applied_on DESC)`). Without them Postgres does a sequential scan of the whole table for each request.
- **Caching:** dashboard stats run three aggregate queries. The result is cached per user in memory and cleared whenever that user creates, updates or deletes something, so it's never stale. The response carries an `X-Cache: HIT/MISS` header.

The benchmark drops the indexes inside a transaction and rolls back afterwards, so it's safe to run against a dev database. Your numbers will vary with hardware.

## Running it locally

You need Node.js 22.18+ and PostgreSQL 14+.

```bash
git clone https://github.com/shucab-lane/jobtrail.git
cd jobtrail
npm run install:all
```

Create the databases:

```bash
psql -U postgres -c "CREATE DATABASE jobtrail;" -c "CREATE DATABASE jobtrail_test;"
```

Copy `server/.env.example` to `server/.env` and fill in your Postgres password, then:

```bash
npm run migrate --prefix server
npm run seed --prefix server
```

Start the API and the frontend in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Open http://localhost:5173 and log in with `demo@jobtrail.dev` / `demo1234`.

### Tests

```bash
npm test
```

The API tests run against `TEST_DATABASE_URL` and start a real server, so they cover routing, validation, auth and SQL together. CI runs them on every push against a Postgres 16 container.

### Production build

```bash
npm run build
npm start
```

Express serves the built React app and the API from the same port (4000 by default).

## API

All routes except auth require a session cookie. Bodies are JSON.

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and log in |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/applications` | List (`?status=&q=&sort=&page=&limit=`) |
| POST | `/api/applications` | Create (takes `company_id` or `company_name`) |
| GET | `/api/applications/:id` | Details, interviews and history |
| PATCH | `/api/applications/:id` | Update any fields |
| DELETE | `/api/applications/:id` | Delete |
| POST | `/api/applications/:id/interviews` | Add an interview |
| PATCH | `/api/applications/:id/interviews/:interviewId` | Update an interview |
| DELETE | `/api/applications/:id/interviews/:interviewId` | Remove an interview |
| GET | `/api/companies` | List with application counts |
| POST | `/api/companies` | Create |
| GET | `/api/companies/:id` | Details, contacts and applications |
| PATCH | `/api/companies/:id` | Update |
| DELETE | `/api/companies/:id` | Delete (and its applications) |
| POST | `/api/companies/:id/contacts` | Add a contact |
| DELETE | `/api/companies/:id/contacts/:contactId` | Remove a contact |
| GET | `/api/stats` | Dashboard numbers (cached) |

## Project structure

```
server/
  src/
    db/migrations/   SQL migrations
    lib/             validation, sessions, password hashing, cache
    middleware/      auth and error handling
    routes/          one router per resource
    scripts/         migrate, seed, benchmark
  tests/             API and unit tests (Vitest)
client/
  src/
    components/      shared UI (forms, badges, layout)
    pages/           one component per route
    api.ts           typed fetch wrapper
    auth.tsx         auth context
```
