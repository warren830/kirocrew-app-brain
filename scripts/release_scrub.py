#!/usr/bin/env python3
"""The release's scrub check: nothing internal, no personal names, no secrets in a tree that goes public.

    python3 -I scripts/release_scrub.py DIR      # exit 0: clean (allowed hits listed); exit 1: every hit listed

Every file under DIR (but .git/) is read as text, its path too. A hit is a denylisted word (case-insensitive) or a
secret in its real shape (an AWS access key id, a GitLab or GitHub token, a PEM private key header naming its type):
the secret-detecting regexes in the code (the app's service.py, brain-kit's intake/checks.py, Lean's aidlc_lean.py)
are not in that shape and do not count. ALLOWED lists the only lines a hit may stand on: the file, the exact text the
line must contain, and why. Anything else fails the release.
"""

from __future__ import annotations

import fnmatch
import os
import re
import sys

DENY = re.compile(r"aws\.dev|midway|mwinit|a2z\.com|amazon\.com|\.corp\b|isengard|brazil|code\.amazon|quip|"
                  r"yingchu|weiguo|qixiang|ychchen|stx|結構性|结构性", re.I)
SECRET = re.compile(r"(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])"
                    r"|glpat-[0-9A-Za-z_-]{20}"
                    r"|\bgh[pousr]_[0-9A-Za-z]{36}"
                    r"|\bgithub_pat_[0-9A-Za-z_]{22,}"
                    r"|\bxox[abprs]-[0-9A-Za-z-]{10,}"
                    r"|\bsk-ant-[0-9A-Za-z_-]{20,}"
                    r"|-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----")

# (path pattern relative to DIR, text the line must contain, why it may stay)
ALLOWED = (
    ("LICENSE", "Copyright Amazon.com, Inc. or its affiliates",
     "MIT-0 attribution of the aws-samples app this app started from"),
    ("apps/brain/LICENSE", "Copyright Amazon.com, Inc. or its affiliates",
     "MIT-0 attribution of the aws-samples app this app started from"),
    ("README.md", "Copyright Amazon.com, Inc. or its affiliates",
     "the README's credit to the aws-samples origin"),
    # brain-kit's own public commit (vendored unchanged): comments naming where GitLab's behaviour was measured.
    # Fix them in brain-kit and bump BRAINKIT_COMMIT; then drop these three.
    ("apps/brain/vendor/brain-kit/brainkit/rest.py", "Measured on gitlab.aws.dev 2026-11-09: lastEditedBy",
     "upstream brain-kit comment (public already)"),
    ("apps/brain/vendor/brain-kit/brainkit/bridge/decisions.py",
     "# Measured on gitlab.aws.dev 2026-11-09: a note nobody touched", "upstream brain-kit comment (public already)"),
    ("apps/brain/vendor/brain-kit/brainkit/bridge/handoff.py", "one bad round (network, GitLab, Midway, one run's",
     "upstream brain-kit comment (public already)"),
)


def scan(root: str) -> tuple[list[str], list[str]]:
    bad: list[str] = []
    allowed: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d != ".git")
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            for m in DENY.finditer(rel):
                bad.append("%s: path has %r" % (rel, m.group(0)))
            if os.path.islink(full):
                bad.append("%s: a symlink (the release has none)" % rel)
                continue
            with open(full, "rb") as fh:
                text = fh.read().decode("utf-8", errors="replace")
            for no, line in enumerate(text.splitlines(), 1):
                hits = [m.group(0) for m in DENY.finditer(line)] + [m.group(0) for m in SECRET.finditer(line)]
                if not hits:
                    continue
                why = next((w for pat, need, w in ALLOWED if fnmatch.fnmatchcase(rel, pat) and need in line), None)
                where = "%s:%d: %s  [%s]" % (rel, no, line.strip()[:160], ", ".join(sorted(set(hits))))
                (allowed if why else bad).append(where + ("  -- allowed: " + why if why else ""))
    return bad, allowed


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not os.path.isdir(argv[1]):
        print("usage: release_scrub.py DIR", file=sys.stderr)
        return 2
    bad, allowed = scan(argv[1])
    for a in allowed:
        print("   allowed  " + a)
    for b in bad:
        print("!! HIT      " + b)
    print("== scrub %s: %d hit(s), %d allowed" % (argv[1], len(bad), len(allowed)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
