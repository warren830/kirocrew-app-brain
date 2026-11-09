#!/usr/bin/env python3
"""The release's secret check: no real credential in a tree that goes public.

    python3 -I scripts/release_secrets.py DIR      # exit 0: clean; exit 1: every hit listed

Every file under DIR (but .git/) is read as text. A hit is a secret in its real shape: an AWS access key id, a GitLab
or GitHub token, a Slack or Anthropic key, a PEM private key header naming its type. The secret-detecting regexes in
the code (the app's service.py, brain-kit's intake/checks.py, Lean's aidlc_lean.py) are not in that shape and do not
count. Symlinks fail too: the release has none.
"""

from __future__ import annotations

import os
import re
import sys

SECRET = re.compile(r"(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])"
                    r"|glpat-[0-9A-Za-z_-]{20}"
                    r"|\bgh[pousr]_[0-9A-Za-z]{36}"
                    r"|\bgithub_pat_[0-9A-Za-z_]{22,}"
                    r"|\bxox[abprs]-[0-9A-Za-z-]{10,}"
                    r"|\bsk-ant-[0-9A-Za-z_-]{20,}"
                    r"|-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----")


def scan(root: str) -> list[str]:
    bad: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d != ".git")
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if os.path.islink(full):
                bad.append("%s: a symlink (the release has none)" % rel)
                continue
            with open(full, "rb") as fh:
                text = fh.read().decode("utf-8", errors="replace")
            for no, line in enumerate(text.splitlines(), 1):
                hits = sorted({m.group(0)[:12] + "…" for m in SECRET.finditer(line)})
                if hits:
                    bad.append("%s:%d: looks like a secret [%s]" % (rel, no, ", ".join(hits)))
    return bad


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not os.path.isdir(argv[1]):
        print("usage: release_secrets.py DIR", file=sys.stderr)
        return 2
    bad = scan(argv[1])
    for b in bad:
        print("!! HIT  " + b)
    print("== secrets %s: %d hit(s)" % (argv[1], len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
