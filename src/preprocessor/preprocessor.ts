import { DirectiveParser } from "./directive-parser";
import { GenericTokenizer } from "./generic-tokenizer";
import { KnownDirectives, Listener } from "./listener";
import { SourceMap } from "./source-map";
import { parseSingleToken } from "./source-tokenizer";
import { Token } from "./token";
import assert from "node:assert";

const oppositeBracket: { [key: string]: string } = {
    '(': ')',
    '[': ']',
    '{': '}',
    ')': '(',
    ']': '[',
    '}': '{',
}

export class Macro {
    public constructor(
        public name: string,
        public parameters: string[] | undefined,
        public ellipsis: boolean,
        public tokens: Token[],
        public definition?: Token,
        public callback?: (
            preprocessor: Preprocessor,
            invocationToken: Token,
            macro: Macro,
            args: Token[][],
            commas: Token[],
            argsByName: { [key: string]: Token[] }
        ) => Token[] | Macro | undefined,
    ) { }
}

export type MacroDict = { [key: string]: Macro };


const builtinMacros: MacroDict = {
    '__COUNTER__': new Macro('__COUNTER__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__COUNTER__', it)),
    '__FILE__': new Macro('__FILE__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__FILE__', it)),
    '__LINE__': new Macro('__LINE__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__LINE__', it)),
    '__DATE__': new Macro('__DATE__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__DATE__', it)),
    '__TIME__': new Macro('__TIME__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__TIME__', it)),
    '__TIMESTAMP__': new Macro('__TIMESTAMP__', undefined, false, [], undefined, (pp, it) => pp.getBuiltinMacro('__TIMESTAMP__', it)),
}


function trimTokens(tokens: Token[]): Token[] {
    let start = 0;
    while (start < tokens.length && tokens[start].type === 'whitespace') {
        start++;
    }
    let end = tokens.length;
    while (end > start && tokens[end - 1].type === 'whitespace') {
        end--;
    }
    return tokens.slice(start, end);
}

export class Preprocessor {
    private rootSource!: DirectiveParser;
    private macros!: MacroDict;
    private source!: GenericTokenizer;
    private sink!: (token: Token) => void;
    private nestedMacros!: Set<Macro>;
    private readHandlerFunc: typeof GenericTokenizer.prototype.onRead;
    private counterMacroValue: number = 0;
    private offset: number = 0;
    private sourceMap!: SourceMap;

    public constructor(
        private listener: Listener,
    ) {
        this.readHandlerFunc = (token: Token) => { this.onReadHandler(token); };
    }

    private onReadHandler(token: Token) {
        if (token.endNesting !== undefined) {
            for (let macro of token.endNesting) {
                this.nestedMacros.delete(macro);
            }
        }
    }

    public includeSource(fileName: string, sourceCode: string) {
        assert(this.source === this.rootSource);
        this.rootSource.addInput(fileName, sourceCode);
    }

    public parse(fileName: string, sourceCode: string): void {
        this.rootSource = new DirectiveParser(this.listener);
        this.macros = Object.create(null);
        this.source = this.rootSource;
        this.sink = (token: Token) => { this.listener.onToken(token); };
        this.nestedMacros = new Set<Macro>();
        this.counterMacroValue = 0;
        this.offset = 0;
        this.sourceMap = this.rootSource.addInput(fileName, sourceCode);
        this.parseInternal();
    }

    public parseFragment(tokens: Token[]): Token[] {
        // Special case: empty input gives empty output
        if (tokens.length === 0) {
            return [];
        }
        // Save old state
        let output: Token[] = [];
        let oldSource = this.source;
        let oldSink = this.sink;
        let oldNestedMacros = this.nestedMacros;
        let oldOffset = this.offset;
        let oldSourceMap = this.sourceMap;
        // Set new state
        this.source = new GenericTokenizer(tokens);
        this.sink = (token: Token) => { output.push(token); };
        this.nestedMacros = new Set(oldNestedMacros);
        this.offset = tokens[0].offset;
        this.sourceMap = tokens[0].sourceMap;
        // Parse
        this.parseInternal();
        // Restore old state
        this.source = oldSource;
        this.sink = oldSink;
        this.nestedMacros = oldNestedMacros;
        this.offset = oldOffset;
        this.sourceMap = oldSourceMap;
        return output;
    }

