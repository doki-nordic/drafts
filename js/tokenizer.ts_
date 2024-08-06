

import cre from 'con-reg-exp';

interface InnerTokenRegExpGroups {
    whitespace?: string;
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

interface GlobalTokenRegExpGroups extends InnerTokenRegExpGroups {
    directiveWhitespace: string;
    directivePrefix: string;
    directiveName: string;
    directiveBody: string;
};


const innerTokenRegExp = cre.sticky.ignoreCase.legacy`
    // Skip white spaces (including backslash new line)
    whitespace: repeat (whitespace or ('\\', optional \r, \n))
    {
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
            '>>=' or '<<=' or '...' or
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


const globalTokenRegExp = cre.sticky.ignoreCase.legacy.global`
    {
        directiveWhitespace: at-least-1 {
            repeat ([\t ] or ('\\', optional \r, \n))
            (optional \r, \n) or begin-of-text
            repeat ([\t ] or ('\\', optional \r, \n))
        }
        directivePrefix: {
            "#"
            repeat ([\t ] or ('\\', optional \r, \n))
        }
        directiveName: at-least-1 [a-z0-9_]
        directiveBody: {
            lazy-repeat (('\\', optional \r, \n) or any)
        }
        lookahead (\r or \n or end-of-text)
    } or {
        ${innerTokenRegExp}
    }
`;


export enum TokenType {
    directive = 0,
    floating = 1,
    integer = 2,
    comment = 3,
    operator = 4,
    string = 5,
    character = 6,
    identifier = 7,
    unknown = 8,
    end = 9,
    placeholder = 10,
}

export type Operator = '>>=' | '<<=' | '...' | '##' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^='
    | '|=' | '||' | '&&' | '==' | '!=' | '<=' | '>=' | '<<' | '>>' | '--' | '++' | '->' | '::'
    | '#' | '!' | '%' | '&' | '(' | ')' | '*' | '+' | ',' | '-' | '.' | '/' | ':' | ';' | '<'
    | '=' | '>' | '?' | '[' | ']' | '^' | '{' | '|' | '}' | '~';

export interface Directive {
    name: string;
    tokens: Token[];
};

export class TokenBase {
    public constructor(
        public type: TokenType,
        public line: number,
        public source: string, // Maybe rename all "source" to "file"
        public whitespace: string,
        public value: string,
        public data?: any,
        public direct?: boolean,
    ) { }
}

export interface TokenWithValue extends Omit<TokenBase, 'data'> {
    type: Exclude<TokenType, TokenType.operator | TokenType.directive | TokenType.placeholder>;
}

export interface TokenWithOperator extends Omit<TokenBase, 'data'> {
    type: TokenType.operator;
    value: Operator;
}

export interface TokenWithDirective extends TokenBase {
    type: TokenType.directive;
    data: Directive;
}

export interface TokenWithData extends TokenBase {
    type: TokenType.placeholder;
    data: any;
}

export type Token = TokenWithValue | TokenWithOperator | TokenWithDirective | TokenWithData;


function* tokenize(input: string, source: string, regexp?: RegExp, lineOffset: number = 0) {
    let groups: GlobalTokenRegExpGroups | undefined;
    regexp = new RegExp(regexp || globalTokenRegExp);
    let offset = 0;
    let line = 0;

    while ((groups = regexp.exec(input)?.groups as (GlobalTokenRegExpGroups | undefined))) {

        let whitespace = (groups.whitespace !== undefined ? groups.whitespace : groups.directiveWhitespace) as string;

        offset += whitespace.length;
        line += whitespace.match(/\n/g)?.length || 0;

        if (groups.directiveName !== undefined) {
            let directive: Directive = {
                name: groups.directiveName,
                tokens: [...tokenize(groups.directiveBody, source, innerTokenRegExp, line + lineOffset)],
            };
            yield new TokenBase(
                TokenType.directive,
                line + lineOffset,
                source,
                whitespace,
                groups.directivePrefix + groups.directiveName + groups.directiveBody,
                directive) as Token;
        } else if (groups.float !== undefined) {
            yield new TokenBase(TokenType.floating, line + lineOffset, source, whitespace, groups.float) as Token;
        } else if (groups.integer !== undefined) {
            yield new TokenBase(TokenType.integer, line + lineOffset, source, whitespace, groups.integer) as Token;
        } else if (groups.comment !== undefined) {
            yield new TokenBase(TokenType.comment, line + lineOffset, source, whitespace, groups.comment) as Token;
        } else if (groups.operator !== undefined) {
            yield new TokenBase(TokenType.operator, line + lineOffset, source, whitespace, groups.operator) as Token;
        } else if (groups.string !== undefined) {
            yield new TokenBase(TokenType.string, line + lineOffset, source, whitespace, groups.string) as Token;
        } else if (groups.char !== undefined) {
            yield new TokenBase(TokenType.character, line + lineOffset, source, whitespace, groups.char) as Token;
        } else if (groups.identifier !== undefined) {
            yield new TokenBase(TokenType.identifier, line + lineOffset, source, whitespace, groups.identifier) as Token;
        } else if (groups.unknown !== undefined) {
            yield new TokenBase(TokenType.unknown, line + lineOffset, source, whitespace, groups.unknown) as Token;
        } else if (groups.endOfText !== undefined) {
            return;
        } else {
            break;
        }

        line += input.substring(offset, regexp.lastIndex).match(/\n/g)?.length || 0;
        offset = regexp.lastIndex;
    }

    throw new Error('This should never happen.');
}

function* tokenizeEmpty() {
    return;
}

interface StackEntry {
    generator: Generator<Token>;
    peekedTokens: Token[];
}

export class Tokenizer {

    private stack: StackEntry[] = [];
    private endToken: Token;
    private peekedTokens: Token[];

    public constructor();
    public constructor(input: string, source: string);
    public constructor(input?: string, source?: string) {
        if (input !== undefined && source != undefined) {
            this.stack = [{ generator: tokenize(input, source), peekedTokens: [] }];
            this.endToken = new TokenBase(TokenType.end, input.length, source, '', '') as Token;
        } else {
            this.stack = [{ generator: tokenizeEmpty(), peekedTokens: [] }];
            this.endToken = new TokenBase(TokenType.end, 0, '[internal]', '', '') as Token;
        }
        this.peekedTokens = [];
    }

    public read(): Token {
        while (true) {
            if (this.peekedTokens.length > 0) {
                let res = this.peekedTokens.shift() as Token;
                res.direct = false;
                return res;
            }
            let top = this.stack.at(-1) as StackEntry;
            let token = top.generator.next().value;
            if (token !== undefined) {
                token.direct = true;
                return token;
            } else if (this.stack.length === 1) {
                return this.endToken;
            }
            this.stack.pop();
            this.peekedTokens = top.peekedTokens;
        }
    }

    public push(tokens: Token | Token[]): void {
        if (Array.isArray(tokens)) {
            this.peekedTokens.unshift(...tokens);
        } else {
            this.peekedTokens.unshift(tokens);
        }
    }

    public include(input: string, source: string) {
        this.stack.push({
            generator: tokenize(input, source),
            peekedTokens: this.peekedTokens,
        });
        this.peekedTokens = [];
    }
}
