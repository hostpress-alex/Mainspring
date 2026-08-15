# Database: MongoDB or MariaDB

The server can do both. A single environment variable decides which one is
used:

```
DB_DRIVER=mongo      # default
DB_DRIVER=mariadb
```

The rest of the application never notices. Behind the switch sit two
implementations of the same storage layer:

| Area | MongoDB | MariaDB |
|---|---|---|
| Boards | `api/board/board.repo.mongo.js` | `api/board/board.repo.sql.js` |
| Users | `api/user/user.repo.mongo.js` | `api/user/user.repo.sql.js` |
| Calendar | `api/schedule/schedule.repo.mongo.js` | `api/schedule/schedule.repo.sql.js` |
| Uploads | `services/file.repo.mongo.js` | `services/file.repo.sql.js` |

The files without a suffix (`board.repo.js` and friends) only pick one.

> Anyone extending one of these files has to extend its counterpart as well.
> Otherwise switching back stops working.

That rule is checked now, so it cannot rot unnoticed: `test/repo-parity.test.js`
compares the exported names of every pair and fails once they have drifted
apart. Run it with `npm test` in the `backend` folder.

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
DB_DRIVER=mariadb
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

## 2. Taking existing data across from MongoDB

First look at what would happen — this run writes nothing:

```
npm run db:import:dry
```

It also reports what will **not** come across: users with an unusable id,
boards without an owner, calendar entries pointing at deleted boards.

If the result looks right:

```
npm run db:import
```

If the target already holds data the script stops. `node scripts/migrate-to-mariadb.js --force`
empties the tables first — **that deletes everything in MariaDB**.

What happens along the way:

* Ids are preserved. The ObjectId `66f1…` becomes the string `66f1…`, which is
  why existing links and bookmarks keep working.
* The old single `ownerId` field becomes a row in `board_member` with
  `is_owner = 1`.
* Boards without `columns` get their columns from `cmpsOrder` — derived once
  and stored for good, instead of being rebuilt on every read.
* Activities are trimmed to the last 40, same as during normal operation.
* References to uploaded files come across. The files themselves live under
  `backend/uploads/` and are not touched.

---

## 3. Starting

```
npm run start:mariadb        # same as DB_DRIVER=mariadb npm start
npm start                    # uses whatever is in .env
```

The helper scripts follow the same switch:

```
ADMIN_USER=alex ADMIN_PASS='…' ADMIN_NAME='Alex' npm run seed:admin
OWNER=alex npm run claim:boards
npm run seed            # demo boards, only into an empty database
```

`seed:admin` is also how a forgotten password gets reset.

Back to MongoDB: set `DB_DRIVER` to `mongo` again. The migration does not
touch the MongoDB data, it is still sitting there unchanged.

---

## 4. Access with DBeaver

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

## 5. How the data is laid out

```
user            users (password as a bcrypt hash)
board           a board's header data
board_member    who belongs to it, is_owner = may administer
board_column    a board's columns, in their order
board_group     a board's groups
task            one task; title and order as real columns,
                the column values in col_values (JSON)
task_member     who the task is assigned to
task_comment    updates/comments on a task, parent_id = a reply
activity        history, capped at 40 entries per board
schedule        users' calendar entries
file            upload metadata; the files themselves still live
                under backend/uploads/ on disk
```

Migrations, in order:

| File | What it adds |
|---|---|
| `20260814_000001_init.js` | every table above except `file` |
| `20260814_000002_file.js` | `file` — metadata for uploads |
| `20260815_000003_comment_parent.js` | `task_comment.parent_id` — replies to updates |
| `20260815_000004_file_name.js` | `file.original_name` — the name as uploaded |

**Why `col_values` is JSON.** A board's columns are freely configurable —
status, priority, date, custom text and number columns. Adding a table column
for every new kind would not work, and storing each value as its own row makes
reading a board expensive and the view in DBeaver unreadable. Hence:
everything you search and sort by is a real column; the free-form values sit
together as JSON.

Assignments to people are deliberately **not** in the JSON but in
`task_member` — "which tasks does person X have" is a query you really need.

**Replies are one level deep.** A comment carrying a `parent_id` is a reply to
the comment with that id. Deliberately not deeper — nobody reads replies to
replies afterwards. There is no foreign key onto itself, because the comments
of a task are written in one go (delete all, insert all) and the order within
that transaction must not matter.

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

## 6. What changes in practice

**Better:**

* Moving a task into another group is one transaction. On MongoDB without a
  replica set it had to insert first and remove afterwards — if it broke in
  between, the task stood there twice.
* Changing individual fields locks the task row. Two people setting different
  columns of the same task at the same time no longer overwrite each other.
* Deleting a board takes its groups, tasks, comments, memberships and calendar
  entries with it. Orphaned calendar entries used to be left behind.

**Worth knowing:**

* Reading a board is seven queries now instead of one. The board overview also
  loads all tasks of all boards while doing so — that was the same on MongoDB,
  but it will start to show eventually. When the overview turns sluggish, this
  is the place.
* `col_values` is not indexed. Filtering on a status value across all boards
  works, but it is a full pass. A generated column with an index can be added
  for that if it ever matters.
* There is still no version number per task. Two people typing the same task
  title at the same moment still overwrite each other — only now field by
  field instead of board-wide.

---

## 7. Who is allowed to read what

Access control lives in `api/board/board.service.js`: `hasAccess` (owner,
member or admin) and `isOwner` (owner or admin). Both are covered by
`test/board-access.test.js`, including boards from before the multi-owner
change, which carry a single `ownerId` field instead of an `ownerIds` array.

The real-time layer asks those same two functions. Until recently it asked
nobody at all: a socket named the room it wanted and got it, so anyone who
knew or guessed a board id received that board's contents. Joining a board
room now needs the same access the REST API demands, and a socket's identity
comes from the `loginToken` cookie instead of from what the client claims
about itself. The file comment in `services/socket.service.js` has the detail.

One gap is deliberately still open and documented there: `board-send-update`
relays a board that the *client* composed. Closing it means emitting from the
service layer after each write instead of relaying between browsers.
