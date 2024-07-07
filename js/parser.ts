
import { Tokenizer, Token, TokenType, TokenBase, TokenWithDirective } from "./tokenizer";
import { createEmptyObject } from "./utils";
import assert from 'node:assert';

let uniqueNameCounter = 1;

function getUniqueFallbackName(): string {
    return `__internalAutoName__${uniqueNameCounter++}`;
}

export interface Listener {
    defineDirective(parser: Parser, token: TokenWithDirective): void;
    undefDirective(parser: Parser, token: TokenWithDirective): void;
    includeDirective(parser: Parser, token: TokenWithDirective): void;
    ifDirective(parser: Parser, token: TokenWithDirective): void;
    elifDirective(parser: Parser, token: TokenWithDirective): void;
    elseDirective(parser: Parser, token: TokenWithDirective): void;
    endifDirective(parser: Parser, token: TokenWithDirective): void;
    unknownDirective(parser: Parser, token: TokenWithDirective): void;
    objectMacro(parser: Parser, macro: Macro, token: Token): void;
    functionMacro(parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]): void;
    error(parser: Parser, tokens: Token[], message: string): void;
    warning(parser: Parser, tokens: Token[], message: string): void;
    code(parser: Parser, token: Token): void;
}

export class Macro {
    public constructor(
        public name: string,
        public parameters: string[] | undefined,
        public ellipsis: boolean,
        public tokens: Token[],
        public callback?: (parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]) => Token[],
    ) { }
}

const specialMacros: { [name: string]: Macro } = {
    '__COUNTER__': new Macro('__COUNTER__', undefined, false, [], (parser, macro, allTokens) => parser.getCounterTokens(allTokens[0])),
    '__FILE__': new Macro('__FILE__', undefined, false, [], (parser, macro, allTokens) => parser.getFileTokens(allTokens[0])),
    '__DATE__': new Macro('__DATE__', undefined, false, [], () => [new TokenBase(TokenType.string, 0, '', '', '"Jan  1 1970"') as Token]),
    '__TIME__': new Macro('__TIME__', undefined, false, [], () => [new TokenBase(TokenType.string, 0, '', '', '"00:00:00"') as Token]),
    '__TIMESTAMP__': new Macro('__TIMESTAMP__', undefined, false, [], () => [new TokenBase(TokenType.string, 0, '', '', '"Thu Jan  1 00:00:00 1970"') as Token]),
}


export type MacroDict = { [key: string]: Macro };


interface InvokingMacroState {
    macro: Macro;
    bracketStack: string[];
    allTokens: Token[];
    argumentStart: number;
    arguments: Token[][];
}


class ParserState {
    public macros = createEmptyObject<MacroDict>();
    public nestedMacros = new Set<Macro>();
    public counter = 0;
    public file = '';
}


export class Parser {
    private invokingMacro: InvokingMacroState | undefined = undefined;
    private tokenizer!: Tokenizer;
    private sink!: (parser: Parser, token: Token) => void;
    private state!: ParserState;
    private childParser: Parser | undefined = undefined;

    /**
     * @internal
     * @param rootParser 
     * @param listener 
     * @param tokenizer 
     * @param sink 
     */
    public constructor(
        private listener: Listener
    ) { }

    private getChildParser(): Parser {
        if (!this.childParser) {
            this.childParser = new Parser(this.listener);
        }
        return this.childParser;
    }

    /**
     * Parse specified source code. You cannot call it from the listener when the previous parsing was
     * not completed. Use {@link include} method instead.
     * @param input  The source code.
     * @param source The name of the source file.
     */
    public parse(input: string, source: string) {
        this.invokingMacro = undefined;
        this.tokenizer = new Tokenizer(input, source);
        this.sink = (parser, token) => this.listener.code(parser, token);
        this.state = new ParserState();
        this.state.file = source;
        this.parseLoop();
    }

