import os
import tempfile

# Must run before backend.db is imported, so tests never touch ./kittyface.db.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
