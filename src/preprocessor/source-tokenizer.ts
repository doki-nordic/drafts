

import cre from 'con-reg-exp';
import { SourceMap } from './source-map';
import { Token, TokenType } from './token';

interface PatternGroups {
    whitespace?: string;
    string?: string;
    character?: string;
    identifier?: string;
    number?: string;
    mlComment?: string;
    slComment?: string;
    punctuator?: string;
    unknown?: string;
    endOfText?: string;
    directivePrefix?: string;
    directiveHash?: string;
    directiveName?: string;
    newLine?: string;
    headerName?: string;
    rawText?: string;
};


const ppTokenSolidPattern = cre.legacy.sticky`
    {
        // string-literal
        string: {
            optional ('u8' or [uUL])
            '"'
            lazy-repeat (("\\", any) or any)
            '"'
        }
    } or {
        // character-constant
        character: {
            optional [uUL]
            "'"
            lazy-repeat (("\\", any) or any)
            "'"
        }
    } or {
        // identifier
        identifier: {
            [a-zA-Z_$\x80-\uFFFF]
            repeat [a-zA-Z0-9_$\x80-\uFFFF]
        }
    } or {
        // pp-number
        number: {
            optional "."
            [0-9]
            repeat {
                ([eEpP], [+-])
                or [a-zA-Z0-9_$\x80-\uFFFF]
                or "."
            }
        }
    } or {
        // punctuator
        punctuator: {
            '...' or '<<=' or '>>='
            or '->' or '++' or '--' or '<<' or '>>' or '<=' or '>=' or '==' or '!=' or '&&'
            or '||' or '*=' or '/=' or '%=' or '+=' or '-=' or '&=' or '^=' or '|=' or '##'
            or [[\](){}.&*+\-~!/%<>^|?:;=,#']
        }
    }
`;

const ppTokenPattern = cre.legacy.sticky`
    {
        // whitespace
        whitespace: at-least-1 whitespace
    } or {
        // multi-line comment
        mlComment: {
            '/*', lazy-repeat any, '*/'
        }
    } or {
        // single-line comment
        slComment: {
            '//'
            lazy-repeat any
            \n or end-of-text
        }
    } or {
        ${ppTokenSolidPattern}
    } or {
        // non-whitespace character that cannot be one of the above
        unknown: any
    } or {
        // end of text detection
        endOfText: end-of-text
    }
`;

const directivePrefixPattern = cre.legacy`
    1: {
        {
            // whitespace
            at-least-1 whitespace
        } or {
            // multi-line comment
            '/*', lazy-repeat any, '*/'
        } or {
            "#"
        }
    }
`;

const optWS = cre.legacy`repeat [ \t]`;

const textPattern = cre.legacy.sticky`
    {
        begin-of-line
        directivePrefix: {
            ${optWS}
            repeat {
                '/*', lazy-repeat any, '*/'
                ${optWS}
            }
        }
        directiveHash: {
            "#"
            ${optWS}
            repeat {
                '/*', lazy-repeat any, '*/'
                ${optWS}
            }
        }
        directiveName: {
            [a-zA-Z_$]
            repeat [a-zA-Z0-9_$]
        }
        lookahead not ([a-zA-Z0-9_$])
    } or {
        ${ppTokenPattern}
    }
`;

const directivePattern = cre.legacy.sticky`
    {
        newLine: (${optWS}, \n, ${optWS})
    } or {
        ${ppTokenPattern}
    }
`;

const includePattern = cre.legacy.sticky`
    {
        "<"
        headerName: lazy-repeat not \n
        ">"
    } or {
        ${ppTokenPattern}
    }
`;

const rawPattern = cre.legacy.sticky`
    {
        rawText: lazy-repeat any
        \n or end-of-text
    }
`;


export enum SourceTokenizerMode {
    Text,
    Directive,
    Include,
    Raw,
}


export class SourceTokenizer {

    private generator: Generator<Token>;
    private mode: SourceTokenizerMode;

    public constructor(
        public sourceCode: string,
        public sourceMap: SourceMap,
    ) {
        this.mode = SourceTokenizerMode.Text;
        this.generator = this.tokenize();
    }

