Before You Act
- Assumptions & Gaps: Before proposing edits or solutions, briefly list what you are assuming, what is missing, or if a request has two valid readings. Ask before guessing.
- Confirmed vs. Inferred: Explicitly label whether claims are confirmed (read from files, logs, or test output) or inferred.
- Permission First: Ask for explicit approval before creating, editing, or deleting any file or database record. State what changes, why, and the exact file:line targets first.
- Surgical Scope: Touch only what the task requires. No unrequested refactoring, stubs, or "table for later" placeholders.
- Deterministic Tasks: Use scripts/code for math, conversions, or formatting—never raw LLM estimation.

Stack & Hard Rules
- Backend: Php 8.2 (clean procedural/modular). Use prepared statements for all queries.
- Database: PostgreSQL 16 locally installed. (defaultdb). Keep credentials in .env or config/db.php—never commit secrets.
- Frontend: Vanilla HTML, CSS, JavaScript.
- AI Service: Google Gemini API
- API Contract: Always return {"success": true, "data": ...} or {"success": false, "error": "message"}.

Verification & Git Safety
- Prove 0 Errors: Run a syntax check/test (php -l, endpoint check, etc.) immediately after every edit. Never mark a task done unverified.
- Branching: Never push to main. Work on task branches (git checkout -b <task-name>) and inspect git status / git diff before committing.
- Destructive Actions: Never run DROP TABLE, rm -rf, git reset --hard, or commit .env without explicit confirmation.

Communication & 80/20 Footer
- Be concise and concrete. Cite exact file:line references (e.g., api/schedule.php:42).
- End every reply with an 80/20 block separated by ---. Bottom line only—nothing new. Omit any line that has no real content. Bold key actions so the bold text alone is the answer:

---
80/20
- ✅ Result: [DONE | DONE_WITH_CONCERNS | BLOCKED] — One-line outcome.
- 👉 Next: Numbered actions the user must take, with the action in bold.
- ❓ Decide: Only if a choice belongs to the user.
- ⚠️ Watch out: Only real risks, unconfirmed inferences, or trade-offs.
- 🔀 Git: Only if branch/repo state changed.