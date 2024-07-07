
import { Listener, Parser, Macro } from "./parser";
import { Tokenizer, Token, TokenType, TokenBase, TokenWithDirective } from "./tokenizer";
import { createEmptyObject } from "./utils";
import assert from 'node:assert';



let out = '';

let listener: Listener = {

    defineDirective(parser: Parser, token: TokenWithDirective): void {
        parser.addMacro(parser.parseMacroDefinition(token.data.tokens));
    },

    undefDirective(parser: Parser, token: TokenWithDirective): void {
        parser.removeMacro(parser.parseUndef(token.data.tokens));
    },

    includeDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    ifDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    elifDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    elseDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    endifDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    unknownDirective(parser: Parser, token: TokenWithDirective): void {
        
    },

    objectMacro(parser: Parser, macro: Macro, token: Token): void {
        parser.objectReplacement(macro);
    },

    functionMacro(parser: Parser, macro: Macro, allTokens: Token[], args: Token[][]): void {
        parser.functionReplacement(macro, args);
    },

    warning(parser: Parser | Parser, tokens: Token[], message: string): void {
        console.log('warning', tokens[0], message);
    },

    error(parser: Parser | Parser, tokens: Token[], message: string): void {
        console.log('error', tokens[0], message);
    },

    code(parser: Parser, token: Token): void {
        let whitespace = token.whitespace;
        if (whitespace.length === 0) {
            let lastChar = out.length > 0 ? out[out.length - 1] : '!';
            if (lastChar.match(/[a-z0-9_$]/i)) whitespace = ' ';
        }
        out += whitespace;
        out += token.value;
    }
}

let p = new Parser(listener);
p.parse(`

#define FOO(...) xxx __VA_ARGS__ yyy
    FOO
    (Z)
`, '');

console.log(out);
