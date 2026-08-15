# Datenbank: MongoDB oder MariaDB

Der Server kann beides. Was benutzt wird, entscheidet eine einzige Umgebungsvariable:

```
DB_DRIVER=mongo      # Voreinstellung
DB_DRIVER=mariadb
```

Der ganze Rest der Anwendung merkt davon nichts. Dahinter stehen jeweils zwei
Umsetzungen derselben Speicherschicht:

| Bereich | MongoDB | MariaDB |
|---|---|---|
| Boards | `api/board/board.repo.mongo.js` | `api/board/board.repo.sql.js` |
| Benutzer | `api/user/user.repo.mongo.js` | `api/user/user.repo.sql.js` |
| Kalender | `api/schedule/schedule.repo.mongo.js` | `api/schedule/schedule.repo.sql.js` |
| Uploads | `services/file.repo.mongo.js` | `services/file.repo.sql.js` |

Die Dateien ohne Zusatz (`board.repo.js` usw.) wählen nur aus.

> Wer eine dieser Dateien erweitert, muss die Gegenstück-Datei mitziehen.
> Sonst funktioniert das Zurückschalten nicht mehr.

---

## 1. MariaDB einrichten (lokal, ServBay)

1. In ServBay den Dienst **MariaDB** starten (Standard-Port 3306).
2. Datenbank und Benutzer anlegen — einmalig, z. B. über das ServBay-Terminal
   oder direkt in DBeaver als `root`:

```sql
CREATE DATABASE projectmanager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'projectmanager'@'localhost' IDENTIFIED BY 'HIER-EIN-PASSWORT';
GRANT ALL PRIVILEGES ON projectmanager.* TO 'projectmanager'@'localhost';
FLUSH PRIVILEGES;
```

3. Im Ordner `backend` eine Datei `.env` anlegen (oder die Variablen anders setzen):

```
DB_DRIVER=mariadb
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=projectmanager
MYSQL_PASSWORD=HIER-EIN-PASSWORT
MYSQL_DB=projectmanager
```

> `127.0.0.1` statt `localhost`: sonst läuft Node unter Umständen über IPv6,
> während MariaDB nur auf IPv4 lauscht.

4. Abhängigkeiten nachziehen und Tabellen anlegen:

```
cd backend
npm install
npm run db:migrate
```

`db:migrate` legt alle Tabellen an und merkt sich in `knex_migrations`, was
schon gelaufen ist. Ein zweiter Aufruf macht nichts mehr.

---

## 2. Bestandsdaten aus MongoDB übernehmen

Erst schauen, was passieren würde — dieser Lauf schreibt nichts:

```
npm run db:import:dry
```

Er meldet auch, was **nicht** mitkommt: Benutzer mit unbrauchbarer Id, Boards
ohne Owner, Kalendereinträge zu gelöschten Boards.

Wenn das Ergebnis passt:

```
npm run db:import
```

Stehen im Ziel schon Daten, bricht das Skript ab. `node scripts/migrate-to-mariadb.js --force`
leert die Tabellen vorher — **das löscht in MariaDB alles**.

Was dabei passiert:

* Die Ids bleiben erhalten. Aus der ObjectId `66f1…` wird die Zeichenkette
  `66f1…`, deshalb funktionieren bestehende Links und Lesezeichen weiter.
* Das alte Einzelfeld `ownerId` wird zu einem Eintrag in `board_member` mit
  `is_owner = 1`.
* Boards ohne `columns` bekommen ihre Spalten aus `cmpsOrder` — einmalig und
  dauerhaft gespeichert statt bei jedem Lesen neu erzeugt.
* Aktivitäten werden auf die letzten 40 gekürzt, wie im laufenden Betrieb auch.
* Die Verweise auf hochgeladene Dateien wandern mit. Die Dateien selbst liegen
  unter `backend/uploads/` und werden nicht angefasst.

---

## 3. Starten

```
npm run start:mariadb        # entspricht DB_DRIVER=mariadb npm start
npm start                    # nimmt, was in .env steht
```

Die Hilfsskripte richten sich nach demselben Schalter:

```
ADMIN_USER=alex ADMIN_PASS='…' ADMIN_NAME='Alex' npm run seed:admin
OWNER=alex npm run claim:boards
npm run seed            # Demo-Boards, nur in eine leere Datenbank
```

`seed:admin` ist auch der Weg, ein vergessenes Passwort zurückzusetzen.

Zurück zu MongoDB: `DB_DRIVER` wieder auf `mongo` setzen. Die MongoDB-Daten
werden von der Migration nicht angefasst, sie liegen unverändert da.

---

## 4. Zugriff mit DBeaver

Neue Verbindung → **MariaDB**:

| Feld | Wert |
|---|---|
| Server Host | `127.0.0.1` |
| Port | `3306` |
| Datenbank | `projectmanager` |
| Benutzer | `projectmanager` |
| Passwort | wie oben vergeben |

Beim ersten Verbinden bietet DBeaver an, den Treiber herunterzuladen — annehmen.

