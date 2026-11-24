# SPDX-License-Identifier: Apache-2.0
"""Checks who this repository's commits say they are from, and that no commit message credits an assistant.

  python -I app/tools/check_commit_identity.py

It is for the owner's own copy, before a commit is pushed or a release is tagged. It fails if:
  * this repository's git settings do not give the owner's name and private address;
  * the newest commit, or any commit not yet on GitHub's main, has another author or committer;
  * the message of one of those commits has a Co-Authored-By line or a "Generated with" line.

Older commits on main are left alone: six carry another address of the owner's, which the owner decided to keep.
It changes nothing. Exit code: 0 if all is as expected, 1 if not.
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

NAME = "jasonswrench-beep"
EMAIL = "324576087+jasonswrench-beep@users.noreply.github.com"

# At the start of a line only, so a message may still mention such a line in a sentence.
CREDIT = re.compile(r"^\W*(co-authored-by\s*:|generated with\b)", re.IGNORECASE | re.MULTILINE)


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace")


def commits():
    """The newest commit, and every commit not yet on origin/main. Without an origin/main, the newest commit alone."""
    found = []
    ranges = [["-1", "HEAD"]]
    if git("rev-parse", "--verify", "--quiet", "refs/remotes/origin/main").returncode == 0:
        ranges.append(["refs/remotes/origin/main..HEAD"])
    for what in ranges:
        done = git("log", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e", *what)
        if done.returncode != 0:
            raise RuntimeError(done.stderr.strip() or "git log did not work")
        for record in done.stdout.split("\x1e"):
            if record.strip():
                parts = record.strip("\n").split("\x1f")
                if parts not in found:
                    found.append(parts)
    return found


def main():
    problems = []
    for key, wanted in (("user.name", NAME), ("user.email", EMAIL)):
        value = git("config", "--local", key).stdout.strip()
        if value != wanted:
            problems.append(f"git config --local {key} is {value or 'not set'}, and should be {wanted}")
    try:
        checked = commits()
    except (OSError, RuntimeError) as problem:
        print(f"FAIL  the commits could not be read: {problem}")
        return 1
    if not checked:
        problems.append("no commit was found to check")
    for sha, author, author_email, committer, committer_email, message in checked:
        for role, name, email in (("author", author, author_email), ("committer", committer, committer_email)):
            if (name, email) != (NAME, EMAIL):
                problems.append(f"commit {sha[:7]}: the {role} is {name} <{email}>")
        if CREDIT.search(message):
            problems.append(f"commit {sha[:7]}: the message has a Co-Authored-By or a Generated with line")
    for problem in problems:
        print(f"FAIL  {problem}")
    if problems:
        return 1
    print(f"PASS  git settings, and {len(checked)} commit(s): author, committer and message")
    return 0


if __name__ == "__main__":
    sys.exit(main())
