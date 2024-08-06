import { SourceMap } from "./source-map";
import { Token } from "./token";


type TokenizerInput = Generator<Token> | Iterator<Token> | Token | Token[];
type TokenizerItem = Generator<Token> | Iterator<Token> | Token;


const infiniteEndGenerator = (function* () {
    while (true) {
        yield new Token('end', 0, new SourceMap('[unknown file]', [0, 0]), '');
    }
})();


export class GenericTokenizer {

    private items: TokenizerItem[];

    public onRead: ((token: Token) => void) | undefined = undefined;

    public constructor(input?: TokenizerInput) {
        this.items = [infiniteEndGenerator];
        if (input) {
            this.push(input);
        }
    }

    public push(input: TokenizerInput) {
        if (Array.isArray(input)) {
            this.items.push(input.values());
        } else {
            this.items.push(input);
        }
    }

    private readInternal(): Token {
        do {
            let top = this.items.at(-1) as TokenizerItem;
            if (top instanceof Token) {
                return this.items.pop() as Token;
            }
            let res = top.next();
            if (!res.done) {
                return res.value;
            }
            this.items.pop();
        } while (true);
    }

    public read(): Token {
        let token = this.readInternal();
        this.onRead?.(token);
        return token;
    }

    public readNonWhitespace(): Token {
        let token: Token;
        do {
            token = this.readInternal();
            this.onRead?.(token);
        } while (token.type === 'whitespace');
        return token;
    }

    public peek(): Token {
        let top = this.items.at(-1) as TokenizerItem;
        if (top instanceof Token) {
            return top;
        } else {
            let token = this.readInternal();
            this.items.push(token);
            return token;
        }
    }

    public peekNonWhitespace(): Token {
        let index = this.items.length - 1;
        do {
            while (this.items[index] instanceof Token) {
                let token = this.items[index] as Token;
                if (token.type !== 'whitespace') {
                    return token;
                }
                index--;
            }
            do {
                let item = this.items[index] as Exclude<TokenizerItem, Token>;
                let res = item.next();
                if (res.done) {
                    this.items.splice(index, 1);
                    index--;
                    break;
                }
                this.items.splice(index + 1, 0, res.value);
                if (res.value.type !== 'whitespace') {
                    return res.value;
                }
            } while (true);
        } while (true);
    }

    public replaceNext(token: Token): void {
        this.peek();
        this.items[this.items.length - 1] = token;
    }

    public toArray(): Token[] {
        let res: Token[] = [];
        do {
            let token = this.read();
            if (token.type === 'end') {
                break;
            }
            res.push(token);
        } while (true);
        return res;
    }

}


