
import { Tokenizer, Token, TokenType } from "./tokenizer";
import { createEmptyObject } from "./utils";

const knownDirectives = {
    define: true,
    include: true,
    undef: true,
    ifdef: true,
    ifndef: true,
    if: true,
    elif: true,
    else: true,
    endif: true,
};

type DirectiveName = 'define' | 'include' | 'undef' | 'ifdef' | 'ifndef' | 'if' | 'elif' | 'else' | 'endif';

enum State {
    CODE = 0,
    DIRECTIVE = 1,
    INVALID_DIRECTIVE = 2,
}

export interface Listener {
    directive(parser: Parser, name: DirectiveName, tokens: Token[]): void;
    unknownDirective(parser: Parser, tokens: Token[]): void;
    objectMacro(parser: Parser, macro: Macro, token: Token): void;
    functionMacro(parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]): void;
    warning(parser: Parser, tokens: Token[], message: string): void;
    code(parser: Parser, token: Token): void;
}

export class Macro {
    public constructor(
        public name: string,
        public parameters: string[] | undefined,
        public ellipsis: boolean,
        public tokens: Token[]
    ) { }
}

export type MacroDict = { [key: string]: Macro };


export class Parser {

    state: State = State.CODE;
    macros = createEmptyObject<MacroDict>();
    tokenizer!: Tokenizer;
    currentMacro: Macro | undefined = undefined;
    bracketStack: string[] = [];
    macroInvocationContainer: Token[] = [];
    argumentContainer: Token[] = [];
    directiveContainer: Token[] = [];
    args: Token[][] = [];

    public constructor(
        private listener: Listener
    ) {
    }

    public include(input: string, source: string) {
        this.tokenizer.include(input, source);
    }

    public parse(input: string, source: string) {
        this.state = State.CODE;
        this.bracketStack.splice(0);
        this.currentMacro = undefined;
        this.tokenizer = new Tokenizer(input, source);
        let token: Token;
        do {
            token = this.tokenizer.read();
            switch (this.state as State) {
                case State.CODE:
                    this.tokenCode(token);
                    break;
                case State.DIRECTIVE:
                    this.tokenDirective(token);
                    break;
                case State.INVALID_DIRECTIVE:
                    this.tokenInvalidDirective(token);
                    break;
            }
        } while (token.type !== TokenType.end);
        if (this.state !== State.CODE) {
            this.listener.warning(this, [token], 'Unterminated directive.');
        }
        if (this.currentMacro) {
            this.listener.warning(this, [token], 'Unterminated macro arguments.');
        }
    }

    tokenCode(token: Token) {
        if (token.type === TokenType.directive) {
            // Start of a directive
            this.directiveContainer.splice(0);
            this.directiveContainer.push(token);
            this.state = State.DIRECTIVE;
        } else if (token.type === TokenType.operator && (token.value === '##' || token.value === '#')) {
            this.directiveContainer.splice(0);
            this.directiveContainer.push(token);
            this.state = State.INVALID_DIRECTIVE;
        } else if (this.currentMacro) {
            // Token inside macro arguments
            let br: string | undefined = undefined;
            if (token.type === TokenType.operator) {
                switch (token.value) {
                    case '(':
                    case '{':
                    case '[':
                        this.bracketStack.push(token.value);
                        break;
                    case ')':
                        if (this.bracketStack.length === 0) {
                            this.macroInvocationContainer.push(token);
                            this.args.push(this.argumentContainer);
                            this.listener.functionMacro(this, this.currentMacro, this.macroInvocationContainer, this.args);
                            this.currentMacro = undefined;
                            return;
                        }
                        br = '(';
                    // no-break
                    case '}':
                        br = br || '{';
                    // no-break
                    case ']': {
                        br = br || '[';
                        let expected = this.bracketStack.pop();
                        if (expected === undefined || expected !== br) {
                            this.listener.warning(this, [token],
                                expected === undefined
                                    ? 'Unmatched closing bracket.'
                                    : `Expecting "${expected}" but found "${br}".`
                            );
                        }
                        break;
                    }
                    case ',':
                        this.macroInvocationContainer.push(token);
                        this.args.push(this.argumentContainer);
                        this.argumentContainer = [];
                        return;
                }
            }
            this.argumentContainer.push(token);
            this.macroInvocationContainer.push(token);
        } else if (token.type === TokenType.identifier && this.macros[token.value]) {
            let macro = this.macros[token.value];
            if (macro.parameters) {
                let newLines = this.tokenizer.skipNewLines();
                let next = this.tokenizer.peek();
                let isBracketNext = (next.type === TokenType.operator && next.value === '(');
                if (!isBracketNext) {
                    this.listener.code(this, token);
                    for (let t of newLines) {
                        this.listener.code(this, t);
                    }
                    return;
                }
                this.tokenizer.read();
                this.bracketStack.push('(');
                this.argumentContainer = [];
                this.args.splice(0);
                this.macroInvocationContainer.splice(0);
                this.macroInvocationContainer.push(token, ...newLines, next);
                this.currentMacro = macro;
            } else {
                this.listener.objectMacro(this, macro, token);
            }
        } else {
            this.listener.code(this, token);
        }
    }