    private parseInternal() {
        this.source.onRead = this.readHandlerFunc;
        do {
            let token = this.source.read();
            if (!token.reused) {
                this.offset = token.offset;
                this.sourceMap = token.sourceMap;
            }
            if (token.type === 'identifier') {
                let macro = this.macros[token.value] ?? builtinMacros[token.value];
                if (macro && !this.nestedMacros.has(macro)) {
                    this.parseMacroReplacement(macro, token);
                } else {
                    this.sink(token);
                }
            } else if (token.type === 'end') {
                break;
            } else {
                this.sink(token);
            }
        } while (true);
    }

    private parseMacroReplacement(macro: Macro, token: Token) {
        // TODO: if (macro.callback) ...
        if (macro.parameters) {
            // Function-like macro
            this.parseFunctionReplacement(macro, token);
        } else {
            // Object-like macro
            this.preventMacro(macro);
            let tokens = macro.tokens;
            if (macro.callback) {
                let customResult = macro.callback(this, token, macro, [], [], Object.create(null));
                if (customResult === undefined) {
                    // Use macro as-is
                } else if (customResult instanceof Macro) {
                    // Use different macro instead
                    macro = customResult;
                    this.preventMacro(macro);
                    tokens = macro.tokens;
                } else {
                    // Use tokens
                    tokens = customResult;
                }
            }
            this.reuseTokens(tokens);
        }
    }

    private parseFunctionReplacement(macro: Macro, token: Token) {
        let overriddenMacro: Macro | undefined = undefined;
        // Read all the following arguments (and commas between them)
        let [args, commas] = this.readArguments(macro, token);
        // If there are no arguments, assume it is simple token (not a macro invocation)
        if (args === undefined || commas === undefined) {
            this.sink(token);
            return;
        }
        // Assign arguments to macro parameters
        let argsByName = this.assignArguments(macro, token, args, commas);
        if (macro.callback) {
            let customResult = macro.callback(this, token, macro, args, commas, argsByName);
            if (customResult === undefined) {
                // Use macro as-is
            } else if (customResult instanceof Macro) {
                // Use different macro instead
                overriddenMacro = macro;
                macro = customResult;
                argsByName = this.assignArguments(macro, token, args, commas);
            } else {
                // Use tokens directly
                this.preventMacro(macro);
                this.reuseTokens(customResult);
                return;
            }
        }
        // Replace arguments prefixed with '#' by strings
        let tokens = this.stringifyArguments(macro, argsByName);
        // Split tokens into chunks separated by '##'
        let chunks = this.divideIntoChunks(tokens);
        // Replace arguments
        chunks = this.replaceArguments(chunks, argsByName);
        // Join chunks
        tokens = this.joinChunks(chunks);
        // Macro recursion prevention ends here
        this.preventMacro(macro);
        if (overriddenMacro !== undefined) {
            this.preventMacro(overriddenMacro);
        }
        // Put tokens back for further processing
        this.reuseTokens(tokens);
    }

    private reuseTokens(tokens: Token[]) {
        for (let token of tokens) {
            token.reused = true;
        }
        this.source.push(tokens);
    }

    private joinChunks(chunks: Token[][]): Token[] {
        // Remove empty chunks
        chunks = chunks
            .map(chunk => trimTokens(chunk))
            .filter(chunk => chunk.length > 0);
        // Put first chunk directly into result array
        let result: Token[] = [...(chunks[0] ?? [])];
        // Append remaining chunks by joining last token in result with first token in the chunk
        for (let i = 1; i < chunks.length; i++) {
            let chunk = chunks[i];
            let prev = result.pop() as Token;
            let next = chunk.shift() as Token;
            let newToken = parseSingleToken(prev.value + next.value, prev.sourceMap, prev.offset);
            if (!newToken) {
                this.message('error', `pasting "${prev.value}" and "${next.value}" does not give a valid preprocessing token`, prev);
                result.push(prev, next, ...chunk);
            } else {
                result.push(newToken, ...chunk);
            }
        }
        return result;
    }

