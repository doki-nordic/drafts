import { request } from "./comm";
import { ListItem } from "./state";

let samples: any[] = [];
let boards: any[] = [];
let rootDirectory: string = '';

interface RawSoc {
    name?: string;
}

interface RawBoard {
    name?: string;
    vendor?: string;
    socs?: RawSoc[];
}

interface RawBoardVariant {
    identifier?: string;
    name?: string;
    type?: string;
    arch?: string;
    toolchain?: string[];
    sysbuild?: boolean;
    ram?: number;
    flash?: number;
    supported?: string[];
}

interface RawBoardsEntry {
    file: string;
    boards?: RawBoard[];
    board?: RawBoard;
    variants?: RawBoardVariant[];
}

interface RawSample {
    name?: string;
    description?: string;
}

export interface RawTest {
    integration_platforms?: string | string[];
    platform_allow?: string | string[];
    platform_exclude?: string | string[];
    tags?: string | string[];
    extra_args?: string | string[];
    sysbuild?: boolean;
    harness?: string;
    harness_config?: any;
    extra_configs?: string | string[];
    modules?: any;
    min_flash?: number;
    min_ram?: number;
    build_on_all?: boolean;
    arch_exclude?: string | string[];
    toolchain_exclude?: string | string[];
    simulation_exclude?: string | string[];
    toolchain_allow?: string | string[];
    arch_allow?: string | string[];
    timeout?: number;
    slow?: boolean;
    required_snippets?: string | string[];
    skip?: boolean;
    depends_on?: any;
    build_only?: boolean;
    filter?: string;
}

const known = {
    file: true,
    sample: true,
    tests: true,
    common: true,
}

interface RawSamplesEntry {
    file: string;
    sample?: RawSample;
    tests?: { [key: string]: RawTest };
    common?: RawTest;
}

interface Workspace {
    boards: RawBoardsEntry[];
    root: string;
    samples: RawSamplesEntry[]
    socs: any[];
}

export interface Test extends ListItem {
    raw?: RawTest;
}

export interface Sample extends ListItem {
    raw?: RawSamplesEntry;
    name: string;
    description: string;
    tests: Test[];
}

export interface Board extends ListItem {
    details?: string;
}

export let workspaceSamples: Sample[] = [];
export let workspaceBoards: Board[] = [];

function addSample(rawSample: RawSamplesEntry) {
    if (!rawSample.sample) return;
    let dir = rawSample.file.replace(/[/\\]+[^/\\]+$/, '');
    let sample: Sample = {
        raw: rawSample,
        value: dir,
        name: rawSample.sample.name ?? dir,
        description: rawSample.sample.description ?? '',
        comment: rawSample.sample.name?.replace(/\s+(?:sample|example)(\.?)$/gi, '$1'),
        keywords: rawSample.sample.description ?? '',
        tests: [{
            value: '\xA0',
        }],
    };
    for (let [testName, rawTest] of Object.entries(rawSample.tests ?? {})) {
        //rawTest = {...rawSample.common, ...rawTest};
        sample.tests.push({
            raw: rawTest,
            value: testName,
        });
    }
    workspaceSamples.push(sample);
}

export async function workspaceInit() {
    let res = await request('get.workspace') as Workspace;
    console.log(res);
    /*for (let data of res.boards) {
        if (data.boards) {
            for (let board of data.boards) addBoard(board, data.file);
        }
        if (data.board) {
            addBoard(data.board, data.file);
        }
    }*/
    // boards
    workspaceBoards = [];
    for (let data of res.boards) {
        for (let boardVariant of data.variants ?? []) {
            addBoard(boardVariant);
        }
    }
    workspaceBoards.sort(compareBoards);
    // samples
    workspaceSamples = [];
    for (let sample of res.samples) {
        addSample(sample);
    }
    workspaceSamples.sort(compareSamples);
}

function compareSamples(a: Sample, b: Sample): number {
    let aTest = a.value.indexOf('test') >= 0;
    let bTest = b.value.indexOf('test') >= 0;
    if (aTest && !bTest) return 1;
    if (!aTest && bTest) return -1;
    let aNrf = a.value.startsWith('nrf');
    let bNrf = b.value.startsWith('nrf');
    if (aNrf && !bNrf) return -1;
    if (!aNrf && bNrf) return 1;
    aNrf = a.value.indexOf('nrf') >= 0;
    bNrf = b.value.indexOf('nrf') >= 0;
    if (aNrf && !bNrf) return -1;
    if (!aNrf && bNrf) return 1;
    return a.value.localeCompare(b.value);
}

function compareBoards(a: Board, b: Board): number {
    let aNrf = a.value.startsWith('nrf');
    let bNrf = b.value.startsWith('nrf');
    if (aNrf && !bNrf) return -1;
    if (!aNrf && bNrf) return 1;
    aNrf = a.value.indexOf('nrf') >= 0;
    bNrf = b.value.indexOf('nrf') >= 0;
    if (aNrf && !bNrf) return -1;
    if (!aNrf && bNrf) return 1;
    return a.value.localeCompare(b.value);
}


function addBoard(boardVariant: RawBoardVariant) {
    if (!boardVariant.identifier) return;
    let board: Board = {
        value: boardVariant.identifier,
        comment: boardVariant.name ?? boardVariant.identifier,
        details: boardVariant.name ?? boardVariant.identifier,
    }
    let additional: string[] = [];
    if (boardVariant.arch) additional.push(boardVariant.arch);
    if (boardVariant.flash) additional.push(`${boardVariant.flash} KB flash`);
    if (boardVariant.ram) additional.push(`${boardVariant.ram} KB RAM`);
    if (additional.length > 0) board.details += ` (${additional.join(', ')})`;
    workspaceBoards.push(board);
}
