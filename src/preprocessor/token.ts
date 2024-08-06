import { Macro } from "./preprocessor";
import { SourceMap } from "./source-map";


export type TokenType =
    'raw'           // [directive parser only] raw part of source file, e.g. after #pragma
    | 'newline'     // [directive parser only] newline
    | 'directive'   // [directive parser only] directive, `value` contains directive name, `data` contains tokens with hash and following white-spaces and comments
    | 'header'      // [directive parser only] header file name inside < > characters
    | 'end'         // end of source file
    | 'whitespace'  // whitespace
    | 'identifier'  // identifier
    | 'number'      // preprocessor number
    | 'character'   // character literal (with optional prefix)
    | 'string'      // string literal (with optional prefix)
    | 'unknown'     // unknown character
    | '...' | '<<=' | '>>='
    | '->' | '++' | '--' | '<<' | '>>' | '<=' | '>=' | '==' | '!=' | '&&'
    | '||' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^=' | '|=' | '##'
    | '[' | ']' | '(' | ')' | '{' | '}' | '.' | '&' | '*' | '+' | '-'
    | '~' | '!' | '/' | '%' | '<' | '>' | '^' | '|' | '?' | ':' | ';'
    | '=' | ',' | '#'
    ;


export class Token {

    public endNesting?: Macro[];
    public reused?: boolean;

    constructor(
        public type: TokenType,
        public offset: number,
        public sourceMap: SourceMap,
        public value: string,
        public data?: any,
    ) {
    }

    public clone(changes: any): Token {
        let res = new Token(
            changes.type ?? this.type,
            changes.offset ?? this.offset,
            changes.sourceMap ?? this.sourceMap,
            changes.value ?? this.value,
            ('data' in changes) ? changes.data : this.data
        );
        if ('endNesting' in changes) {
            res.endNesting = changes.endNesting;
        } else if ('endNesting' in this) {
            res.endNesting = this.endNesting;
        }
        return res;
    }
}
