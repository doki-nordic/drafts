import { State } from "./state";
import * as underscore from "underscore";

const DISABLE_MARKER = '-=---=-==-==--={{DISABLE}}-=-===-=-=';

let commands = `

>>> Build

{{ sample && board && buildDir |if}}
cd {{ sample |a}}
ncs west build \\
    -b {{ board |a}} \\
    -d {{ buildDir |a}} \\
    {% if (test) { %}-T {{ test |a}}{% } %}

>>> Rebuild

{{ sample && board && buildDir |if}}
cd {{ sample |a}}
rm -Rf {{ buildDir |a}}
ncs west build \\
    -b {{ board |a}} \\
    -d {{ buildDir |a}} \\
    {% if (test) { %}-T {{ test |a}}{% } %}

>>> Menu Config
{{ sample && board && buildDir |if}}
cd {{ sample |a}}
ncs west build \\
    -d {{ buildDir |a}} \\
    -t menuconfig

>>> GUI Config
{{ sample && board && buildDir |if}}
cd {{ sample |a}}
ncs west build \\
    -d {{ buildDir |a}} \\
    -t guiconfig

{% for (const domain of domains) { %}

    >>> Menu Config {{domain}}
    {{ sample && board && buildDir && domain != defaultDomain |if}}
    ncs west build \\
        -d {{ buildDir |a}} \\
        -t {{ domain }}_menuconfig

    >>> GUI Config {{domain}}
    {{ sample && board && buildDir && domain != defaultDomain |if}}
    ncs west build \\
        -d {{ buildDir |a}} \\
        -t {{ domain }}_guiconfig

{% } %}


`;

function replaceFilters(text: string, inner: string, filters: string) {
    let list = filters
        .split('|')
        .map(x => x.trim())
        .filter(x => x);
    for (let f of list) {
        inner = `filter_${f}(${inner.trim()})`;
    }
    return `{{${inner}}}`;
}


const templateUtils = {
    filter_a(value: string) {
        return `"${value}"`; // TODO: bash escaping of whole argument
    },
    filter_ap(value: string) {
        return value; // TODO: bash escaping of part of argument
    },
    filter_t(value: string) {
        return `${value}`.trim();
    },
    filter_if(value: any) {
        return value ? '' : DISABLE_MARKER;
    },
};

function textToCommands(text: string, state: State) {
    text = text.replace(/\{\{(.+?)((?:\|\s*[a-z0-9_]+\s*)+)\}\}/g, replaceFilters as any)
    let template = underscore.template(text, {
        interpolate: /\{\{(.+?)\}\}/g,
        evaluate: /\{%(.+?)%\}/g,
        escape: /([^\s\S])/g,
    });
    let resultText = template({
        ...templateUtils,
        sample: state.current?.sample?.trim() ?? '',
        board: state.current?.board?.trim() ?? '',
        buildDir: state.current?.buildDir?.trim() ?? '',
        test: state.current?.test?.trim() ?? '',
        extraArgs: state.current?.extraArgs?.trim() ?? '',
        domains: ['ipc', 'remote'],
        defaultDomain: 'ipc',
    });
    let commands:{[key:string]: string} = {};
    let parts = resultText.split(/^\s*>+\s*(.+?)\r?\n/m);
    console.log(parts);
    for (let i = 1; i < parts.length; i += 2) {
        if (!parts[i].trim()) continue;
        if (parts[i + 1].indexOf(DISABLE_MARKER) >= 0) continue;
        commands[parts[i].trim()] = parts[i + 1].trim();
    }
    return commands;
}

console.log(textToCommands(commands, {
    current: {
        sample: 'example',
        board: 'nRF52840_xxAA',
        buildDir: 'build',
        test: 'test',
        extraArgs: '',
    },
    profiles: [],
    commands: [],
    sampleList: [],
    showNrfOnly: false,
    domains: ['ipc', 'remote'],
    defaultDomain: 'ipc',
} as any));
