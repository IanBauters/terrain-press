# Notes for working on this repository

## Every update needs plain-language notes

The owner wants to see clearly what each update fixes or adds, without technical detail.

For every change pushed to `main`:

1. **Add an entry to `CHANGELOG.md`.** Put it at the top, under a new version number with the date.
   - Fixes: name the bug as a user would notice it (what went wrong, in which situation), then say it is fixed.
   - Mention anything the user must do, for example reprinting a puzzle.
   - No code, function names or internals.
2. **Publish a GitHub release for the same version.** Tag it `vX.Y.Z`, give it a short title naming the change, and use the changelog entry as the release notes.
3. **Keep commit messages short and readable.** The technical explanation can follow in the commit body.

Versioning: bug fixes bump the last number (1.0.0 → 1.0.1), new features the middle one (1.0.1 → 1.1.0).

## Building

`npm install`, then `python3 source/build.py`. That regenerates `site/` from `source/`. Commit both.
