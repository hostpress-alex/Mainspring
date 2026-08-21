# Mainspring

Board-based task management. A board has groups, a group has tasks, and a task
has whatever columns you gave the board: status, priority, dates, people,
numbers, files, plain text.

The name is the coiled spring that drives a mechanical clock — the part that
stores the effort and lets it out at a steady rate. It is written once, in
`frontend/src/constants/app.js`; everything else reads it from there.

It started as MyDay, a Monday.com clone someone built as a bootcamp project
(credits at the bottom). We've been rebuilding it since for our own use. The
layout and most of the Sass are still theirs; the data layer, the API and the
permission model are not.

## Running it

Once, to install everything:

```bash
npm install        # project root, for the wrapper
npm run setup      # installs backend/ and frontend/
```

Then, every day:

```bash
npm run dev
```

That starts both halves and prefixes their output with `api` and `web`. Open
http://localhost:3000.

It is also the restart. Before starting, `predev` clears anything still
holding 3000, 3001 or 3030 and waits until the ports are actually free —
killing is asynchronous, and binding a port half a second after the SIGTERM
gets you the `EADDRINUSE` you were trying to avoid. So you never have to stop
the old run first; just run it again.

One thing that surprises people: if the backend throws, the frontend keeps
running. Nodemon catches the crash and waits for you to fix the file, so from
`concurrently`'s point of view the process never died and `--kill-others`
never fires. That is the behaviour you want — fix the file and it restarts by
itself — but the api pane will be sitting on a stack trace while the page
still loads. Read the `api` lines, not the browser.

They are two processes in development and that is deliberate. Vite's dev
server is what gives you hot reload: it pushes a changed component into the
running page without a refresh, and compiles JSX and Sass on the way through.
Express handing out files cannot do any of that. In production there is
nothing left to compile, so the built frontend is static files and the Node
process serves them itself — one process there, two here.

To run them apart, when one is misbehaving and you want its output on its own:

```bash
cd backend  && npm start     # http://127.0.0.1:3030
cd frontend && npm start     # http://localhost:3000
```

Vite proxies `/api` and `/socket.io` to port 3030 so the browser only ever
talks to one origin. That saves us CORS exceptions and cross-site cookie
problems, and relative paths behave the same in dev as in production.

### When a port is stuck

`npm run dev` clears the ports by itself, so this should be rare. To stop
everything without starting it again:

```bash
npm run stop
```

That is `scripts/stop-ports.sh`. It works in three steps because there are
three different reasons a process will not go away, and only the last one
calls for force:

1. **TERM**, and its parent too when the parent is one of our supervisors.
   Killing only the listener is pointless when nodemon or concurrently is
   sitting above it handing you a fresh one.
2. **CONT then TERM**, for a process someone suspended with Ctrl-Z. A stopped
   process does not get to handle TERM until it runs again, so it looks like
   it is ignoring the signal.
3. **KILL**, which cannot be caught or deferred.

Between the steps it waits for the ports to be free *and stay* free — a
supervisor respawning leaves a gap of a few hundred milliseconds, and checking
once lands right in it and reports success just before the collision.

If it still fails it prints who is holding the port with the STAT column, and
`Z` there means a zombie: already dead, waiting to be collected by its parent.
You cannot kill those and they hold no ports, so if one turns up, whatever is
on the port is something else.

Find processes **by port, never by name**. `pkill -f vite` matches its own
command line and kills the shell you typed it into, and `pkill -x node` takes
down everything else you have running, which on this machine included the
Claude device bridge.

Plain `kill` sends TERM and lets the process shut down; `kill -9` skips that,
so the database pool never closes cleanly. Only reach for it when TERM is
ignored.

Watch for `Port 3000 is in use, trying another one...` in the `web` output.
Vite moves to 3001 rather than failing, so everything works and you spend ten
minutes wondering why your change is not showing — you are looking at the tab
on 3000, served by last session's leftover process.

The database is MariaDB. Setting it up, the schema, and a handful of useful
queries are in [DATABASE.md](DATABASE.md).

You'll need an account before anything is useful:

