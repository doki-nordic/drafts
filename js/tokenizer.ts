

import cre from 'con-reg-exp';

interface TokenRegExpGroups {
    whitespace: string;
    newLine?: string;
    float?: string;
    integer?: string;
    comment?: string;
    operator?: string;
    string?: string;
    char?: string;
    identifier?: string;
    unknown?: string;
    endOfText?: string;
};

const tokenRegExp = cre.sticky.ignoreCase.legacy`
    // Skip white spaces (including backslash new line)
    whitespace: repeat ([\t ] or ('\\', optional \r, \n))
    {
        // New line ends directive
        newLine: (optional \r, \n)
    } or {
        // Floating point number
        float: {
            {
                at-least-1 digit, '.', repeat digit
            } or {
                repeat digit, '.', at-least-1 digit
            }
            optional ('e', optional [+-], at-least-1 digit)
            optional [FL]
        }
    } or {
        // Integer (hex or decimal)
        integer: {
            ('0x', at-least-1 [0-9A-F]) or (at-least-1 digit)
            (optional 'U', at-most-2 'L') or (at-most-2 'L', optional 'U')
        }
    } or {
        // Comment (multiline or single line)
        comment: {
            {
                '/*', lazy-repeat any, '*/'
            } or {
                '//', lazy-repeat (('\\', optional \r, \n) or any), end-of-line
            }
        }
    } or {
        operator: {
            // three-character operators
            '>>=' or '<<=' or
            // two-character operators
            '##' or '*=' or '/=' or '%=' or '+=' or '-=' or '&=' or '^=' or
            '|=' or '||' or '&&' or '==' or '!=' or '<=' or '>=' or '<<' or
            '>>' or '--' or '++' or '->' or '::' or
            // one-character operators
            '#' or '!' or '%' or '&' or '(' or ')' or '*' or '+' or ',' or
            '-' or '.' or '/' or ':' or ';' or '<' or '=' or '>' or '?' or
            '[' or ']' or '^' or '{' or '|' or '}' or '~'
        }
    } or {
        // String literal with optional prefix
        string: (optional 'L', '"', lazy-repeat (("\\", any) or any), '"')
        // stringSuffix: optional ([a-z_$\x7F-\uFFFF], repeat [a-z0-9_$\x7F-\uFFFF]) C++ suffix probably not needed during preprocessing
    } or {
        // Character literal with optional prefix
        char: (optional 'L', "'", lazy-repeat (("\\", any) or any), "'")
    } or {
        // Identifier
        identifier: ([a-z_$\x7F-\uFFFF], repeat [a-z0-9_$\x7F-\uFFFF])
    } or {
        unknown: any
    } or {
        endOfText: end-of-text
    }
`;

enum TokenType {
    newLine,
    floating,
    integer,
    comment,
    operator,
    string,
    character,
    identifier,
    unknown,
    end,
}

type Operator = '>>=' | '<<=' | '##' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^=' | '|='
    | '||' | '&&' | '==' | '!=' | '<=' | '>=' | '<<' | '>>' | '--' | '++' | '->' | '::' | '#'
    | '!' | '%' | '&' | '(' | ')' | '*' | '+' | ',' | '-' | '.' | '/' | ':' | ';' | '<' | '='
    | '>' | '?' | '[' | ']' | '^' | '{' | '|' | '}' | '~';

class TokenBase {

    public constructor(
        public type: TokenType,
        public position: number,
        public whitespace: string,
        public value: string,
        public tag?: any
    ) {
    }

    static create(type: TokenType, position: number, whitespace: string, value: string): Token {
        return new TokenBase(type, position, whitespace, value) as Token;
    }
}

interface TokenWithValue extends TokenBase {
    type: Exclude<TokenType, TokenType.operator>;
    value: string;
}

interface TokenWithOperator extends TokenBase {
    type: TokenType.operator;
    value: Operator;
}

export type Token = TokenWithValue | TokenWithOperator;


