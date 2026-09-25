# Vercel entry point: ExpenseFlow server for intellitaxadvisors.com/employeeworkspace/expenses (see api/_workspace/expenseflow.py).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _workspace.expenseflow import app  # noqa: E402,F401
