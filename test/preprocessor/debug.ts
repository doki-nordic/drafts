
import { preprocess } from "./utils";

const source = `
#define FOO \
    A ## ## B ## ## ## C \
    A ## /* comment */ ## B /* comment */ ## ## ## /* comment */ C
FOO

`;

let [output, errors, warnings] = preprocess('test.c', source, []);

console.log(output);
if (errors.length) console.error(errors);
if (warnings.length) console.warn(warnings);