    private parseInternal(input: Token[], output: Token[], state: ParserState): void {
        this.invokingMacro = undefined;
        this.tokenizer = new Tokenizer();
        this.tokenizer.push(input);
        this.sink = (parser, token) => output.push(token);
        this.state = state;
        this.parseLoop();
    }

    private parseLoop() {
        let token: Token;
        do {
            token = this.tokenizer.read();
            if (token.type === TokenType.end) {
                break;
            } else if (token.type === TokenType.placeholder) {
                if (token.data instanceof Macro) {
                    this.state.nestedMacros.delete(token.data);
                } else if (typeof token.data === 'string') {
                    this.state.file = token.data;
                }
            } else if (token.type === TokenType.directive) {
                let directive = token.data;
                switch (directive.name) {
                    case 'define':
                        this.listener.defineDirective(this, token);
                        break;
                    case 'undef':
                        this.listener.undefDirective(this, token);
                        break;
                    case 'include':
                        this.listener.includeDirective(this, token);
                        break;
                    case 'if':
                    case 'ifdef':
                    case 'ifndef':
                        this.listener.ifDirective(this, token);
                        break;
                    case 'elif':
                        this.listener.elifDirective(this, token);
                        break;
                    case 'else':
                        this.listener.elseDirective(this, token);
                        break;
                    case 'endif':
                        this.listener.endifDirective(this, token);
                        break;
                    default:
                        this.listener.unknownDirective(this, token);
                        break;
                }
            } else if (this.invokingMacro) {
                // Token in macro invocation arguments
                this.putArgumentToken(token);
            } else if (token.type === TokenType.identifier) {
                let macro = this.state.macros[token.value] || specialMacros[token.value];
                if (macro && !this.state.nestedMacros.has(macro)) {
                    // Macro replacement
                    this.putMacroToken(token, macro);
                } else {
                    // Ordinary token
                    this.sink(this, token);
                }
            } else {
                // Ordinary token
                this.sink(this, token);
            }
        } while (true);
        if (this.invokingMacro) {
            if (this.invokingMacro.bracketStack.length === 0) {
                this.sink(this, this.invokingMacro.allTokens[0]);
            } else {
                this.listener.error(this, this.invokingMacro.allTokens, 'Unterminated macro arguments.');
            }
        }
    }

    private putMacroToken(token: Token, macro: Macro): void {
        assert(!this.invokingMacro);
        if (macro.parameters) {
            // Function-like macro
            this.invokingMacro = {
                macro,
                bracketStack: [],
                allTokens: [token],
                argumentStart: 2, // 1 macro name token + 1 bracket
                arguments: [],
            }
        } else {
            // Object-like macro
            // Listener will decide what to do next with it
            this.listener.objectMacro(this, macro, token);
        }
    }

    private putArgumentToken(token: Token): void {
        assert(this.invokingMacro);
        let invokingMacro = this.invokingMacro;
        invokingMacro.allTokens.push(token);

        if (invokingMacro.bracketStack.length === 0) {

            if (token.type !== TokenType.operator || token.value !== '(') {
                // This is not an opening bracket
                this.sink(this, invokingMacro.allTokens[0]);
                this.tokenizer.push(invokingMacro.allTokens.slice(1));
                this.invokingMacro = undefined;
                return;
            }

            // Opening bracket
            invokingMacro.bracketStack.push(token.value);

            return;
        }

        if (token.type !== TokenType.operator) {
            // We are not interested in tokens other than operators.
            return;
        }

        let br: string | undefined = undefined;

        switch (token.value) {
            case '(':
            case '{':
            case '[':
                // Push opening brackets
                invokingMacro.bracketStack.push(token.value);
                break;
            case ')':
                // If we are finished with arguments, pass function-like macro invocation to listener
                if (invokingMacro.bracketStack.length === 1) {
                    this.invokingMacro = undefined;
                    let tokens = invokingMacro.allTokens.slice(invokingMacro.argumentStart, invokingMacro.allTokens.length - 1);
                    if (invokingMacro.arguments.length > 0 || tokens.length > 0) {
                        invokingMacro.arguments.push(tokens);
                    }
                    // Listener will decide what to do next with the function-like macro invocation
                    this.listener.functionMacro(this, invokingMacro.macro, invokingMacro.allTokens, invokingMacro.arguments);
                    break;
                }
                br = '(';
            // no-break
            case '}':
                br = br || '{';
            // no-break
            case ']': {
                br = br || '[';
                let expected = invokingMacro.bracketStack.pop();
                if (expected === undefined || expected !== br) {
                    this.listener.error(this, [token],
                        expected === undefined
                            ? 'Unmatched closing bracket.'
                            : `Expecting "${expected}" but found "${br}".`
                    );
                }
                break;
            }
            case ',':
                if (invokingMacro.bracketStack.length === 1) {
                    invokingMacro.arguments.push(invokingMacro.allTokens.slice(invokingMacro.argumentStart, invokingMacro.allTokens.length - 1));
                    invokingMacro.argumentStart = invokingMacro.allTokens.length;
                }
                break;
        }
    }