Auf dem Linux-Server lauscht MariaDB idealerweise **nicht** nach außen. Dann
über einen SSH-Tunnel gehen: in DBeaver im Reiter *SSH* den Server eintragen
und als Host weiterhin `127.0.0.1` verwenden.

---

## 5. Wie die Daten liegen

```
user            Benutzer (Passwort als bcrypt-Hash)
board           Kopfdaten eines Boards
board_member    wer gehört dazu, is_owner = darf verwalten
board_column    die Spalten eines Boards, in ihrer Reihenfolge
board_group     die Gruppen eines Boards
task            ein Task; title und Reihenfolge als echte Spalten,
                die Spaltenwerte in col_values (JSON)
task_member     wem ist der Task zugewiesen
task_comment    Updates/Kommentare an einem Task
activity        Verlauf, pro Board auf 40 Einträge begrenzt
schedule        Kalendereinträge der Benutzer
file            Metadaten der Uploads; die Dateien selbst liegen
                weiterhin unter backend/uploads/ auf der Platte
```

**Warum `col_values` JSON ist.** Die Spalten eines Boards sind frei
konfigurierbar — Status, Priorität, Datum, eigene Text- und Zahlenspalten.
Für jede neue Spaltenart eine Tabellenspalte anzulegen ginge nicht, und jeden
Wert als eigene Zeile abzulegen macht das Lesen eines Boards teuer und die
Ansicht in DBeaver unleserlich. Deshalb: alles, wonach man sucht und sortiert,
ist eine echte Spalte; die freien Werte liegen zusammen als JSON.

Personen-Zuweisungen sind bewusst **nicht** im JSON, sondern in `task_member` —
„welche Tasks hat Person X" ist eine Abfrage, die man wirklich braucht.

### Ein paar Abfragen für DBeaver

Alle Tasks eines Boards mit Gruppe und Status:

```sql
SELECT g.title AS gruppe, t.position, t.title,
       JSON_VALUE(t.col_values, '$.status')   AS status,
       JSON_VALUE(t.col_values, '$.priority') AS prio,
       JSON_VALUE(t.col_values, '$.dueDate')  AS faellig
FROM task t
JOIN board_group g ON g.board_id = t.board_id AND g.id = t.group_id
WHERE t.board_id = '…'
ORDER BY g.position, t.position;
```

Woran arbeitet wer:

```sql
SELECT u.fullname, b.title AS board, t.title AS task
FROM task_member tm
JOIN user  u ON u.id = tm.user_id
JOIN task  t ON t.board_id = tm.board_id AND t.id = tm.task_id
JOIN board b ON b.id = t.board_id
ORDER BY u.fullname, b.title;
```

Wer darf was:

```sql
SELECT b.title, u.fullname, IF(bm.is_owner, 'Owner', 'Mitglied') AS rolle
FROM board_member bm
JOIN board b ON b.id = bm.board_id
LEFT JOIN user u ON u.id = bm.user_id
ORDER BY b.title, bm.is_owner DESC, u.fullname;
```

Geplante Zeiten je Person und Woche:

```sql
SELECT u.fullname, YEARWEEK(s.start_at, 3) AS kw,
       ROUND(SUM(TIMESTAMPDIFF(MINUTE, s.start_at, s.end_at)) / 60, 1) AS stunden
FROM schedule s
JOIN user u ON u.id = s.user_id
GROUP BY u.fullname, kw
ORDER BY kw DESC, u.fullname;
```

---

## 6. Was sich fachlich ändert

**Besser:**

* Ein Task in eine andere Gruppe verschieben ist eine Transaktion. In MongoDB
  ohne Replica Set musste erst eingefügt und dann entfernt werden — brach es
  dazwischen ab, stand der Task doppelt da.
* Beim Ändern einzelner Felder wird die Task-Zeile gesperrt. Zwei Leute, die
  gleichzeitig verschiedene Spalten desselben Tasks setzen, überschreiben sich
  nicht mehr.
* Löscht man ein Board, verschwinden Gruppen, Tasks, Kommentare,
  Mitgliedschaften und Kalendereinträge dazu mit. Vorher blieben verwaiste
  Kalendereinträge liegen.

**Zu beachten:**

* Ein Board zu lesen sind jetzt sieben Abfragen statt einer. Bei der
  Board-Übersicht werden dabei auch alle Tasks aller Boards geladen — das war
  mit MongoDB genauso, fällt aber irgendwann auf. Wenn die Übersicht träge
  wird, ist das die Stelle.
* `col_values` ist nicht indiziert. Nach einem Statuswert über alle Boards zu
  filtern geht, ist aber ein voller Durchlauf. Bei Bedarf lässt sich dafür eine
  berechnete Spalte mit Index nachrüsten.
* Es gibt weiterhin keine Versionsnummer pro Task. Zwei Leute, die im selben
  Moment denselben Task-Titel tippen, überschreiben sich weiterhin gegenseitig —
  nur eben feldgenau statt boardweit.
