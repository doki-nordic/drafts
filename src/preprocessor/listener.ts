import { Token } from "./token";

export type KnownDirectives = 'if' | 'ifdef' | 'ifndef' | 'elif' | 'else' | 'endif' | 'include' | 'define' | 'undef' | 'line' | 'error' | 'warning' | 'pragma' | '';


export interface Listener {
    onToken(token: Token): void;
    onDirective(name: KnownDirectives, directive: Token, content: Token[]): void;
    onUnknownDirective(name: string, directive: Token, content: Token): void;
    onComment(token: Token): void;
    onMessage(location: string, level: string, message: string): void;
};
