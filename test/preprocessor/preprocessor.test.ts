
import * as fs from 'node:fs';
import cre from 'con-reg-exp';
import { describe, expect, test } from 'vitest';
import { preprocess } from './utils';

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

function runParser(input: string, warningsArg: string[], fileName: string): string {
    let [output, errors, warnings] = preprocess(fileName, input, ['test/preprocessor']);
    if (errors.length) {
        throw new Error(errors[0]);
    }
    warningsArg.push(...warnings);
    return output;
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
            let output = runParser(textReplaced, warnings, fileName);
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
