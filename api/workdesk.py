# Vercel entry point: WorkDesk server for intellitaxadvisors.com/employeeworkspace (see api/_workspace/workdesk.py).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _workspace.workdesk import app  # noqa: E402,F401
