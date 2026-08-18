# Database

MariaDB, reached through knex. Nothing above `*.repo.js` knows that: the
service layer asks the repository, the repository is the only place that knows
what a row looks like.

| Area | File |
|---|---|
| Boards, groups, tasks, activities | `api/board/board.repo.js` |
| Users | `api/user/user.repo.js` |
| Calendar | `api/schedule/schedule.repo.js` |
| Uploads | `services/file.repo.js` |

This ran on MongoDB until August 2026, and for a while on both at once behind
a `DB_DRIVER` switch — that is how the move happened without a big-bang
cutover. Once MariaDB was the only one in use, carrying a second
implementation of every repository cost more than it returned, so the MongoDB
half is gone. The history is in git if you ever need it.

---

## 1. Setting up MariaDB (locally, ServBay)

1. Start the **MariaDB** service in ServBay (default port 3306).
2. Create the database and the user — once, for example through the ServBay
   terminal or directly in DBeaver as `root`:

```sql
CREATE DATABASE projectmanager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'projectmanager'@'localhost' IDENTIFIED BY 'A-PASSWORD-HERE';
GRANT ALL PRIVILEGES ON projectmanager.* TO 'projectmanager'@'localhost';
FLUSH PRIVILEGES;
```

3. Create a `.env` file in the `backend` folder (or set the variables some
   other way):

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=projectmanager
MYSQL_PASSWORD=A-PASSWORD-HERE
MYSQL_DB=projectmanager
```

> `127.0.0.1` rather than `localhost`: otherwise Node may go through IPv6
> while MariaDB only listens on IPv4.

4. Install the dependencies and create the tables:

```
cd backend
npm install
npm run db:migrate
```

`db:migrate` creates every table and remembers in `knex_migrations` what has
already run. Calling it a second time does nothing.

The server refuses to start while a migration is missing. That is deliberate:
a server running on half a schema still reads fine and only fails at one
particular button, which is miserable to track down later.

---

## 2. Starting

`npm run dev` in the project root starts the server along with the frontend.
Backend on its own: `npm start` in `backend/`.

Helper scripts:

```
ADMIN_USER=alex ADMIN_PASS='…' ADMIN_NAME='Alex' npm run seed:admin
OWNER=alex npm run claim:boards
npm run seed            # demo boards, only into an empty database
```

`seed:admin` is also how a forgotten password gets reset.

---

## 3. Access with DBeaver

New connection → **MariaDB**:

| Field | Value |
|---|---|
| Server Host | `127.0.0.1` |
| Port | `3306` |
| Database | `projectmanager` |
| User | `projectmanager` |
| Password | as assigned above |

On the first connection DBeaver offers to download the driver — accept.

On a Linux server MariaDB should ideally **not** listen to the outside world.
Go through an SSH tunnel instead: fill in the server on DBeaver's *SSH* tab
and keep `127.0.0.1` as the host.

---

## 4. How the data is laid out

```
user            users (password as a bcrypt hash), language = the
                interface language, '' = whatever the browser says,
                state = active/inactive — accounts are switched off, never
                deleted
board           a board's header data
board_member    who belongs to it, role = owner/editor/viewer
                (is_owner is kept in step and is on its way out),
                state = active/inactive — a former member keeps the row
board_column    a board's columns, in their order
board_group     a board's groups
task            one task; title and order as real columns,
                the column values in col_values (JSON)
task_member     who the task is assigned to
task_comment    updates/comments on a task, parent_id = a reply
activity        history, capped at 40 entries per board
schedule        users' calendar entries
notification    one row per recipient per event, with a read state
task_subscription  who wants to hear about a task; muted = the explicit no
file            upload metadata; the files themselves still live
                under backend/uploads/ on disk
session         one row per signed-in browser; the id is the SHA-256 of
                the value in the cookie
