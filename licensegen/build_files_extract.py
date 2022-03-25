

import subprocess

from os import unlink
from pathlib import Path
from tempfile import mktemp
from generator_error import GeneratorError
from generator_utils import eprint


def tool_execute(build_dir: 'Path', command: 'str', return_str: 'bool'=False) -> 'Path|str':
    ninja_out_name = mktemp('.txt', 'licgen_stdout_')
    with open(ninja_out_name, 'w') as ninja_out_fd:
        ninja_err_name = mktemp('.txt', 'licgen_stderr_')
        with open(ninja_err_name, 'w') as ninja_err_fd:
            try:
                cp = subprocess.run(command, shell=True, stdout=ninja_out_fd,
                                    stderr=ninja_err_fd, cwd=build_dir)
            except Exception as e:
                eprint(e)
                raise GeneratorError(f'Unable to start "{command}" command.')
    with open(ninja_err_name, 'r') as ninja_err_fd:
        err = ninja_err_fd.read().strip()
        if len(err) > 0:
            eprint(err)
            if cp.returncode == 0:
                raise GeneratorError(f'"{command}" command reported some errors.')
    unlink(ninja_err_name)
    if cp.returncode != 0:
        raise GeneratorError(f'"{command}" command exited with error code {cp.returncode}')
    if return_str:
        with open(ninja_out_name, 'r') as fd:
            return fd.read()
    else:
        return Path(ninja_out_name)


def parse_targets_file(build_dir: 'Path', deps_file: 'Path') -> 'set[str]':
    result = set()
    with open(deps_file, 'r') as fd:
        line_no = 0
        for line in fd:
            line_no += 1
            line = line.strip()
            if len(line) == 0:
                continue
            file = (build_dir / line).resolve()
            result.add(str(file))
    return result


def parse_deps_file(all_files, deps_file_name):
    global args
    TARGET_LINE_RE = re.compile(r'[^\s].*:\s*(#.*)?')
    DEP_LINE_RE = re.compile(r'\s+(.*?)\s*(#.*)?')
    EMPTY_LINE_RE = re.compile(r'\s*(#.*)?')
    with open(deps_file_name, 'r') as fd:
        line_no = 0
        while True:
            line = fd.readline()
            line_no += 1
            if len(line) == 0:
                break
            line = line.rstrip()
            m = DEP_LINE_RE.fullmatch(line)
            if (m is None):
                if ((TARGET_LINE_RE.fullmatch(line) is None) and (EMPTY_LINE_RE.fullmatch(line) is None)):
                    raise GeneratorError(f'{deps_file_name}:{line_no}: Cannot parse dependency file')
                continue
            file = Path(args.build_directory, m.group(1)).resolve()
            all_files.add(file)

def build_files_extract(build_dir: 'Path') -> 'set[str]':
    build_dir = build_dir.absolute()

