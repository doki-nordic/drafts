
import re
import io
import sys
import os
import os.path
from typing import Any
from pcpp.preprocessor import Preprocessor, OutputDirective, Action, PreprocessorHooks
from io import StringIO
from pathlib import Path
from compiler import Compiler
from enum import Enum

class Token:
    lexpos: int
    lineno: int
    source: str
    type: str
    value: str

CONFIG_H_FILE = 'config.h'
CONFIG_PREFIX = 'CONFIG_'
COMMON_CONFIG_PREFIX = 'COMMON_CONFIG_'

def is_config_name(name: str):
    return name.startswith(CONFIG_PREFIX) or name.startswith(COMMON_CONFIG_PREFIX) # TODO: Images


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
    def on_directive_handle(self, directive: Token, toks: list[Token], ifpassthru: bool, precedingtoks: list[Token]): pass
    def on_directive_unknown(self, directive: Token, toks: list[Token], ifpassthru: bool, precedingtoks: list[Token]): pass
    def on_potential_include_guard(self, macro: str): pass
    def on_comment(self, tok: Token): pass



class ConditionState(Enum):
    ALWAYS = 0
    CONDITIONAL = 1
    NEVER = 2


class Image:

    compiler: Compiler

    def __init__(self, compiler: Compiler):
        self.compiler = compiler

class FileParser(Preprocessor):

    file: Path
    compiler: Compiler
    image: Image
    system_defines: dict[str, str]
    last_source: str
    last_line: str
    last_comment: str
    main_source: str
    if_stack: list[str]
    condition: ConditionState
    conditional_defines: dict[str, list[tuple[str, str]]] # define_name => list of (value, condition), last has higher precedence

    def __init__(self, file: Path, image: Image):
        self.file = file
        self.image = image
        self.compiler = image.compiler
        self.system_defines = {}
        self.last_source = 'unknown'
        self.last_line = 1
        self.last_comment = ''
        self.main_source = '' # TODO: main source 
        self.if_stack = []
        self.condition = ConditionState.ALWAYS
        self.conditional_defines = set()

    def on_error(self, file: str, line: int, msg: str):
        warning(f'{file}:{line}:warning: {msg}')
        warning(f'{self.file}:1:notice: The file cannot be configuration provided because of preprocessor warnings.')
        raise InterruptedError()

    def on_file_open(self, is_system_include: bool, includepath: str):
        if self.compiler.is_system_include(includepath):
            defines = self.compiler.get_header_defines(includepath)
            new_defines = Compiler.defines_difference(defines, self.system_defines)
            self.system_defines = defines
            source = []
            for key, value in new_defines.items():
                source.append(f'#define {key} {value}')
            result = io.StringIO('\n'.join(source))
        else:
            result = open(includepath, 'r')
        return result

    def on_unknown_macro_in_defined_expr(self, tok: Token):
        self.last_source = tok.source
        self.last_line = tok.lineno
        name = tok.value
        if is_config_name(name):
            return None # keep configurations unchanged
        warning(f'{tok.source}:{tok.lineno}:warning: Unknown macro {name}')
        return False # Warn and assume undefined for other macros

    def on_unknown_macro_in_expr(self, name: str):
        if is_config_name(name):
            return None # keep configurations unchanged
        warning(f'{self.last_source}:{self.last_line}:warning: Unknown macro {name}')
        return False # Warn and assume 0 for other macros
    
    def on_unknown_macro_function_in_expr(self, name: str):
        if is_config_name(name):
            warning(f'{self.last_source}:{self.last_line}:warning: Configuration option {name} used as function-like macro')
        else:
            warning(f'{self.last_source}:{self.last_line}:warning: Unknown function-like macro {name}')
        return lambda x : 0

    def on_directive_handle(self, directive: Token, toks: list[Token], ifpassthru: bool, precedingtoks: list[Token]):
        self.lastdirective = directive
        self.last_source = directive.source
        self.last_line = directive.lineno
        in_main_file = (directive.source == self.main_source)
        name = directive.value # define, include, undef, ifdef, ifndef, if, elif, else, endif
        if name == 'if':
            result, rewritten = self.evalexpr(toks)
            if rewritten is not None:
                print(rewritten)
                sys.exit()
            else:
                pass
        if name == 'define':
            define_name = toks[0].value
            if self.condition == ConditionState.ALWAYS:
                if define_name in self.conditional_defines:
                    del self.conditional_defines[define_name]
                return True
            elif self.condition == ConditionState.CONDITIONAL:
                
                if define_name not in self.conditional_defines:
                    self.conditional_defines[define_name] = []
                def_list = self.conditional_defines[define_name]
                
            else:
                return True

        self.last_comment = ''
        return None

    def on_directive_unknown(self, directive: Token, toks: list[Token], ifpassthru: bool, precedingtoks: list[Token]):
        self.last_source = directive.source
        self.last_line = directive.lineno
        self.last_comment = ''
        return None

    def on_potential_include_guard(self, macro: str):
        return None

    def on_comment(self, tok: Token):
        self.last_comment = tok.value


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
