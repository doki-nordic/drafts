
import cre from 'con-reg-exp';

import { SourceMap } from './source-map';

const splitPattern = cre.legacy`
    1: {
        {
            "\\", optional cr, nl
        } or {
            optional cr, nl
        }
    }
`;

/**
 * Remove C line continuation (backslash-newline).
 * @param fileName Source file name.
 * @param source Source code text.
 * @returns Source map containing input code, output code, and mapping.
 */
export function removeLineContinuation(fileName: string, source: string): [string, SourceMap] {

    let map = [0, 0];

    let arr = source.split(splitPattern);

    let output = arr[0];

    for (let lineNumber = 1; lineNumber < arr.length; lineNumber += 2) {
        let splitter = arr[lineNumber];
        let text = arr[lineNumber + 1];
        if (!splitter.startsWith('\\')) {
            output += '\n';
        }
        map.push(output.length);
        output += text;
    }

    return [output, new SourceMap(fileName, map)];
}

