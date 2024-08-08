
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import cre from 'con-reg-exp';
import { describe, expect, test } from 'vitest';
import { preprocess } from './utils';
import * as zlib from 'node:zlib';
import * as tar from 'tar';
import { Readable } from 'node:stream';

const archiveURL = 'https://github.com/boostorg/preprocessor/archive/refs/tags/boost-1.85.0.tar.gz';
const includeDir = 'test/preprocessor/boost/include';
const testDir = 'test/preprocessor/boost/test';
const tmpDir = 'test/preprocessor/boost';
const jamFile = `${testDir}/Jamfile.v2`;

let prepared = false;

async function getBoost() {
    // TODO: Move it to utils to allow downloading other test-suites
    if (fs.existsSync('test/preprocessor/boost')) return;
    fs.mkdirSync('test/preprocessor/boost');
    let res = await fetch(archiveURL);
    let buffer = await res.arrayBuffer();
    let tarFile = zlib.gunzipSync(buffer);
    await new Promise((resolve, reject) => {
        Readable.from(tarFile).pipe(tar.extract({ strip: 1, C: 'test/preprocessor/boost', }))
            .on('finish', resolve)
            .on('error', reject);
    });
}

function checkGCC() {
    child_process.execSync('gcc --version', { stdio: 'pipe' });
}

async function prepare() {
    if (!prepared) {
        await getBoost();
        checkGCC();
        prepared = true;
    }
}

interface JamCompileGroups {
    fail?: string;
    file: string;
    options?: string;
    target?: string;
}

const jamCompilePattern = cre.legacy.global`
    '['
    repeat whitespace
    'compile'
    optional fail: '-fail'
    at-least-1 whitespace
    file: lazy-repeat any
    repeat whitespace
    optional {
        ':'
        options: lazy-repeat any
        optional {
            ':'
            target: lazy-repeat any
        }
    }
    ']'
`;

interface OptionGroups {
    defineName: string;
    defineValue: string;
}

const optionsPattern = cre.legacy.global`
    "<define>"
    defineName: at-least-1 [a-zA-Z0-9_$]
    "="
    defineValue: lazy-repeat any
    whitespace or end-of-text
`;

interface TestAndErrorGroups {
    number: string;
}

const testPattern = cre.legacy.global`
    "typedef int test_"
    number: at-least-1 [0-9]
`;

const errorPattern = cre.legacy.global`
    "test_"
    number: at-least-1 [0-9]
`;

function compile(source: string, lang: string) {
    let errors = new Set<number>();
    fs.writeFileSync(`${tmpDir}/tmp_source`, source);
    try {
        child_process.execSync(`gcc -x ${lang} -c -o "${tmpDir}/a.o" "${tmpDir}/tmp_source"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' });
    } catch (e) {
        if (e.stderr) {
            for (let m of e.stderr.matchAll(errorPattern)) {
                let groups = m.groups as unknown as TestAndErrorGroups;
                errors.add(parseInt(groups.number));
            }
        } else {
            throw e;
        }
    }
    return errors;
}

function testWithGCC(file: string, options: { [key: string]: string }, target: string, fail: boolean) {
    let fullPath = `${testDir}/${file}`;
    let res: string;
    try {
        res = child_process.execSync(`gcc -E -I "${testDir}" -I "${includeDir}" "${fullPath}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe' });
    } catch (e) {
        if (fail) {
            return undefined;
        } else {
            throw e;
        }
    }
    if (fail) {
        throw new Error('Expecting failed compilation');
    }
    let tests: { [key: number]: boolean } = Object.create(null);
    for (let m of res.matchAll(testPattern)) {
        let groups = m.groups as unknown as TestAndErrorGroups;
        tests[parseInt(groups.number)] = true;
    }
    let errors = compile(res, file.endsWith('.c') ? 'c' : 'c++');
    for (let error of errors) {
        if (!(error in tests)) {
            throw new Error(`Error in unknown test_${error}`);
        }
        tests[error] = false;
    }
    return tests;
}

function runTestFile(file: string, options: { [key: string]: string }, target: string, fail: boolean) {
    if (fail) {
        describe(target, () => { test('TODO', () => { }); });
        return;
    }
    let testsGCC = testWithGCC(file, options, target, fail);
    let fullPath = `${testDir}/${file}`;
    let source = fs.readFileSync(fullPath, 'utf-8');
    let tests: Exclude<typeof testsGCC, undefined> = Object.create(null);
    try {
        let [output, errors, warnings] = preprocess(file, source, [testDir, includeDir]);
        console.log(output, errors, warnings);
        for (let m of output.matchAll(testPattern)) {
            let groups = m.groups as unknown as TestAndErrorGroups;
            tests[parseInt(groups.number)] = true;
        }
    } catch (err) {
        console.error(err);
        tests = testsGCC ?? {};
        for (let test in tests) {
            tests[test] = false;
        }
    }
    describe(target, async () => {
        await prepare();
        for (let testNumber in tests) {
            test(`line ${testNumber}`, () => {
                expect(tests[testNumber]).toBeTruthy();
            });
        }
    });
}

function main() {
    let text = fs.readFileSync(jamFile, 'utf8');
    let i = 0;
    for (let m of text.matchAll(jamCompilePattern)) {
        let groups = m.groups as unknown as JamCompileGroups;
        let file = groups.file.trim();
        let optionsText = groups.options?.trim() ?? '';
        let target = groups.target?.trim() ?? file;
        if (!file.match(/^[a-z0-9_.-]+$/i)) {
            continue;
        }
        let options = Object.create(null);
        for (let om of optionsText.matchAll(optionsPattern)) {
            let optionGroups = om.groups as unknown as OptionGroups;
            options[optionGroups.defineName] = optionGroups.defineValue.trim();
        }
        runTestFile(file, options, target, !!groups.fail);
        break;
    }
}

//main();
test('TODO', () => {});
// TODO: Also try to use: https://github.com/fujitsu/compiler-test-suite
// TODO: Also try to use: https://github.com/c-testsuite/c-testsuite