automation      per board: when this happens, do that
automation_run  what a rule did, capped at 200 entries per board
board_view      a tab on a board: which rows, which drawing, who sees it
```

Migrations, in order:

| File | What it adds |
|---|---|
| `20260814_000001_init.js` | every table above except `file` |
| `20260814_000002_file.js` | `file` — metadata for uploads |
| `20260815_000003_comment_parent.js` | `task_comment.parent_id` — replies to updates |
| `20260815_000004_file_name.js` | `file.original_name` — the name as uploaded |
| `20260815_000005_drop_cmps_columns.js` | drops `board.cmps_order` and `board.cmps_option` |
| `20260815_000006_notifications.js` | `notification` and `task_subscription` |
| `20260816_000007_subtasks.js` | `task.parent_id` — a task below a task |
| `20260816_000008_group_icon.js` | `board_group.icon` — one emoji before the title |
| `20260816_000009_roles.js` | `board_member.role` and `board_group.created_by` |
| `20260816_000010_user_language.js` | `user.language` — the interface language of an account |
| `20260816_000011_comment_pinned.js` | `task_comment.pinned_at` — an update pinned to the top |
| `20260816_000012_automations.js` | `automation` and `automation_run` — rules and what they did |
| `20260816_000013_lifecycle.js` | `state` on board, group and task — bin and archive |
| `20260816_000014_people_state.js` | `state` on user and board_member — switched off, not deleted |
| `20260816_000015_drop_name_copies.js` | drops the copied names and pictures, adds foreign keys onto `user` |
| `20260816_000016_session_epoch.js` | `user.sessions_valid_from` — sign out everywhere |
| `20260816_000017_file_board.js` | `file.board_id` — who may download an upload |
| `20260816_000018_sessions.js` | `session` — the cookie stops being a credential you can mint |
| `20260816_000019_board_views.js` | `board_view` — a filter with a name, shared with the board |
| `20260817_000020_view_tabs.js` | `board_view.display` and `.visibility` — a saved filter becomes a tab |

**Why `col_values` is JSON.** A board's columns are freely configurable —
status, priority, date, custom text and number columns. Adding a table column
for every new kind would not work, and storing each value as its own row makes
reading a board expensive and the view in DBeaver unreadable. Hence:
everything you search and sort by is a real column; the free-form values sit
together as JSON.

Assignments to people are deliberately **not** in the JSON but in
`task_member` — "which tasks does person X have" is a query you really need.

**A saved filter is JSON, on purpose.** `board_view.rules` is a list of
`{field, operator, value}` that is read whole, written whole and never
searched. Rule rows in their own table would buy nothing and cost three joins
to answer a question nobody asks.

**One row is one tab.** A `board_view` carries both halves of a way of
looking: `rules` + `mode` say which rows, `display` says which drawing —
table, kanban or dashboard. `mode` is *not* that: it is `all` or `any`, and
says whether every rule has to match or just one. Two questions, two columns.
The three tabs everybody has — the whole board as a table, as a kanban, as a
dashboard — are not rows at all; a view with no rules needs no storage.

**Private until somebody shares it.** `visibility` is `private` or `board`.
A chip inside a filter panel could be shared with everybody harmlessly; a tab
across the top of the board cannot, and a strip that fills up with everybody
else's tabs is unusable within a week. Which rows come back is decided in the
query (`visibility = 'board' OR created_by = me`), never by trimming a full
list afterwards. Sharing needs write rights on the board. Changing a tab is
the creator's right; an owner may additionally clear up **shared** ones, and
deliberately not somebody's private ones.

The filter somebody currently has set is **not** in here: that lives in their
browser, per board *and per tab*. Only the ones that get a name reach the
server.

**Replies are one level deep.** A comment carrying a `parent_id` is a reply to
the comment with that id. Deliberately not deeper — nobody reads replies to
replies afterwards. There is no foreign key onto itself, because the comments
of a task are written in one go (delete all, insert all) and the order within
that transaction must not matter.

**Notifications are fanned out on write.** One row per recipient, rather than
working out on read who should see an activity. It costs a few rows and buys a
read state per person — which the other way round cannot have without storing
"seen up to here" per user and giving up marking a single entry read.

**A subscription can be muted rather than deleted.** A deleted row cannot be
told apart from never having subscribed, so the next assignment would sign the
user up again to the thing they just switched off.

**An upload belongs to a board.** `GET /api/upload/:id` asked for a login and
nothing else: any signed-in person holding an id got the file, whatever board
it came from. The ids are random, which is not a permission — a URL noted down
before somebody was taken off a board went on working. `file.board_id` is
written when the file is saved and checked when it is served; a file with no
board (profile pictures live in this table too) stays open to anybody signed
in. It is written rather than looked up through `task_id`, because a task's key
is (board_id, id) and a lookup by task id alone is unique only by luck.

**Boards are pushed by the server, not relayed between browsers.** Every write
in board.service.js reads the board back and emits it to the board's room
(`_pushed`). The old `board-send-update` let a client hand the others its own
idea of a board, unverified — and, more often than that mattered, whoever
happened to save decided what everybody else saw, filter and all.

**The cookie is not a credential anybody can mint.** It used to BE the user
record, encrypted with SECRET1 — whoever knew that key could write
`{_id: "<an admin's id>"}`, encrypt it and be that admin. Every guard put
around it (an age, a revocation date, rights read from the row) was a condition
ON that credential and helped only against a stolen one.

The cookie now carries 32 random bytes that mean nothing by themselves; the
session is a row in `session`. Stored is the SHA-256 of the value, so a copy of
that table is not a set of working cookies — the same reason a password column
holds a hash. There is no key left to leak: **SECRET1 grants nothing**, and the
start-up check for it is gone with it.

Signing out is a DELETE. `user.sessions_valid_from`, added two hours earlier as
the poor man's version of exactly this, is dropped in the same migration.
Sessions expire 30 days after they were last used, pushed out on use and
written at most every five minutes.

*Everybody signs in once more after this deploy: the old cookies name no row.*

**The cookie says who, the database says what they may.** The login token
carries `_id`, `fullname` and `isAdmin`, and until now nothing looked further —
so an account switched off went on working until the browser was closed, and
revoked admin rights lasted just as long. `requireAuth` now reads the row
(services/account.service.js, cached ten seconds) and takes the rights from
there. Ten seconds is the honest wording of the guarantee, and it is a
different sentence from "until they next sign in".

**A name is never copied, only looked up.** Every table that records who did
something stores an id and nothing else; the name and the picture are filled in
when a board is read (`enrichPeople` in board.service.js, `withPeople` in
notification.service.js). The copies that used to sit beside the ids aged: one
person could show four different faces on one screen, because `board_member`
was refreshed on read and the other four places were not.

**That works because accounts are never deleted.** `user.state` is
active/inactive, and `board_member.state` the same. The copies only ever
existed because an id could end up pointing at nothing — with the delete gone,
so is the reason. Since `20260816_000015` the five author columns carry a real
foreign key onto `user` with ON DELETE SET NULL, so the rule is the database's
and not a comment's.

**`board_member.state` is a permission column, not a display one.** A row left
behind by somebody taken off a board is indistinguishable from a member except
for this, so every query asking "which boards is this person on" filters it,
and `board.roles.js` refuses an inactive member a role even if a board reaches
it from somewhere that forgot.

**Nothing is deleted any more, it is moved.** `state` on `board`,
`board_group` and `task` holds `active`, `archived` or `trashed`, with
`state_at` and `state_by` beside it. One column rather than two flags and one
mechanism rather than a separate archive: every read on a board filters by
this, and two conditions in every query is two chances to write only one.

**There is no cascade, and that is the point.** A row counts as visible when it
AND all of its parents are active — worked out when reading, not written down.
Restoring a group therefore brings its tasks back without a record of "these
went along with it" that would have to survive the third restore, and a task
somebody threw away by itself stays thrown away.

**The trap: `syncGroupTasks` and `syncSubtasks` delete whatever the client did
not send.** A row in the bin is never in what the client sends, so both of them
scope their "what is gone" query to `state = 'active'`. Without that the bin
empties itself at unpredictable moments, days later, silently. There is a test
that reads those two functions for the filter, because a machine without
MariaDB cannot reach the failure any other way.

**Not called `archived_at`.** That name is taken on `board` and
`task_comment`, where it means when the row was CREATED — the board info dialog
prints it under "created at".

**An automation runs as the person who wrote it.** `automation.created_by` is
not decoration: whoever trips a rule may be a viewer, and the rule still has to
be allowed to move the task. The rights come from the rule's author, which is
also why the interface shows a face next to every rule.

**A rule fires at most once per chain, and a chain is at most three deep.**
Two reasonable rules can point at each other — status sets group, group sets
status — and each turn would write, wake every client and add an activity. Three
things stop it: an action that would change nothing is not written at all, a
rule that has already fired in this chain is refused, and the chain itself is
cut at `MAX_DEPTH`. All three land in `automation_run` when they bite, because
"my rule did not fire" needs an answer.

**The language belongs to the account, not the browser.** localStorage still
holds a copy, because the interface has to choose a language before React
renders and before any request has come back — without the copy every page
would appear in the wrong language first and correct itself. The column is the
truth, the copy is written at login and whenever the profile is saved.

**Uploaded files keep two names.** On disk a file is named after its id, which
is unique; `original_name` holds what it was called when it was uploaded, so a
download produces `offer.pdf` rather than `a1b2…f9.pdf`.

### A few queries for DBeaver

All tasks of a board with their group and status:

```sql
SELECT g.title AS grp, t.position, t.title,
       JSON_VALUE(t.col_values, '$.status')   AS status,
       JSON_VALUE(t.col_values, '$.priority') AS prio,
       JSON_VALUE(t.col_values, '$.dueDate')  AS due