```bash
cd backend
ADMIN_USER=alex ADMIN_PASS='...' ADMIN_NAME='Alex' npm run seed:admin
```

Same command resets a password you've forgotten.

### Production

Build the frontend, then run the server with `NODE_ENV=production`. It serves
the build as static files, so there's only one port to expose.

```bash
cd frontend && npm run build
cd ../backend && npm run server:prod:mac
```

The server looks for the build in `frontend/build`, which is where Vite
writes it — `FRONTEND_BUILD` in `server.js`, used by both the static handler
and the single-page fallback. It is gitignored: output, not source.

It used to look in `backend/public`, which meant a build never landed where
the server read from and somebody copied the folder across by hand. Worse, a
react-scripts build from before the Vite move was committed there — 19.6 MB,
17 of them a sourcemap for code that no longer existed — and that was what
production actually served. Build output now stays with whoever builds it.

## Configuration

Environment variables, all of them. In dev a `.env` file in `backend/` is read
as well. It's not in the repo and shouldn't be.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3030` | |
| `MYSQL_*` | see `config/dev.js` | host, port, user, password, db |
| `ALLOWED_ORIGINS` | three localhost variants | comma separated. Applies to the API and the socket both. |
| `ALLOW_SIGNUP` | `true` | set `false` on anything reachable, or strangers will sign themselves up and see every board |
| `GUEST_MODE` | `false` | turns authentication off entirely. Debugging only. |
| `TRUST_PROXY` | `false` | set `true` behind a reverse proxy, otherwise every request looks like it comes from the proxy and the login limit treats the world as one visitor |
| `NODE_ENV` | | `production` serves the static build and marks the cookie secure |
| `UPLOAD_DIR` | `backend/uploads` | where uploaded files land on disk |
| `UPLOAD_MAX_BYTES` | 10 MB | the ceiling for one upload — `services/file.service.js`, not `config/` |
| `TIME_MAX_HOURS` | `8` | a forgotten timer is closed AT this cap, marked `auto`, rather than when somebody notices |
| `AUTOMATION_DELAY_MS` | `1000` | how long a rule waits before it acts, so a burst of edits does not become a burst of rules |
| `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_SA_KEY_FILE` | none | the service account for the read-only calendar mirror. Leave unset and the feature is simply off. |
| `GOOGLE_SYNC_MINUTES` | see `config/` | how often that mirror is refreshed |
| `SECRET1` | — | **reads nothing any more.** Kept in the table only so that an environment still setting it does not look broken. |

**The login cookie is not a credential you can mint.** It used to be: the
cookie *was* the user record, encrypted with `SECRET1`, so anyone holding that
key could write themselves an admin cookie without going near the database.
Since `000018_sessions` the cookie holds an opaque random token, the `session`
table stores its SHA-256, and the row is what grants anything. Knowing
`SECRET1` now grants nothing at all, which is why the server no longer refuses
to start without it.

## What it does

Boards with drag and drop for groups and tasks. Columns are per board and
come in sixteen kinds — status, dropdown, text, long text, date, deadline,
person, number, file, checkbox, link, tags, priority, estimate, created, last
updated. A status or dropdown column keeps its own label list, so the
priority menu doesn't offer you "Done" any more. Tags work the same way — a
vocabulary belonging to one board. Priorities went the other way on purpose:
one global scale, because a priority only means something if everyone agrees
what it is.

**Views are tabs.** Table, kanban and a statistics page are the three that
always exist; a filter you have set can be saved as a fourth, a fifth, with a
name. A tab carries both halves of a way of looking — which rows (the filter
rules) and which drawing — and is private until somebody deliberately shares
it with the board.

Tasks open into a detail modal with updates (one level of replies, emoji
reactions, and who has seen them), subtasks, file attachments, an activity log
and recorded time, all updating live while someone else edits.

**Time.** A timer per person, started from a task. One at a time, and starting
a second one asks what to do with the first rather than deciding for you.
Entries can be corrected and typed in by hand afterwards — that is what keeps
the totals believable. An estimate column and the recorded time together give
each task a "how far through it are we".

**Calendar and planner.** Month and week grids for scheduling tasks into time
slots per person, plus each person's working hours and, optionally, a
read-only mirror of their Google calendar so the planner does not schedule
over a meeting. The planner fills the free time with the tasks that are due,
marks everything it laid down as its own, and says which blocks are built on
an assumed duration rather than a real estimate.

**Automations** per board: when this happens, do that. A rule runs as the
person who wrote it, fires at most once per chain, and everything it did — or
refused to do — lands in a run log.

Also: a global search that only returns what you are allowed to see, a bin and
an archive with no cascade, notifications with a mute per task, and an HTTP
API with revocable tokens for callers that are not a browser (`API.md`).

Uploads go to disk under `backend/uploads/` with metadata in the database; we
keep the original filename around so downloads arrive as `offer.pdf` and not
`a1b2f9.pdf`. A download is checked against the board the file belongs to, not
just against being signed in. A task has a **files tab** listing everything
ever uploaded to it, with where each one is still used — under an update,
inside the text of one, or as a file column — and, separately, the ones
nothing points at any more, which can be deleted there.

Login is username and password (bcrypt). Google sign-in was removed — it
fetched `googleapis.com` from a tool that only runs on the VPN and used the
Google account id as the password. A session is a **row in the database**, and
the cookie holds nothing but an opaque token, so knowing a secret is no longer
enough to mint one; signing out somewhere else really ends it. Boards have
owners, editors and viewers, and there is an admin page for users, teams,
boards, priorities and API tokens. Failed logins are counted per address and
per account, ten against one account or thirty across all of them inside
fifteen minutes and you get a `429` until the window passes. Note that this
bites even if you then remember the right password, since the limit is checked
before the password is.

Interface is German by default, English available. Everything user-facing sits
in `frontend/src/i18n/`. We didn't pull in an i18n library: one JSON file per
language and a `t()` function covers what fifteen people need. The language
belongs to the account, not to the browser.

## Code layout

```
backend/
  api/<area>/          controller | service | repo
    auth/  user/       accounts and login
    board/             boards, groups, tasks, activities, saved views
    automation/        rules per board (+ engine, which is pure)
    calendar/          the read-only Google mirror
    schedule/          calendar entries
    planner/           filling free time with what is due (+ core, triggers)
    time/              recorded working time
    workhours/         when each person works
    priority/          the one global scale
    notification/  seen/  reaction/    what happened to an update
    search/            one query, five permission-joined reads
    token/             API tokens
    upload/            files
  db/migrations/       MariaDB schema, numbered, additive
  middlewares/         auth, rate limit, async local storage
  services/            socket, files, sessions, logging, throttling
  test/                node:test — 28 files
  scripts/             seeding, admin, board ownership

