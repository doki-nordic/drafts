

import cre from 'con-reg-exp';

interface TokenRegExpGroups {
    directiveWhitespace?: string;
    directive?: string;
    whitespace?: string;
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
    {
        directiveWhitespace: {
            repeat ([\t ] or ('\\', optional \r, \n))
            (optional \r, \n) or begin-of-text
            repeat ([\t ] or ('\\', optional \r, \n))
        }
        directive: {
            "#"
            repeat ([\t ] or ('\\', optional \r, \n))
            {
                "define" or
                "include" or
                "undef" or
                "ifdef" or
                "ifndef" or
                "if" or
                "elif" or
                "else" or
                "endif"
            }
            lookahead [\t ]
        }
    } or {
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
    }
`;

export enum TokenType {
    directive,
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

type Operator = '>>=' | '<<=' | '...' | '##' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^='
    | '|=' | '||' | '&&' | '==' | '!=' | '<=' | '>=' | '<<' | '>>' | '--' | '++' | '->' | '::'
    | '#' | '!' | '%' | '&' | '(' | ')' | '*' | '+' | ',' | '-' | '.' | '/' | ':' | ';' | '<'
    | '=' | '>' | '?' | '[' | ']' | '^' | '{' | '|' | '}' | '~';

class TokenBase {
    public constructor(
        public type: TokenType,
        public position: number,
        public source: string,
        public whitespace: string,
        public value: string,
    ) { }
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


function* tokenize(input: string, source: string, additionalTokens?: Token[]) {
    let groups: TokenRegExpGroups | undefined;
    let regexp = new RegExp(tokenRegExp);
    let position = 0;

    while ((groups = regexp.exec(input)?.groups as (TokenRegExpGroups | undefined))) {

        let whitespace = (groups.whitespace !== undefined ? groups.whitespace : groups.directiveWhitespace) as string;

        position += whitespace.length;

        if (groups.directive !== undefined) {
            yield new TokenBase(TokenType.directive, position, source, whitespace, groups.directive) as Token;
        } else if (groups.newLine !== undefined) {
            yield new TokenBase(TokenType.newLine, position, source, whitespace, groups.newLine) as Token;
        } else if (groups.float !== undefined) {
            yield new TokenBase(TokenType.floating, position, source, whitespace, groups.float) as Token;
        } else if (groups.integer !== undefined) {
            yield new TokenBase(TokenType.integer, position, source, whitespace, groups.integer) as Token;
        } else if (groups.comment !== undefined) {
            yield new TokenBase(TokenType.comment, position, source, whitespace, groups.comment) as Token;
        } else if (groups.operator !== undefined) {
            yield new TokenBase(TokenType.operator, position, source, whitespace, groups.operator) as Token;
        } else if (groups.string !== undefined) {
            yield new TokenBase(TokenType.string, position, source, whitespace, groups.string) as Token;
        } else if (groups.char !== undefined) {
            yield new TokenBase(TokenType.character, position, source, whitespace, groups.char) as Token;
        } else if (groups.identifier !== undefined) {
            yield new TokenBase(TokenType.identifier, position, source, whitespace, groups.identifier) as Token;
        } else if (groups.unknown !== undefined) {
            yield new TokenBase(TokenType.unknown, position, source, whitespace, groups.unknown) as Token;
        } else if (groups.endOfText !== undefined) {
            yield new TokenBase(TokenType.newLine, position, source, whitespace, '\n') as Token;
            if (additionalTokens !== undefined) {
                for (let t of additionalTokens) {
                    yield t;
                }
            }
            return;
        } else {
            break;
        }

        position = regexp.lastIndex;
    }

    throw new Error('This should never happen.');
}

export class Tokenizer {

    private stack: Generator<Token>[];
    private endToken: Token;
    private peekedTokens: Token[];

    public constructor(input: string, source: string) {
        this.stack = [tokenize(input, source)];
        this.endToken = new TokenBase(TokenType.end, input.length, source, '', '') as Token;
        this.peekedTokens = [];
    }

    public read(): Token {
        if (this.peekedTokens.length > 0) {
            let res = this.peekedTokens.shift() as Token;
            return res;
        }
        let top = this.stack.at(-1) as Generator<Token>;
        let token: Token;
        while (true) {
            token = top.next().value;
            if (token === undefined && this.stack.length > 1) {
                this.stack.pop();
                top = this.stack.at(-1) as Generator<Token>;
            } else {
                break;
            }
        }
        return token !== undefined ? token : this.endToken;
    }

    public peek(): Token {
        if (this.peekedTokens.length === 0) {
            this.peekedTokens.push(this.read());
        }
        return this.peekedTokens[0];
    }

    public skipNewLines(): Token[] {
        let result: Token[] = [];
        let token = this.peek();
        while (token.type === TokenType.newLine) {
            result.push(token);
            this.read();
            token = this.peek();
        }
        return result;
    }

    public push(tokens: Token | Token[]): void {
        if (Array.isArray(tokens)) {
            this.peekedTokens.unshift(...tokens);
        } else {
            this.peekedTokens.unshift(tokens);
        }
    }

    public include(input: string, source: string) {
        this.stack.push(tokenize(input, source, this.peekedTokens));
        this.peekedTokens = [];
    }
}
