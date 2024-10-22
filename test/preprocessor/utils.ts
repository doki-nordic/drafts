import * as fs from 'node:fs';
import * as path from 'node:path';

import { KnownDirectives, Listener } from '../../src/preprocessor/listener';
import { Preprocessor } from '../../src/preprocessor/preprocessor';
import { Token } from '../../src/preprocessor/token';

export function preprocess(fileName: string, source: string, includePaths: string[]): [string, string[], string[]] {

    let tokens: Token[] = [];
    let errors: string[] = [];
    let warnings: string[] = [];

    let listener: Listener = {
        onToken: function (token: Token): void {
            //console.log('onToken', token.type, token.value);
            tokens.push(token);
        },
        onDirective: function (name: KnownDirectives, directive: Token, content: Token[]): void {
            //console.log('onDirective', name);
            switch (name) {
                case 'define':
                    pp.parseDefine(directive, content, true);
                    //console.log('new macro:', );
                    break;
                case 'undef':
                    pp.parseUndef(directive, content, true);
                    break;
                case 'include': {
                    let headerPath = pp.parseIncludePath(directive, content);
                    if (headerPath !== undefined) {
                        for (let tryPath of includePaths) {
                            let realPath = path.join(tryPath, headerPath);
                            if (fs.existsSync(realPath)) {
                                let source = fs.readFileSync(realPath, 'utf8');
                                pp.includeSource(headerPath, source);
                                return;
                            }
                        }
                        errors.push(`header file "${headerPath}" cannot be found`);
                    }
                    break;
                }
                case 'error':
                case 'if':
                case 'elif':
                case 'else':
                case 'endif':
                case 'ifdef':
                case 'ifndef': {
                    // TODO: implement those
                }
                case 'pragma':
                case '':
                    // ignored directives
                    break;
                default:
                    throw new Error(`Not implemented: onDirective: "${name}"`);
            }
        },
        onUnknownDirective: function (name: string, directive: Token, content: Token): void {
            throw new Error('Not implemented: onUnknownDirective');
        },
        onComment: function (token: Token): void {
            //console.log('onComment', token.data);
        },
        onMessage: function (location: string, level: string, message: string): void {
            //console.error(location + ':', level + ':', message);
            if (level === 'error') {
                errors.push(message);
            } else {
                warnings.push(message);
            }
        }
    };

    let pp = new Preprocessor(listener);

    pp.parse(fileName, source);

    let output = tokens
        .map(tokens => tokens.value)
        .join('');

    return [output, errors, warnings];
}