    private *tokenize() {
        let groups: PatternGroups | undefined;
        let offset: number = 0;
        let pattern: RegExp;
        let patterns: RegExp[] = [];

        patterns[SourceTokenizerMode.Text] = new RegExp(textPattern);
        patterns[SourceTokenizerMode.Directive] = new RegExp(directivePattern);
        patterns[SourceTokenizerMode.Include] = new RegExp(includePattern);
        patterns[SourceTokenizerMode.Raw] = new RegExp(rawPattern);

        pattern = patterns[this.mode];

        while ((groups = pattern.exec(this.sourceCode)?.groups as (PatternGroups | undefined))) {

            if (groups.whitespace !== undefined) {
                yield new Token('whitespace', offset, this.sourceMap, groups.whitespace);
            } else if (groups.punctuator !== undefined) {
                yield new Token(groups.punctuator as TokenType, offset, this.sourceMap, groups.punctuator);
            } else if (groups.identifier !== undefined) {
                yield new Token('identifier', offset, this.sourceMap, groups.identifier);
            } else if (groups.number !== undefined) {
                yield new Token('number', offset, this.sourceMap, groups.number);
            } else if (groups.string !== undefined) {
                yield new Token('string', offset, this.sourceMap, groups.string);
            } else if (groups.character !== undefined) {
                yield new Token('character', offset, this.sourceMap, groups.character);
            } else if (groups.mlComment !== undefined) {
                yield new Token('whitespace', offset, this.sourceMap, ' ', groups.mlComment);
            } else if (groups.slComment !== undefined) {
                yield new Token('whitespace', offset, this.sourceMap, '\n', groups.slComment);
            } else if (groups.directiveName !== undefined) {
                let actualOffset = offset;
                for (let part of groups.directivePrefix!.split(directivePrefixPattern)) {
                    if (part.length !== 0) {
                        if (part.trim().length === 0) {
                            yield new Token('whitespace', actualOffset, this.sourceMap, part);
                        } else {
                            yield new Token('whitespace', actualOffset, this.sourceMap, ' ', part);
                        }
                        actualOffset += part.length;
                    }
                }
                let hashTokens: Token[] = [];
                let hashOffset = actualOffset;
                for (let part of groups.directiveHash!.split(directivePrefixPattern)) {
                    if (part.length !== 0) {
                        if (part.trim().length === 0) {
                            hashTokens.push(new Token('whitespace', hashOffset, this.sourceMap, part));
                        } else if (part === '#') {
                            hashTokens.push(new Token('#', hashOffset, this.sourceMap, '#'));
                        } else {
                            hashTokens.push(new Token('whitespace', hashOffset, this.sourceMap, ' ', part));
                        }
                        hashOffset += part.length;
                    }
                }
                yield new Token('directive', actualOffset, this.sourceMap, groups.directiveName, hashTokens);
            } else if (groups.newLine !== undefined) {
                yield new Token('newline', offset, this.sourceMap, groups.newLine);
            } else if (groups.headerName !== undefined) {
                yield new Token('header', offset, this.sourceMap, groups.headerName);
            } else if (groups.rawText !== undefined) {
                yield new Token('raw', offset, this.sourceMap, groups.rawText);
            } else if (groups.unknown !== undefined) {
                yield new Token('unknown', offset, this.sourceMap, groups.unknown);
            } else if (groups.endOfText !== undefined) {
                while (true) {
                    yield new Token('end', offset, this.sourceMap, '');
                }
            }

            offset = pattern.lastIndex;
            pattern = patterns[this.mode];
            pattern.lastIndex = offset;
        }

        throw new Error('This should never happen.');
    }

    public read(): Token {
        return this.generator.next().value;
    }

    public setMode(mode: SourceTokenizerMode) {
        this.mode = mode;
    }

}

const validSingleTokenPattern = cre.legacy`
    // Entire text is taken by single token
    begin-of-text
    ${ppTokenSolidPattern}
    end-of-text
    `;

const invalidSingleTokenPattern = cre.legacy`
    // There a token, but since 'validSingleTokenPattern' does not detected anything,
    // there are more characters.
    ${ppTokenSolidPattern}
    `;

export function parseSingleToken(text: string, sourceMap: SourceMap, offset: number): Token | undefined {
    let groups = text.match(validSingleTokenPattern)?.groups as (PatternGroups | undefined);
    if (!groups) {
        if (text.match(invalidSingleTokenPattern)) {
            return undefined;
        }
        return new Token('unknown', offset, sourceMap, text);
    }
    else if (groups.punctuator !== undefined) {
        return new Token(groups.punctuator as TokenType, offset, sourceMap, groups.punctuator);
    } else if (groups.identifier !== undefined) {
        return new Token('identifier', offset, sourceMap, groups.identifier);
    } else if (groups.number !== undefined) {
        return new Token('number', offset, sourceMap, groups.number);
    } else if (groups.string !== undefined) {
        return new Token('string', offset, sourceMap, groups.string);
    } else if (groups.character !== undefined) {
        return new Token('character', offset, sourceMap, groups.character);
    } else {
        throw new Error('This should never happen');
    }
}
