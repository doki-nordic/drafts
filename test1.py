
import re
import os.path
from typing import Any
from pcpp.preprocessor import Preprocessor, OutputDirective, Action, PreprocessorHooks
from io import StringIO
from pathlib import Path

class Token:
    lexpos: int
    lineno: int
    source: str
    type: str
    value: str

CONFIG_H_FILE = 'config.h'


def warning(message):
    print(message)

class ParserInterrupt(Exception):
    def __init__(self, **kwargs):
        super().__init__()
        for name, value in kwargs.items():
            self.__dict__[name] = value



class MyHooks(PreprocessorHooks):
    def on_error(self, file: str, line: int, msg: str): pass
    def on_file_open(self, is_system_include: bool, includepath: str): pass
    def on_include_not_found(self, is_malformed: bool, is_system_include: bool, curdir: str, includepath: str): pass
    def on_unknown_macro_in_defined_expr(self, tok: Token): pass
    def on_unknown_macro_in_expr(self, ident: str): pass
    def on_unknown_macro_function_in_expr(self, ident: str): pass
    def on_directive_handle(self, directive: Token, toks: Token, ifpassthru: bool, precedingtoks: Token): pass
    def on_directive_unknown(self,directive: Token, toks: Token, ifpassthru: bool, precedingtoks: Token): pass
    def on_potential_include_guard(self, macro: str): pass
    def on_comment(self, tok: Token): pass



class File:

    file: Path
    config_provider: 'bool|None' # File can provide configuration data

    def __init__(self, file: Path, stamp: 'tuple[int, int]|None'):
        self.file = Path(os.path.abspath(file))
        self.config_provider = None

    def is_modified(self, stamp: 'int|None'):
        stat = self.file.stat()
        #return stat.st_mtime != stamp
        return True # TODO: loading from cache
    
    def load_cache(self, file_cache_dict):
        raise NotImplementedError() # TODO: loading from cache
    
    def parse(self):
        source = self.file.read_text()
        self.config_provider = bool(re.search(r'^[\t ]*#[\t ]*include[\t ]+[<"]' + re.escape(CONFIG_H_FILE) + r'[">]', source, re.MULTILINE))
        if not self.config_provider:
            return


class CFile(File):

    depends_on: 'str|None' # Configuration option required to compile this file


class HFile(File):
    pass


class Image:

    c_files: dict[Path, CFile]
    h_files: dict[Path, HFile]
    all_files: dict[Path, File]
    include_dirs: set[Path]

    def __init__(self):
        test_dir = Path(__file__).parent / 'test_app'
        self.include_dirs = { test_dir }
        self.h_files = dict()
        self.c_files = dict()
        self.all_files = dict()
        for file in test_dir.glob('**/*.cpp'):
            file = file.resolve()
            c_file = CFile(file)
            self.c_files[file] = c_file
            self.all_files[file] = c_file

def main():
    img = Image()


if __name__ == "__main__":
    main()

'''


def is_config_name(name: str):
    return name.startswith('CONFIG_') or name.startswith('COMMON_CONFIG_') # TODO: image prefix also

class ConfPreprocessor(Preprocessor):

    current_comment: str
    
    def __init__(self):
        super(ConfPreprocessor, self).__init__()
        self.current_comment = ''
        print("Initialized")

    def on_directive_handle(self, directive: Token, toks: list[Token], ifpassthru: bool, precedingtoks: list[Token]):
        name = directive.value
        if name == 'if':
            return True
        elif name == 'ifdef':
            return True
        elif name == 'ifndef':
            return True
        elif name == 'elif':
            return True
        elif name == 'else':
            return True
        elif name == 'endif':
            return True
        elif name == 'define':
            print('comment', self.current_comment)
            self.current_comment = ''
            if len(toks) > 0 and is_config_name(toks[0].value):
                raise OutputDirective(Action.IgnoreAndPassThrough)
            return True
        elif name == 'include':
            pass
        elif name == 'undef':
            pass
        else:
            raise ValueError()

    def on_directive_unknown(self, *args):
        print('on_directive_unknown')

    def on_error(self, *args):
        print('on_error', args)

    def on_file_open(self, is_system_include: bool, includepath: str):
        print('on_file_open', is_system_include, includepath)
        if includepath.endswith('config.h'):
            return StringIO(config_h)

    def on_include_not_found(self, *args):
        print('on_include_not_found')

    #def on_potential_include_guard(self, *args):print('on_potential_include_guard')

    def on_unknown_macro_function_in_expr(self, *args):
        print('on_unknown_macro_function_in_expr')

    def on_unknown_macro_in_defined_expr(self, *args):
        print('on_unknown_macro_in_defined_expr')

    def on_unknown_macro_in_expr(self, *args):
        print('on_unknown_macro_in_expr')

    def on_comment(self, tok: Token):
        self.current_comment = tok.value
        return False




p = ConfPreprocessor()
with open('test1.c') as fd:
    p.parse(fd.read())
out = StringIO()
p.write(out)
print(out.getvalue())

'''