frontend/src/
  cmps/                components by area
  pages/               one per route
  services/            http calls, helpers, pure logic
  customHooks/         the two shared ones
  constants/           the app name, and nothing else yet
  store/               redux
  i18n/                de.json | en.json | t()
  assets/styles/       sass, one partial per component
  test/                vitest — 12 files
  scripts/             check-exports, check-tdz, check-icons
```

Every backend area is the same three layers. Controller turns HTTP into a
call, service holds the rules and the permission checks, repo talks to the
database. Nothing above the repo knows what a row looks like, which is what
made swapping the storage engine out possible in the first place.

## Tests

```bash
npm test                 # both halves, each with its own runner
npm run test:api         # backend only  — node:test, no database, ~2s
npm run test:web         # frontend only — vitest
npm run test:log         # everything into test.log, last 30 lines printed
```

**Do not run `npx vitest` in the root.** The two halves use different runners,
and vitest's default search picks up the 28 `backend/test/*.test.js` files it
cannot run — pages of failures that have nothing to do with the code.

383 backend cases across 28 files: permissions and roles, the automation
engine, the planner and its triggers, sessions and token lifetimes, the login
throttle, the rate limit, lifecycle, search, socket rooms, time, work hours,
priorities, notifications. None of them need a database. On the frontend, 12
files covering the pure services — statistics, task progress, spans, relative
time, mentions, error routing, the reducer.

Two static checks beside the tests, both in `frontend/`:

```bash
npm run check            # all three of the below
npm run check:exports    # an imported name the target module does not export
npm run check:tdz        # a const read before its own line, inside a function
npm run check:icons      # an icon that only exists in Font Awesome Pro
```

The first two exist because those failures produce a **white page with nothing
in the console that names the file**, and the ordinary test suite is happily
green while the app does not start. The third catches an icon that renders as
an empty box for anyone without a Pro licence — development happens with Pro
installed, so nobody here would ever see it. The TDZ one is written to descend into a
nested function only where it is an argument to a call — i.e. where it runs
immediately, like a `useState(() => …)` initialiser — because that is the case
that bites and anything wider drowns it in noise.

No end-to-end tests. An older version of this file claimed Playwright
coverage. There has never been a Playwright config in this repo.

## What changed from the original

The big one is that writes are targeted now. Every change used to send the
whole board document back, so if two people had the same board open, whoever
saved second wiped out the first one's work. Now a change sends only what
changed. The three old whole-document `PUT` routes answer `410` and tell you
what to call instead.

Storage moved from MongoDB to MariaDB. It ran on both for a while, one
environment variable apart, which is how the move happened without a big-bang
switch — but carrying two implementations of every repository costs more than
it returns once you have picked one, so the Mongo half is gone. Frontend moved
from react-scripts to Vite, React 19, Vitest. Boards got owners and
members with actual enforcement on the server, not just hidden buttons.

The socket used to trust whatever a client told it. It announced a user id and
joined any room it named, so anyone who guessed a board id got that board's
contents pushed to them, logged in or not. Identity now comes from the login
cookie and joining a board's room takes the same permission the REST API asks
for.

New since the original, and none of it was in the bootcamp project: roles per
board, saved views as tabs, board filters, automations, a global search,
subtasks, a bin and an archive, notifications, rich text with mentions, time
tracking, working hours, a planner, an external calendar mirror, tags, one
global priority scale, reactions and seen-marks on updates, an HTTP API with
revocable tokens, calendar, admin page, file uploads with metadata, threaded
comments, translations.

Accounts and board memberships are switched off, never deleted. A person who
leaves keeps their row, so everything they wrote keeps its author instead of
turning into "Unknown" — which this project learned the hard way and spent two
migrations repairing.

## Rough edges

Listed here because they're easier to find in a README than in the code.

The login rate limit lives in memory. A restart clears it and a second process
would count separately. Fine for us, not fine for anything public — and the
trade-off is written into `services/login-throttle.service.js` rather than
left to be discovered.

Reading one board is several queries on MariaDB, and the board overview loads
every task of every board while it's at it. Fine at our size. It's the first
place to look when the overview gets slow. `col_values` is not indexed either,
so filtering on a status value across all boards is a full pass.

No version number per task, so two people typing a task title at the same
moment still clobber each other, just field by field now instead of the whole
board.

About 55 backend error messages are still hand-written sentences that the
frontend prints as they are. They are outside `i18n/`, and they are not even
all in one language — some German, some English. The shape they want is a
stable code the frontend maps to a key, which is a change on both sides in the
same breath.

`frontend/src/test/` cannot be run from a Linux shell against this checkout:
`rolldown` in `node_modules` is the macOS binary. Run the frontend tests on the
machine that installed them.

**Two things listed here for a long time are done and are kept as a note so
nobody fixes them twice.** Uploads are checked against the board the file
belongs to, not just against being signed in (`file.board_id`, written when the
file is saved, since a random id is not a permission). And `board-send-update`
is gone: every write in `board.service.js` reads the board back and emits that,
so the server no longer relays an object the browser assembled.

## Conventions

English everywhere. Names, comments, docs, commit messages.

Comments say why, not what. If a comment restates the line below it, delete
it.

User-facing text goes in `frontend/src/i18n/`, never inline in JSX.

Migrations are additive and numbered. Don't edit one that has already run.

## Credits

MyDay was built by [Idan David](https://github.com/idandavid1),
[Ofer Gavrilov](https://github.com/oferGavrilov) and
[Ofek Abramovitch](https://github.com/ofekAbramovitch).
