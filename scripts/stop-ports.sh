#!/bin/sh
#
# Free the ports this project uses, and stay honest about it when that fails.
#
# The naive version of this — kill whatever holds the port — does not work
# here, and it took two rounds of confusion to see why. The listener is a
# child: npm starts concurrently, concurrently starts npm, npm starts nodemon,
# nodemon starts the server. Kill the leaf and the supervisor above it hands
# you a new one. The port never comes free and it looks like the process is
# ignoring SIGTERM.
#
# So this walks one step up and takes the supervisor with it — but only when
# the parent actually looks like one of ours. Otherwise a stray match would
# kill the terminal you typed this into, which is a lesson best learned from
# somebody else's script.

PORTS=3000,3001,3030
LIST="lsof -ti:$PORTS"

listeners=$($LIST 2>/dev/null)

if [ -z "$listeners" ]; then
    echo "  ports 3000/3001/3030 free"
    exit 0
fi

targets="$listeners"

for pid in $listeners; do
    parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    [ -z "$parent" ] && continue
    [ "$parent" = "1" ] && continue          # already orphaned, nothing above it
    [ "$parent" = "0" ] && continue

    # Only follow the parent when it is a supervisor of ours. Anything else
    # up there is somebody's shell or a system process and stays untouched.
    case "$(ps -o command= -p "$parent" 2>/dev/null)" in
        *nodemon*|*concurrently*|*npm*|*node*) targets="$targets $parent" ;;
    esac
done

# Do not celebrate the first free moment. A supervisor that respawns leaves a
# gap of a few hundred milliseconds between the old child dying and the new
# one binding, and a single check lands in that gap: the script reports
# success, the dev server starts, and it collides with a process that came
# back. So once the ports look free, look again after a pause.
settled() {
    [ -n "$($LIST 2>/dev/null)" ] && return 1
    sleep 0.7
    [ -n "$($LIST 2>/dev/null)" ] && return 1
    return 0
}

wait_for_quiet() {
    i=0
    while [ $i -lt 6 ]; do
        settled && return 0
        sleep 0.5
        i=$((i + 1))
    done
    return 1
}

# Three steps, each louder than the last, because there are three different
# reasons a process does not go away and only the last one is brute force.

# 1. TERM. The server closes its database pool on the way out.
kill $targets 2>/dev/null
wait_for_quiet && { echo "  ports 3000/3001/3030 free"; exit 0; }

# 2. A stopped process (someone pressed Ctrl-Z) never gets to handle TERM: the
#    signal waits until it runs again. Wake it up, then ask once more.
echo "  still there after SIGTERM, resuming and retrying"
kill -CONT $targets 2>/dev/null
kill -TERM $targets 2>/dev/null
wait_for_quiet && { echo "  ports 3000/3001/3030 free"; exit 0; }

# 3. KILL cannot be caught, blocked or deferred. Nothing survives this except
#    a process stuck in the kernel, which is not something a dev script fixes.
echo "  still there, forcing"
kill -9 $(${LIST} 2>/dev/null) $targets 2>/dev/null
wait_for_quiet && { echo "  ports 3000/3001/3030 free"; exit 0; }

echo "  could not free the ports. Still listening:"
lsof -nP -i:3000 -i:3001 -i:3030 2>/dev/null | grep LISTEN | sed 's/^/    /'
echo ""

# A zombie is already dead — its parent just has not collected it. Nothing you
# send it does anything, including KILL, and no amount of retrying helps. The
# entry goes away when the parent dies. Worth naming, because "kill -9 did not
# work" sends people looking in entirely the wrong direction.
zombies=$(ps -o pid= -o stat= -p "$(${LIST} 2>/dev/null | paste -sd, -)" 2>/dev/null | awk '$2 ~ /^Z/ {print $1}')
if [ -n "$zombies" ]; then
    echo "  Some of these are zombies (already dead, not yet collected by their"
    echo "  parent). You cannot kill them. Kill the parents instead:"
    echo ""
    for z in $zombies; do
        ps -o pid,ppid,command= -p "$z" 2>/dev/null | tail -n +2 | sed 's/^/    /'
    done
    echo ""
    echo "  Note that zombies do not hold ports — if one shows up here, whatever"
    echo "  is really on the port is something else."
    exit 1
fi

echo "  Check the USER column. Not you means a system service — leave it alone."
echo "  Yours and coming back means something above it is still restarting it."
echo "  Find the whole tree with:"
echo ""
echo "    ps -o pid,stat,ppid,user,command -p \$(lsof -ti:$PORTS | paste -sd, -)"
echo ""
echo "  STAT tells you which problem you have: Z is a zombie (kill the parent),"
echo "  T is stopped (this script already sends CONT), anything else is alive."
exit 1
