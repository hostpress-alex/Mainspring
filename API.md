# Mainspring HTTP API

Everything the browser does goes through this API — the interface has no
private channel. What this document covers is the part meant for **callers that
are not a browser**: a script, a CI job, a monitor.

Nothing here is new behaviour for the application. What is new is a second way
to say who you are.

---

## 1. Before anything is reachable from outside

Read this part even if you skip the rest. The token scheme is only as good as
what stands in front of it.

- [ ] **TLS terminates before the app.** The token travels in a header on every
      call. Over plain HTTP it is readable by anything on the path, and a
      readable key is not a key.
- [ ] **Only `/api/**` is published.** Not the single page application, not
      `/socket.io`. An external caller has no use for either, and each is
      another surface.
- [ ] **`ALLOW_SIGNUP=false`.** Already the case on the server. A reachable
      instance with open sign-up hands out accounts.
- [ ] **`GUEST_MODE` is not set.** It switches authentication off for the whole
      application. It is for debugging on a machine nobody else can reach.
- [ ] **MongoDB and MariaDB stay bound to localhost.** Publishing the app does
      not mean publishing what is behind it.
- [ ] **The reverse proxy has its own rate limit.** The one in this application
      counts per token in one process's memory; it is a backstop against a
      loop, not a defence against somebody who wants in.

The application cannot check any of this for you, and none of it is code in
this repository. It is the part that has to be decided rather than written.

---

## 2. Two things to set once

Every example below uses these. Keep the token out of your shell history and
out of the command line — `ps` shows arguments to anybody on the machine, and
`~/.bash_history` keeps them for months.

```sh
export MS=https://mainspring.example.internal      # no trailing slash
export MS_TOKEN=$(cat ~/.config/mainspring/token)  # chmod 600, not in git
```

A `curl` habit worth having here: `-sS` for quiet-but-not-silent, `-f` so a
4xx/5xx actually fails the script, and `-D-` when you want the headers.

```sh
alias mscurl='curl -sS -H "Authorization: Bearer $MS_TOKEN" -H "Content-Type: application/json"'
```

---

## 3. Getting a token

Tokens belong to an **integration account** — an ordinary user that is a member
of exactly the boards the integration needs and nothing else. That is the whole
permission model: there is no scope column, because the boards list already
says what a key can reach, in a place people actually look.

Create the account like any other (admin → users), give it a role on the boards
it needs — `viewer` is enough to write updates, `editor` is needed to create
tasks — then mint a token:

    POST   /api/token/user/:userId     { "name": "CI", "ttlMs": 31536000000 }
    GET    /api/token/user/:userId
    DELETE /api/token/:tokenId

Admin only, and **session only**: these three routes refuse a token, because a
key that can mint keys cannot be revoked — you take one away and the two it
made are still there. The same applies to everything that changes a person
(creating users, passwords, sessions).

The answer to `POST` contains the raw token **once**. It is stored as a SHA-256
hash and cannot be shown again. If it is lost, revoke it and mint another.

    { "token": "msp_3f9a…", "entry": { "prefix": "msp_3f9a2b1c", "name": "CI", … } }

These three are the one place `curl` is the wrong tool: they need a session, so
they want a browser (or a cookie jar from a login you did yourself). Minting a
token from a script would mean the script holds a password.

`ttlMs` is optional; the default is a year and the maximum is two. Not
"never" — a key nobody looks at again is the one still working three jobs after
the person who made it has left.

---

## 4. Using it

    Authorization: Bearer msp_3f9a…

Read from that header and nowhere else. A key in a query string ends up in
every proxy's access log, in the browser history and in the next request's
`Referer`.

Unknown, revoked and expired all answer `401` with no detail. Saying "that key
is revoked" confirms the key to somebody who only guessed it.

**Rate limit:** 600 requests per minute per token. Over it: `429`, with
`Retry-After` in seconds and `X-RateLimit-Remaining` on every answer.

Does the key work?

```sh
curl -sS -D- -o /dev/null \
  -H "Authorization: Bearer $MS_TOKEN" \
  "$MS/api/board"
```

`200` and an `X-RateLimit-Remaining` header: the token is good. `401`: unknown,
revoked or expired — the answer does not say which, on purpose. `503` with
"Anmeldung kann gerade nicht geprueft werden": the database could not be asked,
which on a fresh install means `npm run db:migrate` has not run yet.

A script that has to survive a `429` rather than fall over:

```sh
post_update() {                       # $1 = url, $2 = json body
  for attempt in 1 2 3 4 5; do
    body=$(mktemp)
    code=$(curl -sS -o "$body" -w '%{http_code}' \
      -H "Authorization: Bearer $MS_TOKEN" -H "Content-Type: application/json" \
      -X POST -d "$2" "$1")
    case "$code" in
      2*)   rm -f "$body"; return 0 ;;
      429)  wait=$(( attempt * 5 )); echo "rate limited, waiting ${wait}s" >&2
            sleep "$wait" ;;
      4*)   echo "refused ($code): $(cat "$body")" >&2; rm -f "$body"; return 1 ;;
      *)    sleep $(( attempt * 2 )) ;;
    esac
    rm -f "$body"
  done
  return 1
}
```

Note which codes are retried and which are not: a `4xx` other than `429` means
the request itself is wrong, and sending it again five times only writes the
same mistake into the log five times.

---

## 5. The two calls this was built for

### Create a task

    POST /api/board/:boardId/group/:groupId/task
    { "task": { "title": "Backup failed on db-01" } }

