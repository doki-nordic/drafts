
import os
import sys
import concurrent.futures
from typing import Any
import time

from pathlib import Path

last_delayed_id = 0

delayed_responses: 'dict[int,Any]' = {}

def get_delayed_task_id() -> int:
    global last_delayed_id
    last_delayed_id += 1
    return last_delayed_id

def push_delayed_ok(task_id: int, **kwargs):
    global delayed_responses
    delayed_responses[task_id] = { **kwargs, 'task': task_id, 'status': 'OK' }

def push_delayed_error(task_id: int, message: str, **kwargs):
    global delayed_responses
    delayed_responses[task_id] = { **kwargs, 'task': task_id, 'message': message, 'status': 'ERROR' }

def get_delayed_responses(expected: 'list[int]'):
    global delayed_responses
    r = []
    for task_id in expected:
        if task_id in delayed_responses:
            r.append(delayed_responses[task_id])
            del delayed_responses[task_id]
    return r

def find_west_workspace() -> Path:
    if len(sys.argv) > 1:
        root = Path(sys.argv[1]).resolve() / 'something'
    else:
        root = Path('.').resolve() / 'something'
    while True:
        old_root = root
        root = root.parent.resolve()
        if root == old_root:
            print(f'Could not find west workspace for {Path(".").resolve()}', file=sys.stderr)
            exit(1)
        if not (root / '.west').exists(): continue
        if not (root / 'zephyr/zephyr-env.sh').exists(): continue
        return root

idle_since = time.monotonic()

def keep_alive():
    global idle_since
    idle_since = time.monotonic()

def is_idle_since(seconds):
    global idle_since
    return time.monotonic() > idle_since + seconds

executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

root = find_west_workspace()
config = Path(__file__).parent.parent / 'config.json'
dist = Path(__file__).parent.parent / 'dist'

#auth_key = os.urandom(32).hex()
auth_key = 'f8f5115b598d972d34629323cea54d983e155e18c10fe9f2740191cd270ccac8'

