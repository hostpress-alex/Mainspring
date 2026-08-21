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

## 2. Getting a token

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

`ttlMs` is optional; the default is a year and the maximum is two. Not
"never" — a key nobody looks at again is the one still working three jobs after
the person who made it has left.

---

## 3. Using it

    Authorization: Bearer msp_3f9a…

Read from that header and nowhere else. A key in a query string ends up in
every proxy's access log, in the browser history and in the next request's
`Referer`.

Unknown, revoked and expired all answer `401` with no detail. Saying "that key
is revoked" confirms the key to somebody who only guessed it.

**Rate limit:** 600 requests per minute per token. Over it: `429`, with
`Retry-After` in seconds and `X-RateLimit-Remaining` on every answer.

---

## 4. The two calls this was built for

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

## 5. What a token may NOT do

| | |
|---|---|
| Mint or revoke tokens | session only |
| Create, change or delete users | session only |
| End sessions, sign anybody out | session only |
| Anything on a board it is not a member of | 403/404, same as a person |

Everything else follows the account's board roles. There is no separate
permission system for tokens, deliberately — a second one is a second thing to
get wrong, and the first one is already on screen in the members list.
