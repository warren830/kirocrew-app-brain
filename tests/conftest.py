import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))          # `import backend.routes` (bootstrap) and tests' own helpers
sys.path.insert(0, str(ROOT / "tests"))

from brainfix import home  # noqa: E402,F401  (the temp HOME fixture every brain-kit test uses)
