#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Thin wrapper around the pip-pinned `git-archive-all` console entry.

Originally `from git_archive_all import main` after a bare `import sys`,
which imports `git_archive_all` with `sys.path[0]` set to this script's
directory (the repo root). A checked-in `git_archive_all.py` or
`git_archive_all/` directory in the repo would then shadow the
hash-pinned wheel and execute arbitrary code at release-tarball time.
Strip `sys.path[0]` before the import so the venv (or site-packages)
is the only source of truth.
"""
import sys
import os

# Drop sys.path[0] (this script's directory) so an attacker can't
# shadow the pinned package by adding a same-named module to the repo.
if sys.path and sys.path[0] in ("", os.path.dirname(os.path.abspath(__file__))):
    del sys.path[0]

from git_archive_all import main

sys.exit(main())

