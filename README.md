# Project Manager

Board-based task management. A board has groups, a group has tasks, and a task
has whatever columns you gave the board: status, priority, dates, people,
numbers, files, plain text.

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

The server looks for the build in `backend/public`, which is gitignored. It's
output, not source. Until recently a react-scripts build from before the Vite
move was committed there instead: 19.6 MB, 17 of them a sourcemap for code
that no longer existed, and it was what production actually served.

One step is still open. Vite writes to `frontend/build`, so a build doesn't
land where the server looks for it. Either point `outDir` at
`../backend/public` in `frontend/vite.config.js`, or copy the folder across by
hand after building.

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
| `SECRET1` | none | encrypts the login cookie. **Required in production**, the server refuses to start without it. `openssl rand -hex 32` |
| `TRUST_PROXY` | `false` | set `true` behind a reverse proxy, otherwise every request looks like it comes from the proxy and the login limit treats the world as one visitor |
| `NODE_ENV` | | `production` serves the static build and marks the cookie secure |

The login cookie isn't a session id you look up in a table. It's the user
record itself, encrypted with `SECRET1`. Anyone holding that key can write
themselves an admin cookie without going near the database, which is why there
is no default value any more and why production won't boot without one. In
development you get a fallback named `insecure-development-key-do-not-use-in-production`
and a warning in the log.

## What it does

Boards with drag and drop for groups and tasks. Columns are per board, and
each status-style column keeps its own label list, so the priority menu
doesn't offer you "Done" any more.

Three views: table, kanban, and a statistics page with charts by label and by
member. Tasks open into a detail modal with comments (one level of replies),
file attachments and an activity log, all updating live while someone else
edits.

There's a calendar for scheduling tasks into time slots per person, month and
week grids. Uploads go to disk under `backend/uploads/` with metadata in the
database; we keep the original filename around so downloads arrive as
`offer.pdf` and not `a1b2f9.pdf`.

Login is username and password (bcrypt) or Google. Sessions live in an
httpOnly cookie. Boards have owners and members, and there's an admin page for
user management. Failed logins are counted per address and per account, ten
against one account or thirty across all of them inside fifteen minutes and
you get a `429` until the window passes. Note that this bites even if you then
remember the right password, since the limit is checked before the password
is.

Interface is German by default, English available. Everything user-facing sits
in `frontend/src/i18n/`. We didn't pull in an i18n library: one JSON file per
language and a `t()` function covers what fifteen people need.

## Code layout

```
backend/
  api/<area>/          controller | service | repo
    board/             boards, groups, tasks, activities
    user/  auth/       accounts and login
    schedule/          calendar
    upload/            files
  db/migrations/       MariaDB schema, numbered, additive
  middlewares/         auth, logging, async local storage
  services/            socket, files, logging, db connection
  test/                node:test
  scripts/             seeding, admin, board ownership

frontend/src/
  cmps/                components by area
  pages/               one per route
  services/            http calls, helpers
  store/               redux
  i18n/                de.json | en.json | t()
  assets/styles/       sass, one partial per component
```

Every backend area is the same three layers. Controller turns HTTP into a
call, service holds the rules and the permission checks, repo talks to the
database. Nothing above the repo knows what a row looks like, which is what
made swapping the storage engine out possible in the first place.

## Tests

```bash
cd backend  && npm test
cd frontend && npm test
```

Coverage is thin, and it's worth saying which parts are covered rather than
implying the rest is.

`board-access.test.js` covers who can see and administer a board, including
the old boards that carry a single `ownerId` instead of an `ownerIds` array.
`socket.service.test.js` covers pulling the login cookie out of a handshake.
On the frontend there's the statistics module and the user reducer.

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

New since the original: calendar, admin page, file uploads with metadata,
threaded comments, translations.

## Rough edges

Listed here because they're easier to find in a README than in the code.

The login rate limit lives in memory. A restart clears it and a second process
would count separately. Fine for us, not fine for anything public.

Uploaded files are only checked for "are you logged in", not for "is this file
from a board you're on". The ids are 32 hex characters so nobody is guessing
one, but anyone who learns an id can fetch it.

Reading one board is seven queries on MariaDB, and the board overview loads
every task of every board while it's at it. Fine at our size. It's the first
place to look when the overview gets slow.

`board-send-update` relays a board object that the *browser* assembled. The
server doesn't inspect it. The fix is to emit from the service layer after
each write instead of relaying between browsers, which nobody has done yet.

No version number per task, so two people typing a task title at the same
moment still clobber each other, just field by field now instead of the whole
board.

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
