
import * as fs from 'node:fs';
import cre from 'con-reg-exp';
import { describe, expect, test } from 'vitest';
import { Listener, Parser, Macro } from '../../js/parser';
import { Token, TokenWithDirective } from '../../js/tokenizer';

const ws = cre`repeat [\t ]`;

const groupSeparator = cre`
    begin-of-line, ${ws}
    "//", ${ws}
    at-least-5 "=", ${ws}
    1: lazy-repeat any
    end-of-line
    `;

const testSeparator = cre`
    begin-of-line, ${ws}
    "//", ${ws}
    at-least-5 "-", ${ws}
    1: lazy-repeat any
    end-of-line
    `;

const expectComment = cre.global`
    begin-of-line, ${ws}
    "//", ${ws}
    "expect", ${ws}
    1: lazy-repeat any
    ":"
    2: lazy-repeat any
    end-of-line
    `;

const tokenRegExp = cre.sticky.ignoreCase.legacy`
    1: {
        repeat [\t ]
        {
            // Floating point number
            {
                at-least-1 digit, '.', repeat digit
            } or {
                repeat digit, '.', at-least-1 digit
            }
            optional ('e', optional [+-], at-least-1 digit)
            optional [FL]
        } or {
            // Integer
            ('0x', at-least-1 [0-9A-F]) or (at-least-1 digit)
            (optional 'U', at-most-2 'L') or (at-most-2 'L', optional 'U')
        } or {
            // Multi-line comment
            '/*', lazy-repeat any, '*/'
        } or {
            // Single-line comment
            '//', lazy-repeat (('\\', optional \r, \n) or any), end-of-line
        } or {
            // three-character operators
            '>>=' or '<<=' or '...' or
            // two-character operators
            '##' or '*=' or '/=' or '%=' or '+=' or '-=' or '&=' or '^=' or
            '|=' or '||' or '&&' or '==' or '!=' or '<=' or '>=' or '<<' or
            '>>' or '--' or '++' or '->' or '::' or
            // one-character operators
            '#' or '!' or '%' or '&' or '(' or ')' or '*' or '+' or ',' or
            '-' or '.' or '/' or ':' or ';' or '<' or '=' or '>' or '?' or
            '[' or ']' or '^' or '{' or '|' or '}' or '~'
        } or {
            // String literal with optional prefix
            optional 'L', '"', lazy-repeat (("\\", any) or any), '"'
        } or {
            // Character literal with optional prefix
            optional 'L', "'", lazy-repeat (("\\", any) or any), "'"
        } or {
            // Identifier
            [a-z_$\x7F-\uFFFF], repeat [a-z0-9_$\x7F-\uFFFF]
        } or {
            any
        }
    }
`;

function normalizeOutput(text: string): string {
    let parts = text
        .split(tokenRegExp)
        .map(x => x.trim())
        .filter(x => x && !x.match(/^(?:\/\/|\/\*)/));
    return parts.join(' ');
}

