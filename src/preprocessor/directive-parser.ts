import { GenericTokenizer } from "./generic-tokenizer";
import { removeLineContinuation } from "./line-continuation";
import { Listener } from "./listener";
import { SourceMap } from "./source-map";
import { SourceTokenizer, SourceTokenizerMode } from "./source-tokenizer";
import { Token } from "./token";


export class DirectiveParser extends GenericTokenizer {

    public constructor(
        private listener: Listener,
    ) {
        super();
    }

    public addInput(fileName: string, sourceCode: string): SourceMap {
        let [transformed, sourceMap] = removeLineContinuation(fileName, sourceCode);
        let tokenizer = new SourceTokenizer(transformed, sourceMap);
        this.push(this.parse(tokenizer));
        return sourceMap;
    }

    private *parse(input: SourceTokenizer): Generator<Token> {
        input.setMode(SourceTokenizerMode.Text);
        while (true) {
            let token = input.read();
            if (token.type === 'directive') {
                this.parseDirective(input, token);
                yield new Token('whitespace', token.offset, input.sourceMap, '\n');
            } else if (token.type === 'whitespace' && token.data !== undefined) {
                this.listener.onComment(token);
                yield token;
            } else if (token.type === 'end') {
                return;
            } else {
                yield token;
            }
        }
    }

    private parseDirective(input: SourceTokenizer, token: Token) {
        let name = token.value;
        switch (name) {
            case 'if':
            case 'ifdef':
            case 'ifndef':
            case 'elif':
            case 'else':
            case 'endif':
            case 'define':
            case 'undef':
                this.listener.onDirective(name, token, this.fetchDirectiveTokens(input));
                break;
            case 'include':
                this.listener.onDirective(name, token, this.fetchIncludeTokens(input));
                break;
            case 'line':
            case 'error':
            case 'warning':
            case 'pragma':
                this.listener.onDirective(name, token, [this.fetchRawToken(input)]);
                break;
            default:
                this.listener.onUnknownDirective(name, token, this.fetchRawToken(input));
                break;
        }
    }

    private fetchDirectiveTokens(input: SourceTokenizer): Token[] {
        let result: Token[] = [];
        input.setMode(SourceTokenizerMode.Directive);
        while (true) {
            let token = input.read();
            if (token.type === 'newline' || token.type === 'end') {
                break;
            } else if (token.type === 'whitespace' && token.value === '\n' && token.data?.startsWith('//')) {
                this.listener.onComment(token);
                break;
            }
            result.push(token);
        }
        input.setMode(SourceTokenizerMode.Text);
        return result;
    }

    private fetchIncludeTokens(input: SourceTokenizer): Token[] {
        let result: Token[] = [];
        input.setMode(SourceTokenizerMode.Include);
        while (true) {
            let token = input.read();
            if (token.type === 'newline' || token.type === 'end') {
                break;
            } else if (token.type === 'whitespace' && token.value === '\n' && token.data?.startsWith('//')) {
                this.listener.onComment(token);
                break;
            } else if (token.type !== 'whitespace') {
                input.setMode(SourceTokenizerMode.Directive);
            }
            result.push(token);
        }
        input.setMode(SourceTokenizerMode.Text);
        return result;
    }

    private fetchRawToken(input: SourceTokenizer): Token {
        input.setMode(SourceTokenizerMode.Raw);
        let result = input.read();
        input.setMode(SourceTokenizerMode.Text);
        return result;
    }

}
