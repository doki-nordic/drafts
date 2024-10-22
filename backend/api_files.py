

import os
import base64
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


def api_get_read(handler: MyHTTPRequestHandler, args: dict[str, Any]):
    file: Path = root / args['file']
    if not file.exists():
        content = None
        type ='missing'
    elif file.is_file():
        bin = file.read_bytes()
        try:
            content = bin.decode('utf-8')
            type = 'text'
        except UnicodeDecodeError:
            content = base64.b64encode(bin).decode()
            type = 'binary'
    elif file.is_dir():
        content = [ str(x.relative_to(file)) for x in file.glob('*') ]
        type = 'directory'
    else:
        content = None
        type = 'unknown'
    handler.send_json_ok(type=type, content=content)
