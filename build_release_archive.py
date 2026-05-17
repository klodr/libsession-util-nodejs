#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Thin wrapper around the pip-pinned `git-archive-all` console entry.

Originally `from git_archive_all import main`, which imports the module
with `sys.path[0]` set to this script's parent directory (the repo
root). A checked-in `git_archive_all.py` or `git_archive_all/`
directory in the repo would shadow the hash-pinned wheel and execute
arbitrary code at release-tarball time — nullifying the pin. Strip the
repo root from `sys.path` BEFORE the import so the venv (or the user's
site-packages) is the only source of truth.
"""
import sys

# Drop sys.path[0] (the directory of this script) so an attacker can't
# shadow the pinned package by checking in a same-named file.
if sys.path and sys.path[0] in ("", __file__.rsplit("/", 1)[0]):
    del sys.path[0]

from git_archive_all import main

sys.exit(main())