function* tokenize(input: string) {
    let groups: TokenRegExpGroups | undefined;
    let regexp = new RegExp(tokenRegExp);
    let position = 0;

    while ((groups = regexp.exec(input)?.groups as (TokenRegExpGroups | undefined))) {

        position += groups.whitespace.length;

        if (groups.newLine !== undefined) {
            yield TokenBase.create(TokenType.newLine, position, groups.whitespace, groups.newLine);
        } else if (groups.float !== undefined) {
            yield TokenBase.create(TokenType.floating, position, groups.whitespace, groups.float);
        } else if (groups.integer !== undefined) {
            yield TokenBase.create(TokenType.integer, position, groups.whitespace, groups.integer);
        } else if (groups.comment !== undefined) {
            yield TokenBase.create(TokenType.comment, position, groups.whitespace, groups.comment);
        } else if (groups.operator !== undefined) {
            yield TokenBase.create(TokenType.operator, position, groups.whitespace, groups.operator);
        } else if (groups.string !== undefined) {
            yield TokenBase.create(TokenType.string, position, groups.whitespace, groups.string);
        } else if (groups.char !== undefined) {
            yield TokenBase.create(TokenType.character, position, groups.whitespace, groups.char);
        } else if (groups.identifier !== undefined) {
            yield TokenBase.create(TokenType.identifier, position, groups.whitespace, groups.identifier);
        } else if (groups.unknown !== undefined) {
            yield TokenBase.create(TokenType.unknown, position, groups.whitespace, groups.unknown);
        } else if (groups.endOfText !== undefined) {
            yield TokenBase.create(TokenType.end, position, groups.whitespace, '');
            return;
        } else {
            break;
        }

        position = regexp.lastIndex;
    }

    throw new Error('This should never happen.');
}


export class Tokenizer {

    private peekedTokens: Token[] = [];
    private generator: Generator<Token>;
    private endToken: Token;

    constructor(input: string) {
        this.generator = tokenize(input);
        this.endToken = TokenBase.create(TokenType.end, input.length, '', '');
    }

    read(): Token {
        if (this.peekedTokens.length > 0) {
            return this.peekedTokens.shift() as Token;
        } else {
            return this.generator.next().value || this.endToken;
        }
    }

    peek(index: number = 0): Token {
        while (index >= this.peekedTokens.length) {
            this.peekedTokens.push(this.generator.next().value || this.endToken);
        }
        return this.peekedTokens[index];
    }

    unread(token: Token): void {
        this.peekedTokens.unshift(token);
    }
}

function tokensFromString(text: string, addEndToken: boolean = false): Token[] {
    let res = [...tokenize(text)];
    if (!addEndToken) {
        res.pop();
    }
    return res;
}


interface Macro {
    name: string;
    parameters: string[] | undefined;
    ellipsis: boolean;
    tokens: Token[];
}

let macros: { [key: string]: Macro } = {};

function define(name: string, body: string);
function define(name: string, parameters: string[], body: string);
function define(name: string, parametersOrBody: string[] | string, body?: string) {

    let parameters: string[] | undefined;
    if (body === undefined) {
        body = parametersOrBody as string;
        parameters = undefined;
    } else {
        parameters = parametersOrBody as string[];
    }

    let ellipsis = false;
    if (parameters?.at(-1) === '...') {
        ellipsis = true;
        parameters = parameters.slice(0, parameters.length - 1);
    }

    macros[name] = {
        name,
        parameters,
        ellipsis,
        tokens: tokensFromString(body),
    };
}

