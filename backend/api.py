
from typing import Any
import api_workspace
import os
from handler import MyHTTPRequestHandler
from threading import Thread
from utils import get_delayed_responses, executor, is_idle_since
import time
import urllib.request
import multiprocessing
import signal
import api_files
import api_config
import random


clients = set()
next_client_id = random.randint(0, 0x7fffffff)

def delay_shutdown_force():
    time.sleep(0.3)
    os.kill(os.getpid(), signal.SIGKILL)

def delay_shutdown(server):
    time.sleep(1.1)
    if len(clients) == 0:
        if is_idle_since(1):
            executor.submit(delay_shutdown_force)
            server.shutdown()
        else:
            executor.submit(delay_shutdown, server)

def api_post_session_begin(handler: MyHTTPRequestHandler, args: dict[str, Any], content_len: int):
    global next_client_id
    next_client_id += 1
    clients.add(next_client_id)
    handler.send_json_ok(id=next_client_id)

def api_post_session_end(handler: MyHTTPRequestHandler, args: dict[str, Any], content_len: int):
    post = handler.get_post_json(content_len)
    if post['id'] in clients:
        clients.remove(post['id'])
        if len(clients) == 0:
            executor.submit(delay_shutdown, handler.server)
        handler.send_json_ok()
    else:
        handler.send_json_error('Invalid session id.')

def api_post_ping(handler: MyHTTPRequestHandler, args: dict[str, Any], content_len: int):
    post = handler.get_post_json(content_len)
    for i in range(100):
        r = get_delayed_responses(post['tasks'])
        if len(r) > 0: break
        time.sleep(0.1)
    handler.send_json_ok(responses=r)

api = [
    # api_post_ - API that makes changes to the server state
    # api_get_ - API that only reads information without modification of the server state
    api_post_session_begin,
    api_post_session_end, # TODO: onbeforeunload -> Navigator.sendBeacon('/_api/session/end?...');
    api_post_ping,
    api_workspace.api_get_workspace,
    api_files.api_get_read,
    api_config.api_get_config_read,
    api_config.api_post_config_write,
]
