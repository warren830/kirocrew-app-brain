import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))          # `import backend.routes` (bootstrap) and tests' own helpers
sys.path.insert(0, str(ROOT / "tests"))

from appkit import no_hooks_env  # noqa: E402
from brainfix import home  # noqa: E402,F401  (the temp HOME fixture every brain-kit test uses)

no_hooks_env()  # throwaway repos only: no git hooks, no background maintenance (BRAIN_TEST_KEEP_HOOKS=1 keeps them)