function getArguments(tokens: Token[], start: number, maxCount: number): [Token[][], Token[], number] | [undefined, undefined, undefined] {
    let args: Token[][] = [];
    let bracketStack: string[] = [];
    let pos = start;
    let currentArgStart = start;
    while (true) {
        let token = tokens[pos];
        pos++;
        if (token === undefined) {
            console.error(`Unexpected and of input.`);
            return [undefined, undefined, undefined]; // TODO: some warning?
        }
        // non-operator tokens are not interesting here
        if (token.type !== TokenType.operator) {
            continue;
        }
        let operator = token.value;
        let br: string | undefined = undefined;
        switch (operator) {
            case '(':
            case '{':
            case '[':
                bracketStack.push(operator);
                break;
            case ')':
                if (bracketStack.length === 0) {
                    if (args.length < maxCount) {
                        args.push(tokens.slice(currentArgStart, pos - 1));
                        return [args, [], pos];
                    } else {
                        let vaArgs = tokens.slice(currentArgStart, pos - 1);
                        return [args, vaArgs, pos];
                    }
                }
                br = '(';
            // no-break
            case '}':
                br = br || '{';
            // no-break
            case ']': {
                br = br || '[';
                let expected = bracketStack.pop();
                if (expected === undefined) {
                    console.error(`Unmatched closing bracket.`);
                    return [undefined, undefined, undefined]; // TODO: some warning?
                }
                if (expected !== br) {
                    console.error(`Expecting "${expected}" but found "${br}".`);
                    return [undefined, undefined, undefined]; // TODO: some warning?
                }
                break;
            }
            case ',':
                if (args.length < maxCount) {
                    args.push(tokens.slice(currentArgStart, pos - 1));
                    currentArgStart = pos;
                }
                break;
        }
    }
}

function macroReplacement(tokens: Token[]) {
    tokens = [...tokens];
    let pos = 0;
    // Set of forbidden macros to avoid nested macros
    let forbiddenMacros = new Set<Macro>();
    // Stack of locations where macros are allowed again, ordered from highest (stack bottom) to lowest (stack top).
    let forbiddenEndStack: { macro: Macro, index: number }[] = [];
    // Offset of index in stack. To avoid multiple updates of all stack items.
    let indexOffset = 0;
    while (pos < tokens.length) {
        // Allow macros that should be allowed at this point.
        while (forbiddenEndStack.length > 0 && forbiddenEndStack.at(-1)!.index + indexOffset <= pos) {
            let macro = forbiddenEndStack.pop()!.macro;
            forbiddenMacros.delete(macro);
        }
        let token = tokens[pos];
        // Skip any tokes that are not macros
        if (token.type !== TokenType.identifier || !macros[token.value]) {
            pos++;
            continue;
        }
        let macro = macros[token.value];
        // Skip expansion if macro is nested
        if (forbiddenMacros.has(macro)) {
            pos++;
            continue;
        }
        // Handle different kinds of macro
        if (macro.parameters === undefined) {
            // Object-like macro
            tokens.splice(pos, 1, ...macro.tokens); // TODO: avoid ... to avoid stack overflows
            // Move end of forbidden indexes based on token count change
            indexOffset += macro.tokens.length - 1;
            // Forbid this macro until the end of replacement
            forbiddenMacros.add(macro);
            forbiddenEndStack.push({
                macro,
                index: pos + macro.tokens.length - indexOffset,
            });
            continue; // re-scan new content
        } else {
            // Function-like macro
            let next_token = tokens[pos + 1];
            // If the next token is not '(', skip this macro expansion since the macro expects arguments.
            if (!next_token || next_token.type !== TokenType.operator || next_token.value !== '(') {
                pos++;
                continue;
            }
            // Get arguments
            let [args, vaArgs, newPos] = getArguments(tokens, pos + 2, macro.parameters.length);
            // Skip this macro expansion since we had some problem getting the arguments
            if (args === undefined || vaArgs == undefined || newPos === undefined) {
                pos++;
                continue;
            }
            // Check arguments count
            if (args.length < macro.parameters.length || (vaArgs.length > 0 && !macro.ellipsis)) {
                console.error('wrong number of arguments');
                pos++;
                continue;
            }
            // Argument substitution
            let newTokens = argumentSubstitution(macro, args, vaArgs);
            let removedLength = newPos - pos;
            // Put result tokens
            tokens.splice(pos, removedLength, ...newTokens); // TODO: avoid ... to avoid stack overflows
            // Allow macros that should be allowed before end of removed tokens
            while (forbiddenEndStack.length > 0 && forbiddenEndStack.at(-1)!.index + indexOffset < pos + removedLength) {
                let macro = forbiddenEndStack.pop()!.macro;
                forbiddenMacros.delete(macro);
            }
            // Move end of forbidden indexes based on token count change
            indexOffset += newTokens.length - removedLength;
            // Forbid this macro until the end of replacement
            forbiddenMacros.add(macro);
            forbiddenEndStack.push({
                macro,
                index: pos + newTokens.length - indexOffset,
            });
            continue; // re-scan new content
        }
    }
    return tokens;
}

