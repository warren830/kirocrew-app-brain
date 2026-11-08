"""Team mode (the team runner): brain-kit's bridge loop and runnerd as background tasks of the app, its sessions
dispatched through the app's own session runner, and every voucher signed outside the app by the separate signer
(brain-kit's sign.SpoolSigner on this side, signer/brain_signer.py on the other; see bridgehost.py)."""
