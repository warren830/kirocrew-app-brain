"""Signing outside the app: the bridge's private key never comes near this process.

The app runs as the same OS user as the agent sessions, and agents have a shell: a key the app could read, they
could read too, and sign whatever they like (a hand-over contract for any commit, an "approve" nobody gave). So the
key stays with a small separate signer (signer/brain_signer.py; another OS user in production) that re-checks every
request against GitLab itself before it signs, and the two talk through spool files only:

  <spool>/requests/<req>.json   written by the app:  {"schema": 1, "req_id", "kind", "created", "voucher": {...}}
  <spool>/signed/<req>.json     written by the signer: {"req_id", "voucher": {...}, "sig": "<ssh signature>"}
  <spool>/refused/<req>.json    written by the signer: {"req_id", "reasons": ["..."]}

``SpoolSigner.sign`` stands in for brain-kit's ``sign.sign(obj, key_path)`` in the app's private copy of brain-kit
(the bridge code calls it where it used to sign with the key): it writes the request, waits for the answer, and
accepts it only when the signed voucher is exactly the one asked for and its signature verifies against the bridge's
public key (allowed_signers). The key path brain-kit passes is ignored.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
from typing import Any, Callable

REQ_RE = re.compile(r"^[a-z]+-[A-Za-z0-9-]{1,80}-[0-9a-f]{12}\.json$")


def _write(path: str, obj: Any) -> None:
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, sort_keys=True, indent=1)
        os.chmod(tmp, 0o640)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _read(path: str) -> Any:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


class SpoolSigner:
    def __init__(self, spool: str, allowed_signers: str, *, brain_error: type, verify: Callable[..., bool],
                 digest: Callable[[Any], str], timeout: float = 30.0, poll_s: float = 0.25,
                 kick: Callable[[], Any] | None = None, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], Any] = time.sleep) -> None:
        self.spool, self.allowed = spool, allowed_signers
        self.verify, self.digest = verify, digest
        self.timeout, self.poll_s, self.kick, self.clock, self.sleep = timeout, poll_s, kick, clock, sleep
        self.Refused = type("SignerRefused", (brain_error,), {})
        self.Unavailable = type("SignerUnavailable", (brain_error,), {})
        self.last: dict[str, Any] = {}

    def dirs(self) -> dict[str, str]:
        return {k: os.path.join(self.spool, k) for k in ("requests", "signed", "refused")}

    def req_id(self, obj: dict[str, Any]) -> str:
        kind = re.sub(r"[^a-z]", "", str(obj.get("kind") or "x")) or "x"
        run = re.sub(r"[^A-Za-z0-9-]", "", str(obj.get("run_id") or "x"))[:60] or "x"
        return "%s-%s-%s" % (kind, run, self.digest(obj)[:12])

    def sign(self, obj: dict[str, Any], key_path: Any = None) -> str:  # noqa: ARG002 - the key is not the app's
        if not isinstance(obj, dict):
            raise self.Refused("只能签 JSON 对象")
        rid = self.req_id(obj)
        d = self.dirs()
        req = os.path.join(d["requests"], rid + ".json")
        _write(req, {"schema": 1, "req_id": rid, "kind": obj.get("kind"), "created": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "voucher": obj})
        if self.kick:
            self.kick()
        end = self.clock() + self.timeout
        try:
            while True:
                signed = _read(os.path.join(d["signed"], rid + ".json"))
                if isinstance(signed, dict):
                    v, sig = signed.get("voucher"), signed.get("sig")
                    if v != obj:
                        raise self.Refused("签名服务签的凭证和请求的不一样（%s）" % rid)
                    if not isinstance(sig, str) or not self.verify(obj, sig, self.allowed):
                        raise self.Refused("签名验不过：签名服务的公钥和 allowed_signers 对不上（%s）" % rid)
                    self.last = {"req_id": rid, "kind": obj.get("kind"), "ok": True}
                    return sig
                refused = _read(os.path.join(d["refused"], rid + ".json"))
                if isinstance(refused, dict):
                    reasons = [str(r)[:300] for r in refused.get("reasons") or []][:10] or ["没写原因"]
                    self.last = {"req_id": rid, "kind": obj.get("kind"), "ok": False, "reasons": reasons}
                    raise self.Refused("签名服务拒绝：" + "；".join(reasons))
                if self.clock() >= end:
                    self.last = {"req_id": rid, "kind": obj.get("kind"), "ok": False, "reasons": ["没有回应"]}
                    raise self.Unavailable("签名服务 %d 秒内没有回应（%s）" % (self.timeout, rid))
                self.sleep(self.poll_s)
        finally:
            try:  # the app owns requests/ only: signed/ and refused/ are the signer's to keep or clean
                os.unlink(req)
            except OSError:
                pass

    def status(self, keep: int = 20) -> dict[str, Any]:
        """Requests not answered yet, and the latest refusals (for the page)."""
        d = self.dirs()
        pending, refused = [], []
        for name in sorted(os.listdir(d["requests"])) if os.path.isdir(d["requests"]) else []:
            if not REQ_RE.match(name):
                continue
            r = _read(os.path.join(d["requests"], name)) or {}
            v = r.get("voucher") if isinstance(r.get("voucher"), dict) else {}
            pending.append({"req_id": name[:-5], "kind": str(r.get("kind") or ""), "run_id": str(v.get("run_id") or ""),
                            "since": r.get("created")})
        if os.path.isdir(d["refused"]):
            names = sorted(os.listdir(d["refused"]), key=lambda n: os.path.getmtime(os.path.join(d["refused"], n)))
            for name in names[-keep:]:
                if not REQ_RE.match(name):
                    continue
                r = _read(os.path.join(d["refused"], name)) or {}
                refused.append({"req_id": name[:-5], "kind": name.split("-", 1)[0],
                                "reasons": [str(x)[:300] for x in r.get("reasons") or []][:10]})
        return {"pending": pending, "refused": refused}