function runParser(input: string, warnings: string[], fileName: string): string {

    let out = '';
    
    let listener: Listener = {
    
        defineDirective(parser: Parser, token: TokenWithDirective): void {
            parser.addMacro(parser.parseMacroDefinition(token.data.tokens));
        },
    
        undefDirective(parser: Parser, token: TokenWithDirective): void {
            parser.removeMacro(parser.parseUndef(token.data.tokens));
        },
    
        includeDirective(parser: Parser, token: TokenWithDirective): void {
            let { path, system } = parser.parseIncludePath(token.data.tokens);
            let fullPath = `test/preprocessor/${path}`;
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Include file "${path}" not found.`);
            }
            let text = fs.readFileSync(fullPath, 'utf8');
            parser.include(text, path);
        },
    
        ifDirective(parser: Parser, token: TokenWithDirective): void {
            
        },
    
        elifDirective(parser: Parser, token: TokenWithDirective): void {
            
        },
    
        elseDirective(parser: Parser, token: TokenWithDirective): void {
            
        },
    
        endifDirective(parser: Parser, token: TokenWithDirective): void {
            
        },
    
        unknownDirective(parser: Parser, token: TokenWithDirective): void {
            
        },
    
        objectMacro(parser: Parser, macro: Macro, token: Token): void {
            parser.objectReplacement(macro);
        },
    
        functionMacro(parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]): void {
            parser.functionReplacement(macro, args);
        },
    
        warning(parser: Parser | Parser, tokens: Token[], message: string): void {
            warnings.push(message);
        },
    
        error(parser: Parser | Parser, tokens: Token[], message: string): void {
            throw new Error(message);
        },
    
        code(parser: Parser, token: Token): void {
            let whitespace = token.whitespace;
            if (whitespace.length === 0) {
                let lastChar = out.length > 0 ? out[out.length - 1] : '!';
                if (lastChar.match(/[a-z0-9_$]/i)) whitespace = ' ';
            }
            out += whitespace;
            out += token.value;
        }
    }

    let p = new Parser(listener);
    p.parse(input, fileName);

    return out;
}

function runTest(name: string, prologue: string, text: string, fileName: string): void {
    let expectedText: string | undefined = undefined;
    let expectedError: string | undefined = undefined;
    let expectedWarnings: string[] = [];
    let textReplaced = (prologue + '\n' + text).replace(expectComment, (_m, type, text) => {
        type = type.trim();
        text = text.trim();
        switch (type) {
            case '': expectedText = (expectedText || '') + text; break;
            case 'error': expectedError = text; break;
            case 'warning': expectedWarnings.push(text); break;
            default: throw new Error(`Unknown expectation "expect ${type}" in "${name}".`);
        };
        return '';
    });
    test(name, () => {
        let warnings = [];
        if (expectedError) {
            expect(() => runParser(textReplaced, warnings, fileName))
                .toThrow(cre.cache`begin-of-text, "${expectedError}", end-of-text`);
        } else {
            let output = (runParser(textReplaced, warnings, fileName));
            if (expectedText !== undefined) {
                expect(normalizeOutput(output))
                    .toEqual(normalizeOutput(expectedText));
            }
            expect(new Set(warnings))
                .toEqual(new Set(expectedWarnings));
        }
    });
}

function runTestsForFile(fullPath: string, fileName: string) {

    let text = fs.readFileSync(fullPath, 'utf-8');
    let groups = text.split(groupSeparator);

    groups.shift(); // skip header
    for (let i = 0; i < groups.length; i += 2) {
        let groupName = groups[i].trim();
        let groupText = groups[i + 1].trim();
        let tests = groupText.split(testSeparator);
        if (tests.length === 1) {
            tests = ['', groupName, groupText];
        }
        let prologue = tests.shift() || '';
        for (let j = 0; j < tests.length; j += 2) {
            let testName = tests[j].trim();
            let testText = tests[j + 1].trim();
            runTest(testName, prologue, testText, fileName);
        }
    }

}


for (let fileName of fs.readdirSync('test/preprocessor')) {
    if (fileName.endsWith('.c')) {
        describe(fileName, () => runTestsForFile(`test/preprocessor/${fileName}`, fileName));
    }
}

/*

describe('Capture', () => {
    test('Positional', () => {
        expect(cre`1: any`).toStrictEqual(/(.)/su);
        expect(cre`1: any, 2: digit`).toStrictEqual(/(.)(\d)/su);
        expect(cre`1: (any, 2: digit)`).toStrictEqual(/(.(\d))/su);
    });
    test('Positional failure', () => {
        expect(() => cre`0: any`).toThrow();
        expect(() => cre`2: any`).toThrow();
        expect(() => cre`1: (any, 1: digit)`).toThrow();
        expect(() => cre`first: digit, 1: any`).toThrow();
    });
    test('Mixed', () => {
        expect(cre`first: any, 2: digit`).toStrictEqual(/(?<first>.)(\d)/su);
        expect(cre`first: (any, 2: digit)`).toStrictEqual(/(?<first>.(\d))/su);
        expect(cre`1: any, two: digit, 3: word-char`).toStrictEqual(/(.)(?<two>\d)(\w)/su);
    });
});*/