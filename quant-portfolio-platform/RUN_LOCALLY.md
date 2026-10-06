# Running Quant Portfolio on your own computer

You do not need any API keys. Out of the box the app uses a built-in market-data
generator and a SQLite database file, so it runs fully offline once installed.

## 1. Install two things (once)

| Tool | Version | Where to get it |
|---|---|---|
| Python | 3.11 or newer | <https://www.python.org/downloads/> (on Windows, tick **"Add python.exe to PATH"** in the installer) |
| Node.js | 20 or newer (LTS) | <https://nodejs.org/> |

Check they work in a new terminal:

```bash
python --version     # macOS may need: python3 --version
node --version
```

## 2. Unzip and open a terminal in the folder

Unzip `quant-portfolio-platform.zip`, then open a terminal **inside** the
`quant-portfolio-platform` folder (the one that contains `README.md`).

- Windows: open the folder in File Explorer, click the address bar, type `powershell`, press Enter.
- macOS: right-click the folder in Finder → **New Terminal at Folder**.

## 3. Start the backend (terminal 1)

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd backend
uvicorn app.main:app --reload --port 8000
```

**Windows (PowerShell)**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
cd backend
uvicorn app.main:app --reload --port 8000
```

If PowerShell refuses to run `Activate.ps1`, run this once and try again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

The first start builds the database and generates about ten years of prices
(roughly 15 seconds). It is ready when you see `Application startup complete`.
Leave this terminal open.

## 4. Start the website (terminal 2)

Open a second terminal in the same `quant-portfolio-platform` folder:

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3000>.

- **Try the live demo** gives you a throwaway guest account with a sample portfolio.
- **Create an account** works too. With no email server configured, the
  verification link is shown on screen instead of being emailed.
- The API's own docs are at <http://localhost:8000/docs>.

Next time, you only need step 3's last two lines (after activating the venv)
and `npm run dev`; the installs are one-off.

## 5. Settings and keys (all optional)

Nothing below is required for local use. To change a setting, copy
`.env.example` to `.env` in the same folder and edit it:

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

| Setting | Needed when | What to put |
|---|---|---|
| `JWT_SECRET` | You host the app for other people (`APP_ENV=production`) | A long random string: `python -c "import secrets;print(secrets.token_urlsafe(48))"`. Locally one is generated for you and stored in `backend/data/.jwt_secret`. |
| `DATA_SOURCE=yahoo` | You want real market prices instead of the generator | No key needed; it uses the free Yahoo Finance data via `yfinance` (already installed by step 3). Delete `backend/data/app.db` and restart the backend so it reloads prices. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | You want verification and password-reset emails actually sent | Your email provider's SMTP details (for Gmail, an **app password**, not your normal password). |
| `REQUIRE_EMAIL_VERIFICATION=false` | You want to skip the email step entirely | — |
| `DATABASE_URL` | You want PostgreSQL / Supabase instead of the SQLite file | e.g. `postgresql://user:password@host:5432/dbname`, then `pip install -e ".[postgres]"` |

Never commit or share your `.env`; it is already in `.gitignore`.

The app never asks for, and has nowhere to store, brokerage logins. You type
your holdings in yourself.

## Alternative: Docker

If you have Docker Desktop installed, this runs PostgreSQL, the API and the
website together with no Python or Node install:

```bash
cp .env.example .env          # Windows: copy .env.example .env
docker compose up --build
```

Then open <http://localhost:3000>.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `python` not found on Windows | Reinstall Python with **Add python.exe to PATH** ticked, or use `py` instead of `python`. |
| Port 3000 or 8000 already in use | Stop the other program, or pick other ports. For the backend: `uvicorn app.main:app --reload --port 8001`, then start the website with `API_URL` pointing at it (macOS: `API_URL=http://localhost:8001 npm run dev`; PowerShell: `$env:API_URL="http://localhost:8001"; npm run dev`). For the website: `npx next dev -p 3001`, and add `FRONTEND_URL=http://localhost:3001` to `.env`, then restart the backend, otherwise saving and running analyses is refused. |
| The website says "The analytics service is not reachable right now" | The backend terminal isn't running, or is still on first-start setup. |
| You want a fresh start | Stop the backend and delete `backend/data/app.db`. |

## Running the tests (optional)

```bash
pytest                         # backend and engine, from the project folder with the venv active
cd frontend && npm test        # frontend unit tests
```