    /**
     * Execute object-like macro replacement and put result in current position.
     * @param macro Macro to replace.
     */
    public objectReplacement(macro: Macro): void {
        assert(!macro.parameters);
        if (macro.callback) {
            this.tokenizer.push(macro.callback(this, macro, [], [])); // TODO: source tokens
        } else {
            this.state.nestedMacros.add(macro);
            this.tokenizer.push(new TokenBase(TokenType.placeholder, 0, '', '', '', macro) as Token);
            this.tokenizer.push(macro.tokens);
        }
    }

    /**
     * Execute function-like macro replacement and put result in current position.
     * @param macro Macro to replace.
     * @param args  Macro arguments.
     */
    public functionReplacement(macro: Macro, args: Token[][]): void {
        assert(macro.parameters);
        let minArgs = macro.parameters.length;
        let maxArgs = macro.ellipsis ? Infinity : minArgs;
        if (minArgs === 1 && maxArgs === 1 && args.length === 0) {
            // special case: zero arguments can be used in macro with one parameter.
            args = [[]];
        }
        if (args.length < minArgs) {
            this.listener.error(this, macro.tokens, 'Macro requires more arguments.') // TODO: Add location of arguments
            return;
        } else if (args.length > maxArgs) {
            this.listener.error(this, macro.tokens, 'Macro requires less arguments.') // TODO: Add location of arguments
            return;
        }
        let argsReplaced: { [name: string]: Token[] | number } = {};
        for (let i = 0; i < macro.parameters.length; i++) {
            let param = macro.parameters[i];
            argsReplaced[param] = i;
        }
        let vaArgsReplaced: Token[] | undefined = undefined;
        let childParser = this.getChildParser();
        let argReplacedTokens = [];
        for (let token of macro.tokens) {
            if (token.type === TokenType.identifier && token.value in argsReplaced) {
                let argTokens = argsReplaced[token.value];
                if (typeof argTokens === 'number') {
                    let output: Token[] = [];
                    childParser.parseInternal(args[argTokens], output, this.state);
                    argsReplaced[token.value] = output;
                    argTokens = output;
                }
                argReplacedTokens.push(...argTokens);
            } else if (token.type === TokenType.identifier && token.value === '__VA_ARGS__' && macro.ellipsis) {
                if (vaArgsReplaced === undefined) {
                    vaArgsReplaced = [];
                    for (let i = minArgs; i < args.length; i++) {
                        let output: Token[] = [];
                        childParser.parseInternal(args[i], output, this.state);
                        vaArgsReplaced.push(...output);
                        if (i < args.length - 1) {
                            vaArgsReplaced.push(new TokenBase(TokenType.operator, 0, '', '', ',') as Token); // TODO: source and position
                        }
                    }
                }
                argReplacedTokens.push(...vaArgsReplaced);
            } else {
                argReplacedTokens.push(token);
            }
        }
        this.state.nestedMacros.add(macro); // TODO: maybe combine those two lines into one function
        this.tokenizer.push(new TokenBase(TokenType.placeholder, 0, '', '', '', macro) as Token);
        this.tokenizer.push(argReplacedTokens);
    }

