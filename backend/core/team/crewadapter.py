"""brain-kit's KiroCrew client surface (bridge/kirocrew.py: create_slot, set_project, send, slot, stop), served by
the app's own session runner instead of brain-kit's HTTP client: the runner's sessions are opened like every other
session of the app (gateway.py, the app token, sessionApproval), sit in the sidebar under 「Brain 运行机」, and count
their credits.

The bridge loop runs in a worker thread and calls these synchronously; each call runs on the gateway's event loop
(``run_coroutine_threadsafe``) and waits for its answer. A failure is raised as brain-kit's BrainError, which the
bridge already handles (setup failures are retried, a send whose outcome is unknown is never repeated).
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import re
from typing import Any

from ..constants import RUNNER_FOLDER

SEND_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
RUN_SLOT_RE = re.compile(r"^run-[a-z][a-z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,5}$")


class KiroCrewAdapter:
    def __init__(self, loop: asyncio.AbstractEventLoop, mgr: Any, brain_error: type, *, timeout: float = 90.0) -> None:
        self.loop, self.mgr, self.BrainError, self.timeout = loop, mgr, brain_error, timeout
        self.app = getattr(mgr, "app", "brain")

    def _run(self, coro: Any) -> Any:
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return fut.result(self.timeout)
        except concurrent.futures.TimeoutError:
            fut.cancel()
            raise self.BrainError("KiroCrew %d 秒内没有回应" % self.timeout) from None
        except self.BrainError:
            raise
        except Exception as exc:  # noqa: BLE001 - GatewayError and friends: brain-kit only knows BrainError
            raise self.BrainError("KiroCrew：%s" % str(exc)[:300]) from None

    def create_slot(self, name: str, agent: str, model: str, memory_mode: str = "incognito") -> dict[str, Any]:
        if not RUN_SLOT_RE.match(name or ""):
            raise self.BrainError("slot name %r is not a run id" % name)
        run_id = name.upper()
        return self._run(self.mgr.adapter_create(name, agent=agent, model=model or "", memory_mode=memory_mode,
                                                 title="%s · 运行机" % run_id, folder=run_id,
                                                 parent="%s-run:%s" % (self.app, run_id), key=run_id,
                                                 root_folder=RUNNER_FOLDER))

    def _ours(self, name: str) -> None:
        """A run's slot name only; the session runner itself refuses a slot it did not open for the bridge (checked on
        the event loop: the ledger's slot column is writable by the agents' OS user)."""
        if not RUN_SLOT_RE.match(name or ""):
            raise self.BrainError("slot name %r is not a run id" % name)

    def set_project(self, name: str, path: str) -> dict[str, Any]:
        self._ours(name)
        return self._run(self.mgr.adapter_set_project(name, path))

    def send(self, name: str, message: str, send_id: str) -> dict[str, Any]:
        if not SEND_ID_RE.match(send_id or ""):
            raise self.BrainError("sendId must match [A-Za-z0-9_-]{1,128}")
        self._ours(name)
        return self._run(self.mgr.adapter_send(name, message, send_id))

    def slot(self, name: str) -> dict[str, Any]:
        self._ours(name)
        return self._run(self.mgr.adapter_slot(name))

    def stop(self, name: str) -> dict[str, Any]:
        self._ours(name)
        return self._run(self.mgr.adapter_stop(name))
