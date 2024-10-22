#!/usr/bin/env python3

import re
import traceback
import urllib
import webbrowser
from pathlib import Path
from threading import Thread
from http.server import HTTPServer
from api import api
from utils import auth_key, dist, root
from handler import MyHTTPRequestHandler
from socketserver import ThreadingMixIn
import atexit

def create_root_symlink():
    symlink = dist / '_root'
    symlink.unlink(True)
    symlink.symlink_to(root)

def cleanup_function():
    try:
        symlink = dist / '_root'
        symlink.unlink(True)
    except:
        pass


class ThreadingSimpleServer(ThreadingMixIn, HTTPServer):
    pass

def main():
    create_root_symlink()
    atexit.register(cleanup_function)
    with ThreadingSimpleServer(('localhost', 8758), MyHTTPRequestHandler) as server:
        server._api = api
        print(f'URL: http://localhost:{server.server_port}/#_auth_{auth_key}')
        webbrowser.open(f'http://localhost:{server.server_port}/#_auth_{auth_key}')
        server.serve_forever()

if __name__ == '__main__':
    exit(main() or 0)