    private replaceArguments(chunks: Token[][], argsByName: { [name: string]: Token[]; }): Token[][] {
        let argsParsed: { [name: string]: Token[]; } = Object.create(null);
        let newChunks: Token[][] = [];
        // for each chunk
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            let chunk = chunks[chunkIndex];
            let newChunk: Token[] = [];
            newChunks.push(newChunk);
            // for each token in chunk
            for (let tokenIndex = 0; tokenIndex < chunk.length; tokenIndex++) {
                let token = chunk[tokenIndex];
                let argName = token.value;
                if (token.type !== 'identifier' || argsByName[argName] === undefined) {
                    // pass token to output if it is not an argument name
                    newChunk.push(token);
                } else {
                    let arg = argsByName[argName];
                    let isPasting =
                        (tokenIndex === 0 || tokenIndex === chunk.length - 1)
                        && !(chunkIndex === 0 && tokenIndex === 0)
                        && !(chunkIndex === chunks.length - 1 && tokenIndex === chunk.length - 1);
                    // check if this token is connecting with other with the '##' operator
                    if (!isPasting) {
                        // do deep replacement on this argument and pass to the output
                        if (!argsParsed[argName]) {
                            argsParsed[argName] = this.parseFragment(arg);
                        }
                        arg = argsParsed[argName];
                    }
                    newChunk.push(...arg);
                }
            }
        }
        return newChunks;
    }


    private divideIntoChunks(tokens: Token[]) {
        // TODO: check if tokens does not start or end with ##
        let result: Token[][] = [[]];
        for (let token of tokens) {
            if (token.type === '##') {
                result.push([]);
            } else {
                result.at(-1)!.push(token);
            }
        }
        return result.map(chunk => trimTokens(chunk));
    }

    private stringifyArguments(macro: Macro, argsByName: { [name: string]: Token[]; }) {
        let index = 0;
        let result: Token[] = [];
        while (index < macro.tokens.length) {
            // get each token
            let token = macro.tokens[index];
            index++;
            if (token.type === '#') {
                // check if the following token is an argument name
                let next: Token | undefined = macro.tokens[index];
                let name = next?.value;
                if (next?.type !== 'identifier' || argsByName[name] === undefined) {
                    this.message('error', `'#' is not followed by a macro parameter`, token);
                    result.push(token);
                    continue;
                } else {
                    index++;
                }
                // get argument tokens
                let arg = argsByName[name];
                // stringify them
                // TODO: Tokens stringify as described in standard
                let str = arg
                    .map(x => x.value)
                    .join('')
                    .replace(/([\\"])/g, '\\$1')
                    .replace(/\n/, '\\n');
                // output string as a new token
                result.push(new Token('string', token.offset, token.sourceMap, '"' + str + '"'));
            } else {
                // output unmodified token if it's not '#'
                result.push(token);
            }
        }
        return result;
    }

    private assignArguments(macro: Macro, token: Token, args: Token[][], commas: Token[]) {
        assert(macro.parameters);
        // special case: remove arguments if macro expects no arguments and first argument is only whitespace
        if (macro.parameters.length === 0 && args.length === 1 && trimTokens(args[0]).length === 0) {
            args = [];
        }
        // check if there is enough arguments
        if (args.length < macro.parameters.length) {
            this.message('error', `macro "${macro.name}" requires ${macro.parameters.length} arguments, but only ${args.length} given`);
            args = [...args, ...new Array(macro.parameters.length - args.length).map(() => [])];
        }
        // check if there is not too many arguments
        if (!macro.ellipsis && args.length > macro.parameters.length) {
            this.message('error', `macro "${macro.name}" passed ${args.length} arguments, but takes just ${macro.parameters.length}`);
            args = args.slice(0, macro.parameters.length);
        }
        // map arguments to its names
        let result: { [name: string]: Token[] } = Object.create(null);
        for (let i = 0; i < macro.parameters.length; i++) {
            result[macro.parameters[i]] = args[i];
        }
        // combine tokens for __VA_ARGS__
        if (macro.ellipsis) {
            let argsSlice = args.slice(macro.parameters.length);
            let commasSlice = commas.slice(macro.parameters.length);
            let vaArgs = argsSlice.length === 0 ? [] : [...argsSlice[0]];
            for (let i = 1; i < argsSlice.length; i++) {
                vaArgs.push(commasSlice[i - 1]);
                vaArgs.push(...argsSlice[i]);
            }
            result['__VA_ARGS__'] = vaArgs;
        }
        return result;
    }

    private readArguments(macro: Macro, macroNameToken: Token): [Token[][] | undefined, Token[] | undefined] {
        assert(macro.parameters);
        let lparen = this.source.peekNonWhitespace();
        if (lparen.type !== '(') {
            return [undefined, undefined];
        }
        this.source.readNonWhitespace();
        let args: Token[][] = [[]];
        let commas: Token[] = [];
        while (true) {
            let token = this.source.read();
            switch (token.type) {
                case '[':
                case '{':
                case '(':
                    args.at(-1)!.push(...this.parseInsideBrackets(token));
                    break;
                case ',':
                    args.push([]);
                    commas.push(token);
                    break;
                case ']':
                case '}':
                    this.message('error', `unexpected '${token.type}', expecting ')'`, token);
                    args.at(-1)!.push(token);
                    break;
                case ')':
                    return [args, commas];
                case 'end':
                    this.message('error', `unterminated argument list invoking macro "${macro.name}"`, macroNameToken);
                    return [args, commas];
                default:
                    args.at(-1)!.push(token);
                    break;
            }
        }
    }

    private parseInsideBrackets(startingToken: Token): Token[] {
        let closingBracket = oppositeBracket[startingToken.type];
        let tokens: Token[] = [startingToken];
        while (true) {
            let token = this.source.read();
            if (token.type === 'end') {
                this.message('error', `unterminated '${startingToken.type}'`, startingToken);
                return tokens;
            } else if (token.type === '(' || token.type === '{' || token.type === '[') {
                tokens.push(...this.parseInsideBrackets(token));
            } else {
                tokens.push(token);
                if (token.type === closingBracket) {
                    return tokens;
                } else if (token.type === ')' || token.type === '}' || token.type === ']') {
                    this.message('error', `unexpected '${token.type}', expecting '${closingBracket}'`, token);
                    return tokens;
                }
            }
        }
    }

    private preventMacro(macro: Macro) {
        assert(!this.nestedMacros.has(macro));
        this.nestedMacros.add(macro);
        let nextToken = this.source.peek();
        let clonedToken = nextToken.clone({
            endNesting: nextToken.endNesting ? [...nextToken.endNesting, macro] : [macro]
        });
        this.source.replaceNext(clonedToken);
    }

    public parseUndef(directiveToken: Token, tokens: Token[], removeFromParser?: boolean): Macro | string | undefined {
        tokens = trimTokens(tokens);
        let nameToken = tokens[0];
        if (!nameToken) {
            this.message('error', 'macro name missing', directiveToken);
            return undefined;
        } else if (nameToken.type !== 'identifier') {
            this.message('error', 'macro name must be an identifier', nameToken);
            return undefined;
        } else if (tokens.length > 1) {
            this.message('warning', 'extra tokens at end of #undef directive', tokens[1]);
        }
        let name = nameToken.value;
        let macro = this.macros[name];
        if (macro !== undefined) {
            if (removeFromParser) {
                delete this.macros[name];
            }
            return macro;
        } else {
            return name;
        }
    }

    public parseIncludePath(directive: Token, content: Token[]): string | undefined {
        content = trimTokens(content);
        if (content.length === 0) {
            this.message('error', '#include expects "FILENAME" or <FILENAME>, nothing given');
            return undefined;
        } else if (content.length === 1) {
            let token = content[0];
            if (token.type === 'header') {
                return token.value;
            } else if (token.type === 'string') {
                return token.value.substring(1, token.value.length - 1); // TODO: string unescape
            } else {
                console.log(content);
                this.message('error', '#include expects "FILENAME" or <FILENAME>, invalid token given');
                return undefined;
            }
        } else if (content.length >= 3) {
            let open = content[0];
            let close = content.at(-1) as Token;
            if (open.type !== '<' || close.type !== '>') {
                console.log(content);
                this.message('error', '#include expects "FILENAME" or <FILENAME>, invalid tokens given');
                return undefined;
            }
            let pathTokens = content.slice(1, -1);
            return pathTokens.map(token => token.value).join(''); // TODO: stringify as macro arguments
        } else {
            console.log(content);
            this.message('error', '#include expects "FILENAME" or <FILENAME>, invalid tokens given');
            return undefined;
        }
    }

    public parseDefine(directiveToken: Token, tokens: Token[], addToParser?: boolean): Macro | undefined {
        tokens = trimTokens(tokens);
        let nameToken = tokens[0];
        if (!nameToken) {
            this.message('error', 'macro name missing', directiveToken);
            return undefined;
        } else if (nameToken.type !== 'identifier') {
            this.message('error', 'macro name must be an identifier', nameToken);
            return undefined;
        }
        let first = tokens[1];
        let macro: Macro | undefined;
        if (first !== undefined && first.type === '(') {
            macro = this.parseFunctionDefine(nameToken.value, tokens);
        } else {
            macro = new Macro(nameToken.value, undefined, false, trimTokens(tokens.slice(1)));
        }
        if (addToParser && macro !== undefined) {
            this.addMacro(macro);
        }
        return macro;
    }

    private parseFunctionDefine(name: string, tokens: Token[]): Macro | undefined {
        let parameters: string[] = [];
        let ellipsis: boolean = false;
        let tokenizer = new GenericTokenizer(tokens.slice(2));
        do {
            let token = tokenizer.readNonWhitespace();
            if (token.type === ')') {
                break;
            } else if (token.type === '...') {
                ellipsis = true;
                let next = tokenizer.readNonWhitespace();
                if (next.type !== ')') {
                    this.message('error', `expecting ')' in macro parameter list`, next);
                    return undefined;
                }
                break;
            } else if (token.type === 'identifier') {
                parameters.push(token.value);
                if (tokenizer.peekNonWhitespace().type === ',') {
                    tokenizer.readNonWhitespace();
                }
            } else {
                this.message('error', 'invalid token in macro parameter list', token);
                return undefined;
            }
        } while (true);
        return new Macro(name, parameters, ellipsis, trimTokens(tokenizer.toArray()));
    }

    public addMacro(macro: Macro, noWarnIfExists?: boolean) {
        let name = macro.name;
        if (!noWarnIfExists && name in this.macros /* TODO: && !macro.equals(this.macros[name])*/) {
            this.message('warning', `'${name}' macro redefined`, macro.definition ?? macro.tokens[0]);
            this.message('note', `previous definition of the '${name}' macro`, this.macros[name].definition ?? macro.tokens[0]);
        }
        if (!noWarnIfExists && name in builtinMacros) {
            this.message('warning', `redefining builtin '${name}' macro`, macro.definition ?? macro.tokens[0]);
        }
        this.macros[name] = macro;
    }

    public message(level: 'error' | 'warning' | 'note', message: string, target?: Token) {
        let location: string;
        if (target !== undefined) {
            location = target.sourceMap.getLocationText(target.offset);
            // TODO: invocation location
        } else {
            location = 'TODO.c:0:0'; // TODO: invocation location
        }
        this.listener.onMessage(location, level, message);
    }

    public getBuiltinMacro(name: string, invocationToken?: Token): Token[] | Macro | undefined {
        let offset = invocationToken?.offset ?? 0;
        let sourceMap = invocationToken?.sourceMap ?? new SourceMap('<builtin>', [0, 0]);
        switch (name) {
            case '__COUNTER__':
                return [new Token('number', offset, sourceMap, (this.counterMacroValue++).toString())];
            case '__FILE__':
                return [new Token('string', offset, sourceMap, '"' + this.sourceMap.fileName + '"')]; // TODO: escape file name
            case '__LINE__':
                return [new Token('number', offset, sourceMap, this.sourceMap.getLocation(this.offset)[0].toString())];
            case '__DATE__':
                return [new Token('string', offset, sourceMap, '"Jan  1 1970"')];
            case '__TIME__':
                return [new Token('string', offset, sourceMap, '"00:00:00"')];
            case '__TIMESTAMP__':
                return [new Token('string', offset, sourceMap, '"Thu Jan  1 00:00:00 1970"')];
        }
    }
}
