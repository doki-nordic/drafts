

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
    whitespace: repeat ([\t ] or ('\\', optional \r, \n))
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
    directive,
    floating,
    integer,
    comment,
    operator,
    string,
    character,
    identifier,
    unknown,
    end,
    placeholder,
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
        public position: number,
        public source: string,
        public whitespace: string,
        public value: string,
        public data?: any,
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


function* tokenize(input: string, source: string, additionalTokens?: Token[], regexp?: RegExp, positionOffset: number = 0) {
    let groups: GlobalTokenRegExpGroups | undefined;
    regexp = new RegExp(regexp || globalTokenRegExp);
    let position = 0;

    while ((groups = regexp.exec(input)?.groups as (GlobalTokenRegExpGroups | undefined))) {

        let whitespace = (groups.whitespace !== undefined ? groups.whitespace : groups.directiveWhitespace) as string;

        position += whitespace.length;

        if (groups.directiveName !== undefined) {
            let innerOffset = position + groups.directivePrefix.length + groups.directiveName.length;
            let directive: Directive = {
                name: groups.directiveName,
                tokens: [...tokenize(groups.directiveBody, source, undefined, innerTokenRegExp, innerOffset)],
            };
            yield new TokenBase(
                TokenType.directive,
                position + positionOffset,
                source,
                whitespace,
                groups.directivePrefix + groups.directiveName + groups.directiveBody,
                directive) as Token;
        } else if (groups.float !== undefined) {
            yield new TokenBase(TokenType.floating, position + positionOffset, source, whitespace, groups.float) as Token;
        } else if (groups.integer !== undefined) {
            yield new TokenBase(TokenType.integer, position + positionOffset, source, whitespace, groups.integer) as Token;
        } else if (groups.comment !== undefined) {
            yield new TokenBase(TokenType.comment, position + positionOffset, source, whitespace, groups.comment) as Token;
        } else if (groups.operator !== undefined) {
            yield new TokenBase(TokenType.operator, position + positionOffset, source, whitespace, groups.operator) as Token;
        } else if (groups.string !== undefined) {
            yield new TokenBase(TokenType.string, position + positionOffset, source, whitespace, groups.string) as Token;
        } else if (groups.char !== undefined) {
            yield new TokenBase(TokenType.character, position + positionOffset, source, whitespace, groups.char) as Token;
        } else if (groups.identifier !== undefined) {
            yield new TokenBase(TokenType.identifier, position + positionOffset, source, whitespace, groups.identifier) as Token;
        } else if (groups.unknown !== undefined) {
            yield new TokenBase(TokenType.unknown, position + positionOffset, source, whitespace, groups.unknown) as Token;
        } else if (groups.endOfText !== undefined) {
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

function* tokenizeEmpty() {
    return;
}

export class Tokenizer {

    private stack: Generator<Token>[];
    private endToken: Token;
    private peekedTokens: Token[];

    public constructor();
    public constructor(input: string, source: string);
    public constructor(input?: string, source?: string) {
        if (input !== undefined && source != undefined) {
            this.stack = [tokenize(input, source)];
            this.endToken = new TokenBase(TokenType.end, input.length, source, '', '') as Token;
        } else {
            this.stack = [tokenizeEmpty()];
            this.endToken = new TokenBase(TokenType.end, 0, '[internal]', '', '') as Token;
        }
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
