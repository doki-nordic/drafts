

import os
import json
import yaml
import re
import itertools
from pathlib import Path
from threading import Thread
import io
import sys
import shutil
import webbrowser
from textwrap import dedent
from http.server import HTTPServer, SimpleHTTPRequestHandler
from utils import root, executor, get_delayed_task_id, push_delayed_ok, push_delayed_error
from typing import Any
from handler import MyHTTPRequestHandler


def get_board_variants(file: Path):
    variants = []
    for f in file.parent.glob('*.y*ml'):
        try:
            data = yaml.load(f.read_text(), yaml.FullLoader)
            if ('identifier' in data) and ('arch' in data) and ('toolchain' in data):
                variants.append(data)
        except:
            pass
    return variants


def get_board_description(file: Path) -> str:
    try:
        doc = (file.parent / 'doc/index.rst').read_text()
        m = re.search(r'^[a-z0-9_].+?$', doc, re.MULTILINE | re.IGNORECASE)
        return m.group(0).strip()
    except:
        return ''

def scan_workspace(task_id: int):
    try:
        samples = []
        boards = []
        socs = []
        for f in root.glob('**/*.y*ml'):
            if f.stem not in ('sample', 'board', 'soc'):
                continue
            try:
                fileName = str(f.relative_to(root))
                data = yaml.load(f.read_text(), yaml.FullLoader)
                if f.stem == 'sample':
                    samples.append({**data, 'file': fileName})
                elif f.stem == 'soc':
                    socs.append({**data, 'file': fileName})
                else:
                    if 'description' not in data:
                        data['description'] = get_board_description(f)
                    data['variants'] = get_board_variants(f)
                    boards.append({**data, 'file': fileName})
            except Exception as e:
                if f.stem == 'sample':
                    samples.append({'error': str(e), 'file': fileName})
                elif f.stem == 'soc':
                    socs.append({'error': str(e), 'file': fileName})
                else:
                    boards.append({'error': str(e), 'file': fileName})
        push_delayed_ok(task_id,
                        samples=samples,
                        boards=boards,
                        socs=socs,
                        root=str(root)
                        )
    except Exception as e:
        push_delayed_error(task_id, str(e))


def api_get_workspace(handler: MyHTTPRequestHandler, args: dict[str, Any]):
    task_id = get_delayed_task_id()
    executor.submit(scan_workspace, task_id)
    handler.send_delayed(task_id)
