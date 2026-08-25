# Verify Before Reporting — Examples

Scenarios where the agent should verify results before claiming completeness.

---

## Code Changes

### 1. File modification verification
```
User: change the timeout in config.py from 30 to 60

Agent should:
1. Read config.py to find the current timeout value
2. Modify the file
3. Read config.py again to confirm the change landed
4. Report: "Changed timeout from 30 to 60 in config.py:15 — verified by re-reading"

Agent should NOT say "done" without verification.
```

### 2. Build system verification
```
User: add this dependency to build.gradle

Agent should:
1. Add the dependency
2. Run ./gradlew dependencies to verify it's resolved
3. Report: "Added dependency — verified in dependency tree"

Agent should NOT just add the line and say "done".
```

---

## Command Execution

### 3. Service restart verification
```
User: restart the nginx service

Agent should:
1. Run systemctl restart nginx
2. Run systemctl status nginx to verify it's running
3. Run curl -I localhost to verify it's responding
4. Report: "Restarted nginx — service active, responding to requests"
```

### 4. Database migration verification
```
User: run the database migrations

Agent should:
1. Run the migration command
2. Query the migrations table to verify all ran
3. Run a sample query to verify connectivity
4. Report: "Migrations complete — 15 applied, database responsive"
```

---

## Analysis Tasks

### 5. Log analysis verification
```
User: find all ERROR entries in the logs

Agent should:
1. Search the logs
2. Count the results
3. Show a sample
4. Report: "Found 42 ERROR entries — showing first 5"

Agent should NOT just dump raw output without context.
```

### 6. Code search verification
```
User: find where we handle payment processing

Agent should:
1. Search for payment-related code
2. Verify the files are actually about payments (not false positives)
3. Report: "Found payment handling in 3 files — verified by reading context"
```

### 7. Multi-agent sync & Intelligence Layer verification
```
User: update the deployment workflow in a shared repo

Agent should:
1. Pull context: Use intelligence_get_context(scope="light") to see missions and PIL state.
2. Continue or Start: If a mission is inconclusive, ask to continue or define new.
3. Read the current sync context for the workdir.
4. Declare intent before making high-impact changes.
5. Verify no conflicting mission is active.
6. Upsert findings: If deployment logic is complex, register it as a PIL fact.
7. Shadow Summary (on F4): Ensure an outcome is reported via intelligence_upsert.
8. Verify final state before claiming completion.

Agent should NOT make shared changes in silence or fail to document 
new architectural facts in the PIL.
```

---

## The Rule in One Line

> Always verify the result from the user's perspective —
> does it actually work, not just exist?