Needs `editor` on that board. The id is generated when it is not supplied — the
browser makes its own because it draws the row before the answer arrives; a
script has no reason to invent one.

Column values go in the same object, keyed by the column's `field`. Read
`GET /api/board/:boardId` once to see what a board's columns are called; they
differ per board and are not guessable.

    { "task": { "title": "…", "c_d7xd6ib3": 1787500000000 } }

### Post an update on a task

    POST /api/board/:boardId/group/:groupId/task/:taskId/comment
    { "txt": "Deploy 4.2 is out." }

Needs only `viewer` — reading the board and writing updates is what that role
is. `@`-mentions in the text notify the people named, exactly as they do from
the browser, provided they can open the board.

Its own route rather than a task write with a longer comment list: two callers
posting at the same moment through the task write would each send their own
idea of the whole list, and one of the two updates would simply be gone.

### Finding the ids

    GET /api/board                       every board the account can see
    GET /api/board/:boardId              its groups, tasks and columns

An integration that hardcodes a group id is one that breaks the day somebody
renames a group. Look it up by title at startup.

---

## 6. Worked example: a monitor that opens a task and reports on it

The whole flow, in the order a script would do it. `jq` for the reading —
parsing JSON with `grep` works right up until a title contains a bracket.

**Find the board and the group by their names**, once at startup:

```sh
BOARD=$(mscurl "$MS/api/board" \
  | jq -r '.[] | select(.title == "Infrastruktur") | ._id')

GROUP=$(mscurl "$MS/api/board/$BOARD" \
  | jq -r '.groups[] | select(.title == "Störungen") | .id')

echo "board=$BOARD group=$GROUP"
```

If `BOARD` comes back empty, the integration account is not a member of that
board — add it in the members list; there is nothing to fix in the script.

**Open a task.** The answer is the whole board, so the new task's id comes back
out of it — that is how a script learns the id it did not invent:

```sh
TASK=$(mscurl -X POST "$MS/api/board/$BOARD/group/$GROUP/task" \
  -d '{"task":{"title":"db-01: Backup fehlgeschlagen"}}' \
  | jq -r '.groups[].tasks[] | select(.title == "db-01: Backup fehlgeschlagen") | .id' \
  | tail -1)
```

`tail -1` because the title is not unique — if the monitor has fired before,
several tasks carry it. Which is the argument for the next section.

**Write an update on it**, later, from the same or another run:

```sh
mscurl -X POST "$MS/api/board/$BOARD/group/$GROUP/task/$TASK/comment" \
  -d '{"txt":"Zweiter Versuch um 03:10 ebenfalls fehlgeschlagen."}' > /dev/null
```

**Mention somebody** so it reaches them rather than sitting on a board nobody
has open. The stored form of a mention is `@[Name](userId)` — that is what the
editor saves and what the server reads, and it is the one to use from a script.
(The rich-text editor also emits `<span data-type="mention" data-id="…">`; both
are recognised, but there is no reason to write HTML by hand.)

The person has to be a member of the board, or the mention is dropped — a
notification that leads to a locked door is worse than no notification.

```sh
USER=$(mscurl "$MS/api/user" | jq -r '.[] | select(.fullname == "Alex") | ._id')

mscurl -X POST "$MS/api/board/$BOARD/group/$GROUP/task/$TASK/comment" \
  -d "$(jq -n --arg id "$USER" \
        '{txt: ("Bitte einmal ansehen: @[Alex](" + $id + ")")}')" \
  > /dev/null
```

**Set a column value.** Columns are per board, so look the field up by the
column's title rather than pasting an id that means nothing anywhere else:

```sh
FIELD=$(mscurl "$MS/api/board/$BOARD" \
  | jq -r '.columns[] | select(.title == "Deadline") | (.field // .id)')

mscurl -X PATCH "$MS/api/board/$BOARD/group/$GROUP/task/$TASK" \
  -d "$(jq -n --arg f "$FIELD" --argjson ms "$(( $(date +%s) * 1000 + 86400000 ))" \
        '{($f): $ms}')" > /dev/null
```

### Don't open the same task twice

A monitor that fires every five minutes and posts a task each time buries the
board. Look for the open one first and add an update to it instead:

```sh
SUBJECT="db-01: Backup fehlgeschlagen"

EXISTING=$(mscurl --get "$MS/api/search" \
  --data-urlencode "q=$SUBJECT" --data-urlencode "type=tasks" \
  | jq -r --arg t "$SUBJECT" --arg b "$BOARD" \
      '.tasks[] | select(.title == $t and .boardId == $b) | .id' | head -1)

if [ -n "$EXISTING" ]; then
  mscurl -X POST "$MS/api/board/$BOARD/group/$GROUP/task/$EXISTING/comment" \
    -d '{"txt":"Noch offen — erneut fehlgeschlagen."}' > /dev/null
else
  # ...create it, as above
  :
fi
```

The search reads only what the account may see, so this cannot find a task on
a board the integration is not on. It is also a text search, not a key lookup:
if the monitor renames its own subjects, it will stop recognising them. A short
marker in the title that never changes — a host name, a check id — is what
makes this reliable.

---

## 7. What a token may NOT do

| | |
|---|---|
| Mint or revoke tokens | session only |
| Create, change or delete users | session only |
| End sessions, sign anybody out | session only |
| Anything on a board it is not a member of | 403/404, same as a person |

Everything else follows the account's board roles. There is no separate
permission system for tokens, deliberately — a second one is a second thing to
get wrong, and the first one is already on screen in the members list.