FROM task t
         JOIN board_group g ON g.board_id = t.board_id AND g.id = t.group_id
WHERE t.board_id = '…'
ORDER BY g.position, t.position;
```

Who is working on what:

```sql
SELECT u.fullname, b.title AS board, t.title AS task
FROM task_member tm
         JOIN user  u ON u.id = tm.user_id
         JOIN task  t ON t.board_id = tm.board_id AND t.id = tm.task_id
         JOIN board b ON b.id = t.board_id
ORDER BY u.fullname, b.title;
```

Who may do what:

```sql
SELECT b.title, u.fullname, IF(bm.is_owner, 'Owner', 'Member') AS role
FROM board_member bm
         JOIN board b ON b.id = bm.board_id
         LEFT JOIN user u ON u.id = bm.user_id
ORDER BY b.title, bm.is_owner DESC, u.fullname;
```

Planned hours per person and week:

```sql
SELECT u.fullname, YEARWEEK(s.start_at, 3) AS week,
       ROUND(SUM(TIMESTAMPDIFF(MINUTE, s.start_at, s.end_at)) / 60, 1) AS hours
FROM schedule s
         JOIN user u ON u.id = s.user_id
GROUP BY u.fullname, week
ORDER BY week DESC, u.fullname;
```

---

## 5. What this costs and what it buys

**What the database does for you:**

* Moving a task into another group is one transaction, so it can never end up
  in two groups or none.
* Changing individual fields locks the task row, so two people setting
  different columns of the same task do not overwrite each other.
* Deleting a board takes its groups, tasks, comments, memberships and calendar
  entries with it. No orphans to clean up later.

**What it does not:**

* Reading one board is seven queries. The board overview loads all tasks of
  all boards while it is at it. Fine at this size; when the overview turns
  sluggish, this is the place to look.
* `col_values` is not indexed. Filtering on a status value across all boards
  works, but it is a full pass. A generated column with an index can be added
  for that if it ever matters.
* There is still no version number per task. Two people typing the same task
  title at the same moment still overwrite each other — only now field by
  field instead of board-wide.

---

## 6. Who is allowed to read what

Access control lives in `api/board/board.service.js`: `hasAccess` (owner,
member or admin) and `isOwner` (owner or admin), both covered by
`test/board-access.test.js`. Ownership itself is a row in `board_member` with
`is_owner = 1` — there is no owner field on the board.

The real-time layer asks those same two functions. Until recently it asked
nobody at all: a socket named the room it wanted and got it, so anyone who
knew or guessed a board id received that board's contents. Joining a board
room now needs the same access the REST API demands, and a socket's identity
comes from the `loginToken` cookie instead of from what the client claims
about itself. The file comment in `services/socket.service.js` has the detail.

One gap is deliberately still open and documented there: `board-send-update`
relays a board that the *client* composed. Closing it means emitting from the
service layer after each write instead of relaying between browsers.
