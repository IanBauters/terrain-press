# Notes for working on this repository

## Every update needs plain-language notes

The owner wants to see clearly what each update fixes or adds, without technical detail.

For every change pushed to `main`:

1. **Add an entry to `CHANGELOG.md`.** Put it at the top, under a new version number with the date.
   - Fixes: name the bug as a user would notice it (what went wrong, in which situation), then say it is fixed.
   - Mention anything the user must do, for example reprinting a puzzle.
   - No code, function names or internals.
2. **The GitHub release is published automatically.** The `release.yml` workflow publishes the newest changelog entry as release `vX.Y.Z` when `CHANGELOG.md` reaches `main`. It titles the release after the first bold line of the entry, prefixed with "Fixed:", "New:" or "Changed:" from the `### Fixed / Added / Changed` heading, so start each entry with a bold, plain-language summary. Editing an entry later updates that release's notes.
3. **Keep commit messages short and readable.** The technical explanation can follow in the commit body.

Versioning: bug fixes bump the last number (1.0.0 → 1.0.1), new features the middle one (1.0.1 → 1.1.0).

## Building

`npm install`, then `python3 source/build.py`. That regenerates `site/` from `source/`. Commit both.
