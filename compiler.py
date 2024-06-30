
import os
import sys
import re
import subprocess
from pathlib import Path


class Compiler:

    def __init__(self, command: str, std_args: 'list[str]|None'=None, custom_args: 'list[str]|None'=None):
        self.command = command
        self.std_args = std_args or []
        self.custom_args = custom_args or []
        self.all_defines = None
        self.all_includes = None
        self.sys_defines = None
        self.sys_includes = None

    def _run_compiler(self, args, input=''):
        res = subprocess.run([self.command] + self.std_args + args,
            input=input.encode(),
            capture_output=True)
        if (res.returncode != 0):
            print(res.stdout)
            print(res.stderr, file=os.stderr)
            raise Exception(f'Compiler invocation failed with exit code {res.returncode}')
        return (res.stdout.decode('utf-8'), res.stderr.decode('utf-8'))

    def get_system_defines_and_includes(self, cpp: bool):
        if self.sys_defines is None:
            self.sys_defines, self.sys_includes = self._get_defines_and_includes_from_args(cpp, [])
        return self.sys_defines, self.sys_includes

    def get_all_defines_and_includes(self, cpp: bool):
        if self.all_defines is None:
            self.all_defines, self.all_includes = self._get_defines_and_includes_from_args(cpp, self.custom_args)
        return self.all_defines, self.all_includes
    
    @staticmethod
    def _defines_from_output(output: str):
        defines: dict[str, str] = {}
        for line in output.splitlines():
            m = re.match(r'\s*#\s*define\s+(.+?)$', line)
            if m is None:
                continue
            text = m.group(1)
            brackets = 0
            for pos in range(0, len(text)):
                if text[pos] == '(':
                    brackets += 1
                elif text[pos] in (' ', '\t') and brackets < 1:
                    break
                elif text[pos] == ')':
                    brackets -= 1
            else:
                defines[text.strip()] = ''
                continue
            defines[text[:pos].strip()] = text[pos+1:].strip()
        return defines

    def _get_defines_and_includes_from_args(self, cpp: bool, args: list[str]):
        stdout, stderr = self._run_compiler(['-E', '-dM', '-v', '-xc++' if cpp else '-xc'] + args + ['-'])
        defines = self._defines_from_output(stdout)
        patterns = [
            r'#include "\.\.\." search starts here:(.*?)\n[^\s]',
            r'#include <\.\.\.> search starts here:(.*?)\n[^\s]',
        ]
        includes: list[str] = []
        for pattern in patterns:
            m = re.search(pattern, stderr, re.DOTALL)
            if m is None:
                print(stderr, file=sys.stderr)
                raise Exception('Cannot get include information from compiler.')
            for line in m.group(1).splitlines():
                line = line.strip()
                if len(line) > 0 and line not in includes:
                    includes.append(line)
        return defines, includes

    def preprocess_header_result(self, cpp: bool, file: Path, prev_defines: 'dict[str, str]'={}):
        source = []
        for key, value in prev_defines.items():
            source.append(f'#define {key} {value}')
        source.append(f'#include "{file.resolve()}"')
        stdout, stderr = self._run_compiler(['-E', '-dM', '-xc++' if cpp else '-xc'] + self.custom_args + ['-'], '\n'.join(source))
        if len(stderr.strip()):
            print(stderr, file=sys.stderr)
        defines = self._defines_from_output(stdout)
        new_defines = {}
        skip_defines = dict()
        skip_defines.update(prev_defines)
        skip_defines.update(self.get_all_defines_and_includes(cpp)[0])
        for key, value in defines.items():
            if key not in skip_defines or skip_defines[key] != value:
                new_defines[key] = value
        return new_defines

    @staticmethod
    def combine_defines(a: dict, b: dict):
        r = dict(a)
        r.update(b)
        return r


def test():
    c = Compiler('gcc', [], ['-DMOJE=1', '-I/home/doki/.local/lib/'])
    #print(c.get_all_defines_and_includes(False))
    #print(c.get_all_defines_and_includes(True))
    a = c.preprocess_header_result(False, Path('/usr/include/limits.h'))
    b = c.preprocess_header_result(False, Path('/usr/include/limits.h'), a)
    print(b)



if __name__ == '__main__':
    test()
