# Invoice Scanner & ZIP Generator (Next.js)

Clients sign in with a name and 10-digit Indian mobile number, photograph invoice pages, get scanner-style cleaned pages, build one PDF per invoice and send everything as a single ZIP. Admins manage clients, submissions and website content from a browser dashboard.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma · Vercel Blob (private) · pdf-lib · JSZip. No PHP, XAMPP or Apache.

## How it works
1. Client signs in (`/`). Unknown name + mobile pairs are created on first use (no registration page, no OTP).
2. On `/upload` the browser scans each page: edge detection (OpenCV.js, optional), draggable corners, perspective correction, filters, rotation, brightness/contrast. Pages are JPEGs kept in memory.
3. **Upload All** sends pages one at a time (each under Vercel's 4.5 MB body limit) to `/api/submissions/[id]/pages`, then the server builds one PDF per invoice and one ZIP (`submission_YYYY_MM_DD_001.zip`) and stores them in private Blob storage. A failed upload can be retried without re-sending pages that already arrived.
4. Files are only served through `/api/files/[id]`, which checks that the signed-in client owns the file (admins can open all).

## Requirements
- Node.js 20.9 or newer (`node -v`)
- A PostgreSQL database (Neon, Supabase, Vercel Postgres, or local)
- For production: a **private** Vercel Blob store

## Local setup (Windows 11 + VS Code)
```powershell
npm install
copy .env.example .env
```
Edit `.env`:
- `DATABASE_URL` and `DIRECT_URL`: your PostgreSQL connection string (same value for both if you have only one).
- `AUTH_SECRET`: run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` and paste the output.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (min 10 characters).
- `BLOB_READ_WRITE_TOKEN`: leave empty in development. Files are then stored in `.local-storage/` (never used in production).

Then:
```powershell
npx prisma db push       # creates the tables
npm run admin:create     # creates the admin account
npm run dev              # http://localhost:3000
```
Admin dashboard: `http://localhost:3000/admin`.

Local PostgreSQL quick option: install PostgreSQL, create a database `invoice_scanner`, and use
`postgresql://postgres:YOURPASSWORD@localhost:5432/invoice_scanner` for both variables.

Other commands: `npm run typecheck`, `npm run lint`, `npm run build`, `npm start`, `npm run db:studio`.

## Deploy on Vercel
1. Push the project to GitHub (`.env` is git-ignored).
2. Vercel → **Add New Project** → import the repository.
3. **Storage → Create → Blob**, choose **Private**, connect it to the project. `BLOB_READ_WRITE_TOKEN` is added automatically. (The access mode of a store cannot be changed later.)
4. Add a PostgreSQL database (Storage → Neon/Supabase integration). Set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in Environment Variables.
5. Add `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
6. Deploy. The `vercel-build` script runs `prisma db push` and creates the admin if it does not exist. Afterwards **delete `ADMIN_PASSWORD`** from Vercel.

To reset an admin password: set `ADMIN_RESET_PASSWORD=true` plus a new `ADMIN_PASSWORD`, redeploy once, then remove both.

## Admin panel
- **Dashboard:** totals, processing status, recent clients and submissions.
- **Clients:** search, details, history, disable/enable, delete (removes all their files).
- **Submissions:** search, date and status filters, view invoices and pages, download PDFs/ZIP, delete.
- **Invoices:** view pages, download, delete (the ZIP is rebuilt).
- **Website content (CMS):** Announcements, Projects, Services, About, Contact. Add/edit/delete, image upload, draft/published, ordering. Public feed: `GET /api/content/<collection>`. Announcements show on the sign-in page and client dashboard. To add another content type, add one entry in `lib/cms.ts`.

## Limits
50 invoices per submission, 100 pages per invoice, 500 pages per submission, 4 MB per page image (compressed automatically), 30 MB per source photo.

## Troubleshooting
- **`AUTH_SECRET is missing`**: set it (32+ characters) and restart.
- **Prisma cannot connect**: check `DATABASE_URL`; add `?sslmode=require` for cloud databases.
- **`prisma db push` hangs on Vercel/Neon**: make sure `DIRECT_URL` is the non-pooled string.
- **Uploads fail with 413**: a page image is above 4 MB after compression; retake at lower resolution.
- **Files missing in production**: the Blob store must be connected and **private**.
- **Automatic edge detection unavailable**: OpenCV.js loads from docs.opencv.org; if blocked you can still drag corners manually.
- **Camera does not open**: mobile browsers need HTTPS (Vercel provides it); on desktop use "Choose from device".
