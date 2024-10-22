

from typing import Any
import os
from handler import MyHTTPRequestHandler
from threading import Thread
from utils import get_delayed_responses, executor, is_idle_since, config
import time
import urllib.request
import multiprocessing
import signal
import json
import threading

lock = threading.RLock()

def api_get_config_read(handler: MyHTTPRequestHandler, args: dict[str, Any]):
    with lock:
        backup = config.with_suffix('.backup.json')
        if not backup.exists() and not config.exists():
            handler.send_json_ok(config={})
            return
        try:
            with open(config, 'r') as fd:
                data = json.load(fd)
        except:
            with open(backup, 'r') as fd:
                data = json.load(fd)
    handler.send_json_ok(config=data)


def api_post_config_write(handler: MyHTTPRequestHandler, args: dict[str, Any], content_len: int):
    post = handler.get_post_json(content_len)
    with lock:
        backup = config.with_suffix('.backup.json')
        try:
            with open(config, 'r') as fd:
                json.load(fd)
            try:
                backup.unlink()
            except:
                pass
            config.rename(backup)
        except:
            pass
        with open(config, 'w') as fd:
            json.dump(post['config'], fd, indent='  ')
    handler.send_json_ok()