    /**
     * Include file at current position.
     * @param input  The source code.
     * @param source The name of the source file.
     */
    public include(input: string, source: string): void {
        this.tokenizer.push(new TokenBase(TokenType.placeholder, 0, '', '', '', this.state.file) as Token);
        this.state.file = source;
        this.tokenizer.include(input, source);
    }

    private parseFunctionMacroDefinition(name: string, tokens: Token[]): Macro {
        let pos = 0;
        let macro = new Macro(name, [], false, []);
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
                    break;
                }
            } else {
                this.listener.error(this, tokens, 'Invalid macro parameters.');
                break;
            }
            let next = tokens[pos++] as Token | undefined;
            if (next?.type !== TokenType.operator || requiredNext.indexOf(next.value) < 0) {
                this.listener.error(this, tokens, 'Invalid macro parameters.');
                break;
            } else if (next.value === ')') {
                break;
            }
        }
        macro.tokens = tokens.slice(pos);
        return macro;
    }

    public parseMacroDefinition(tokens: Token[]): Macro {
        if (tokens.length === 0) {
            this.listener.error(this, tokens, 'No macro name given.'); // TODO: position in source code
            return new Macro(getUniqueFallbackName(), undefined, false, []);
        } else if (tokens[0].type !== TokenType.identifier) {
            this.listener.error(this, tokens, 'Macro name must be identifier.');
            return new Macro(getUniqueFallbackName(), undefined, false, []);
        }
        let name = tokens[0].value;
        let isFunctionLike =
            tokens[1]?.type === TokenType.operator
            && tokens[1].value === '('
            && tokens[1].whitespace.match(/^(?:\\\r?\n)*$/);
        if (isFunctionLike) {
            return this.parseFunctionMacroDefinition(name, tokens.slice(2));
        } else {
            return new Macro(name, undefined, false, tokens.slice(1));
        }
    }

    public parseUndef(tokens: Token[]): string {
        if (tokens.length === 0) {
            this.listener.error(this, tokens, 'No macro name given.'); // TODO: position in source code
            return getUniqueFallbackName();
        } else if (tokens[0].type !== TokenType.identifier) {
            this.listener.error(this, tokens, 'Macro name must be identifier.');
            return getUniqueFallbackName();
        }
        return tokens[0].value;
    }

    /**
     * Add macro to this parser. If macro with the same name already exists, it will be replaced.
     * @param macro Macro to add.
     */
    public addMacro(macro: Macro) {
        this.state.macros[macro.name] = macro;
    }

    public removeMacro(macroName: string) {
        delete this.state.macros[macroName];
    }

    public getCounterTokens(from: Token | undefined): Token[] {
        let result = new TokenBase(TokenType.integer, from?.position || 0, from?.source || '', '', this.state.counter.toString());
        this.state.counter++;
        return [result as Token];
    }

    getFileTokens(from: Token | undefined): Token[] {
        let result = new TokenBase(TokenType.string, from?.position || 0, from?.source || '', '', this.escapeString(this.state.file));
        return [result as Token];
    }

    public escapeString(text: string): string {
        return '"' + text + '"'; // TODO: do real escaping
    }

    public unescapeString(text: string): string {
        return text.substring(1, text.length - 1); // TODO: do real un-escaping
    }

    public parseIncludePath(tokens: Token[]): { path: string; system: boolean; } {
        tokens = tokens.filter(token => token.type !== TokenType.comment);
        if (tokens.length === 1 && tokens[0].type === TokenType.string) {
            let text = tokens[0].value;
            if (text.toLowerCase().startsWith('l')) {
                text = text.substring(1);
            }
            return { path: this.unescapeString(text), system: false };
        } else {
            throw new Error('Not implemented'); // TODO: parse system include in special way in tokenizer.
        }
    }

}