interface ArgInfo {
    sourceTokens: Token[];
    replacedTokens?: Token[];
};

function argumentSubstitution(macro: Macro, args: Token[][], vaArgs: Token[]): Token[] {
    if (!macro.parameters) throw new Error('Assertion failed.');

    let argsInfo: { [name: string]: ArgInfo } = Object.create(null);
    for (let i = 0; i < args.length; i++) {
        argsInfo[macro.parameters[i]] = {
            sourceTokens: args[i],
        };
    }

    if (macro.ellipsis) {
        argsInfo['__VA_ARGS__'] = {
            sourceTokens: vaArgs, // TODO: check if each argument of va_args should be replaced separately?
        }
    }

    let result: Token[] = [];
    for (let i = 0; i < macro.tokens.length; i++) {
        let token = macro.tokens[i];
        if (token.type === TokenType.identifier && token.value in argsInfo) {
            let info = argsInfo[token.value];
            if (!info.replacedTokens) {
                info.replacedTokens = macroReplacement(info.sourceTokens);
            }
            result.push(...info.replacedTokens);
        } else {
            result.push(token);
        }
    }

    return result;
}

function combineTokens(tokens: Token[]): string {
    let arr: string[] = [];
    for (let tok of tokens) {
        arr.push(tok.whitespace);
        arr.push(tok.value);
    }
    return arr.join('');
}


define('EVAL0', ['...'], '__VA_ARGS__');
define('EVAL1', ['...'], 'EVAL0(EVAL0(EVAL0(__VA_ARGS__)))');
define('EVAL2', ['...'], 'EVAL1(EVAL1(EVAL1(__VA_ARGS__)))');
define('EVAL3', ['...'], 'EVAL2(EVAL2(EVAL2(__VA_ARGS__)))');
define('EVAL4', ['...'], 'EVAL3(EVAL3(EVAL3(__VA_ARGS__)))');
define('EVAL', ['...'], ' EVAL4(EVAL4(EVAL4(__VA_ARGS__)))');

define('MAP_END', ['...'], '');
define('MAP_OUT', '');
define('MAP_COMMA', ',');


define('MAP_GET_END2', [''], '0, MAP_END');
define('MAP_GET_END1', ['...'], 'MAP_GET_END2');
define('MAP_GET_END', ['...'], 'MAP_GET_END1');
define('MAP_NEXT0', ['test', 'next', '...'], 'next MAP_OUT');
define('MAP_NEXT1', ['test', 'next'], 'MAP_NEXT0(test, next, 0)');
define('MAP_NEXT', ['test', 'next'], 'MAP_NEXT1(MAP_GET_END test, next)');

define('MAP0', ['f', 'x', 'peek', '...'], 'f (x) MAP_NEXT(peek, MAP1)(f, peek, __VA_ARGS__)');
define('MAP1', ['f', 'x', 'peek', '...'], 'f (x) MAP_NEXT(peek, MAP0)(f, peek, __VA_ARGS__)');
define('MAP', ['f', '...'], 'EVAL(MAP1(f, __VA_ARGS__, ()()(), ()()(), ()()(), 0))');

define('STRING', ['x'], '[x]');
define('ENUMERATOR', '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18');


define('f', ['a'], 'a*g');
define('g', ['a'], 'f(a)');


//console.log(combineTokens(macroReplacement(tokensFromString('MAP(STRING,1,2,3,4)'))));
console.log(combineTokens(macroReplacement(tokensFromString('f(2)(9)(1)'))));

//console.log(combineTokens(argumentSubstitution(macros['F'], [tokensFromString('123')])));
//console.log(combineTokens(argumentSubstitution(macros['G'], [tokensFromString('456'), tokensFromString('789')])));

