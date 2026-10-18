import os
import tempfile
from pathlib import Path

# Must run before backend.db is imported, so tests never touch ./kittyface.db.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

# A stand-in frontend build, so the SPA fallback is testable without bun.
frontend = Path(tempfile.mkdtemp())
(frontend / "assets").mkdir()
(frontend / "_shell.html").write_text("<html>shell</html>")
(frontend / "assets" / "app.js").write_text("console.log(1)")
os.environ["FRONTEND_DIR"] = str(frontend)