    tokenInvalidDirective(token: Token) {
        if (token.type === TokenType.newLine) {
            this.tokenizer.push(token);
            this.listener.unknownDirective(this, this.directiveContainer);
            this.state = State.CODE;
        } else {
            this.directiveContainer.push(token);
        }
    }

    tokenDirective(token: Token) {
        if (token.type === TokenType.newLine) {
            let name = this.directiveContainer[0].value.match(/[a-z]*$/)![0];
            this.tokenizer.push(token);
            this.listener.directive(this, name as DirectiveName, this.directiveContainer);
            this.state = State.CODE;
        } else {
            this.directiveContainer.push(token);
        }
    }

    addMacro(macro: Macro) {
        this.macros[macro.name] = macro;
    }

    defineMacro(tokens: Token[]) {
        if (tokens[0].type === TokenType.directive) {
            if (tokens.length <= 1) {
                this.listener.warning(this, tokens, 'Invalid macro definition.');
                return;
            }
            tokens = tokens.slice(1);
        }
        let name = tokens[0].value;
        let macro: Macro;
        let isFunctionLike = tokens.length > 1
            && tokens[1].type === TokenType.operator
            && tokens[1].value === '('
            && tokens[1].whitespace === '';
        if (isFunctionLike) {
            let pos = 2;
            macro = new Macro(name, [], false, []);
            while (pos < tokens.length) {
                let token = tokens[pos];
                let requiredNext = '';
                if (token.type === TokenType.identifier) {
                    pos++;
                    macro.parameters!.push(token.value);
                    requiredNext = ',)';
                } else if (token.type === TokenType.operator) {
                    pos++;
                    if (token.value === '...') {
                        macro.ellipsis = true;
                        requiredNext = ')';
                    } else if (token.value === ')') {
                        macro.parameters!.push('');
                        break;
                    }
                }
                let next = tokens[pos++];
                if (next.type !== TokenType.operator || requiredNext.indexOf(next.value) < 0) {
                    this.listener.warning(this, tokens, 'Invalid macro parameters.');
                    break;
                }
                if (next.value === ')') {
                    break;
                }
            }
        } else  {
            macro = new Macro(name, undefined, false, tokens.slice(1));
        }
        if (name in this.macros && false) { // TODO: Compare macro tokens
            this.listener.warning(this, tokens, 'Macro redefinition.');
        }
        this.macros[name] = macro;
    }
}

let out = '';

function output(tokens: Token[]) {
    for (let token of tokens) {
        out += token.whitespace || ' ';
        out += token.value;
    }
}

let listener: Listener =  {
    directive(parser: Parser, name: DirectiveName, tokens: Token[]): void {
        switch (name) {
            case 'define':
                parser.defineMacro(tokens);
                break;
            default:
                output(tokens);
        }
        console.log('directive', name, ...tokens.map(t => t.value));
    },

    unknownDirective(parser: Parser, tokens: Token[]): void {
        console.log('unknownDirective', ...tokens.map(t => t.value));
    },

    objectMacro(parser: Parser, macro: Macro, token: Token): void {
        console.log('objectMacro', macro, token.value);
    },

    functionMacro(parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]): void {
        console.log('functionMacro', macro, args.length, ...allTokens.map(t => t.value));
    },

    warning(parser: Parser, tokens: Token[], message: string): void {
        console.log('warning', tokens[0], message);
    },

    code(parser: Parser, token: Token): void {
        console.log('code', token.value, token.type);
    },
}

let p = new Parser(listener);
p.parse(`
    #define X(a) a a
    X(10,1)
`, '');
