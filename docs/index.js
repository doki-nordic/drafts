/*
 * Template data:
 *     versionsInfo: VerInfo[]            (readVersions)
 *     latestDevVerInfo: VerInfo          (readVersions)
 *     latestVerInfo: VerInfo             (readVersions)
 *     userVersion: Version | null        (getUserPluginData)
 *     wiresharkVersion: Version | null   (getUserPluginData)
 *     scriptFile: string | null          (getUserPluginData)
 *     downloadTool: string | null        (getUserPluginData)
 *     updateCommand: string | null       (createUpdateCommand)
 *     downloadUrl: string                (main)
 *     helpVerInfo: VerInfo               (main)
 *     updateMarkdown: string             (main)
 *     helpMarkdown: string               (main)
 *     releaseNotesMarkdown: string       (main)
 *     menuMarkdown: string               (main)
 *
 * Version:
 *     str: string
 *     number: number
 *     major: number
 *     minor: number
 *     patch: number
 *
 * VerInfo:
 *     version: Version
 *     helpFile: string
 *     downloadFile: string
 */

const downloadUrl = 'https://github.com/org/repo/releases/download/v<%= latestVerInfo.version.str %>/<%= latestVerInfo.downloadFile %>';
const curlUpdateCommand = '<%= quoteCommandArg(downloadTool) %> -L <%= downloadUrl %> -o <%= quoteCommandArg(scriptFile) %>';
const wgetUpdateCommand = '<%= quoteCommandArg(downloadTool) %> -O <%= quoteCommandArg(scriptFile) %> <%= downloadUrl %>';

let appData = {};

function getUserPluginData() {
    try {
        let dataStr = document.location.search;
        dataStr = atob(dataStr.substring(1));
        let [plugin, wireshark, file, tool] = JSON.parse(dataStr);
        appData = {
            ...appData,
            userVersion: parseVersion(plugin),
            wiresharkVersion: parseVersion(wireshark),
            scriptFile: file,
            downloadTool: tool,
        };
    } catch (e) {
        console.warn('Cannot parse appData input from user application', e);
        appData = {
            ...appData,
            userVersion: null,
            wiresharkVersion: null,
            scriptFile: null,
            downloadTool: null,
        };
    }
}

function quoteCommandArg(arg) {
    if (arg.indexOf(' ') >= 0) {
        return '"' + arg + '"';
    } else {
        return arg;
    }
}

function createUpdateCommand() {
    if (!appData.scriptFile || !appData.downloadTool) {
        appData.updateCommand = null;
        return;
    }
    let curlIndex = appData.downloadTool.indexOf('curl');
    let wgetIndex = appData.downloadTool.indexOf('wget');
    let useCurl = curlIndex > wgetIndex;
    appData.updateCommand = fromTemplate(useCurl ? curlUpdateCommand : wgetUpdateCommand);
}

function parseVersion(version) {
    version = version.trim();
    if (version[0] == 'v' || version[0] == 'V') {
        version = version.substring(1).trim();
    }
    parts = version.split(/[.-]/);
    while (parts.length < 3) {
        parts.push('0');
    }
    while (parts.length > 3) {
        parts.pop();
    }
    parts = parts.map(x => parseInt(x));
    return {
        str: parts.join('.'),
        number: parts[0] * 10000 + parts[1] * 100 + parts[2],
        major: parts[0],
        minor: parts[1],
        patch: parts[2],
    }
}

async function readVersions() {
    let versionsFile = await new Promise((resolve, reject) => {
        $.get('versions.txt', {}, data => {
            resolve(data);
        })
            .fail(() => {
                reject(new Error('Cannot read versionsInfo information.'));
            });
    });
    let lines = versionsFile.split('\n');
    lines = lines.filter(x => x.trim() && x.trim()[0] != '#');
    let versionsInfo = [];
    for (let line of lines) {
        let [version, helpFile, downloadFile] = line.split(',').map(x => x.trim());
        version = parseVersion(version);
        versionsInfo.push({ version, helpFile, downloadFile })
    }
    let latestDevVerInfo = versionsInfo
        .reduce((prev, cur) => !prev || cur.version.number > prev.version.number ? cur : prev, null);
    let latestVerInfo = versionsInfo
        .filter(ver => ver.version.patch != 99)
        .reduce((prev, cur) => !prev || cur.version.number > prev.version.number ? cur : prev, null) || latestDevVerInfo;
    let helpVerInfo = versionsInfo
        .find(cur => appData.userVersion && cur.version.number == appData.userVersion.number) || latestDevVerInfo;
    appData = {
        ...appData,
        versionsInfo,
        latestDevVerInfo,
        latestVerInfo,
        helpVerInfo,
    };
}

function fromTemplate(template) {
    return _.template(template)(appData);
}

async function readFile(url) {
    return await new Promise((resolve, reject) => {
        $.get(url, {}, data => {
            resolve(data);
        })
            .fail(() => {
                reject(new Error(`Cannot download file "${url}".`));
            });
    });
}

showdown.extension('admonition', function () {
    function replaceCommonPrefix(text, newPrefix) {
        let lines = text.split('\n');
        let common = lines
            .filter(x => x)
            .map(x => x.match(/^\s*/)[0])
            .reduce((prev, x) => Math.min(prev, x.length), 100000);
        return lines
            .map(x => newPrefix + x.substring(common))
            .join('\n');
    }
    let myext1 = {
        type: 'lang',
        regex: /(^|\n)([ \t]*)!!![ \t]+(\w+)([ \t]+[^\n]*)?\n((?:(?:\2[ \t]{2,}[^\n]+|[ \t]*)\n)*\2[ \t]{2,}[^\n]+)/g,
        replace: (m0, begin, prefix, className, title, text) => {
            title = (title || '').trim();
            text = replaceCommonPrefix(text, prefix);
            let res = begin;
            res += `${prefix}<div class="--admonition-begin-${className}"></div>\n\n`;
            res += `${prefix}${title}\n\n`;
            res += `${prefix}<div class="--admonition-middle-${className}"></div>\n\n`;
            res += `${text}\n\n`;
            res += `${prefix}<div class="--admonition-end-${className}"></div>\n`;
            return res;
        }
    };
    let myext2 = {
        type: 'output',
        regex: /<div class="--admonition-begin-(\w+)"><\/div>(?:\s*<p>)?/g,
        replace: '<div class="admonition-$1"><div class="admonition-$1-title">'
    };
    let myext3 = {
        type: 'output',
        regex: /(?:<\/p>\s*)?<div class="--admonition-middle-(\w+)"><\/div>/g,
        replace: '</div><div class="admonition-$1-body">'
    };
    let myext4 = {
        type: 'output',
        regex: /<div class="--admonition-end-(\w+)"><\/div>/g,
        replace: '</div></div>'
    };
    return [myext1, myext2, myext3, myext4];
});


function addClipboardButton(element) {
    for (let pre of element.querySelectorAll('pre')) {
        //const pre = new HTMLElement();
        let btn = document.createElement('div');
        btn.className = 'clipboard-copy';
        let inner = document.createElement('div');
        btn.appendChild(inner);
        $(inner).html('<i class="fa-regular fa-copy"></i>');
        pre.insertBefore(btn, pre.firstChild);
        let text = pre.innerText.trim();
        btn.onclick = () => {
            console.log('Copy to clipboard:', text);
            let ok = true;
            try {
                navigator.clipboard.writeText(text);
            } catch (e) {
                try {
                    let helper = document.getElementById('clipboard-helper');
                    helper.value = text;
                    helper.select();
                    document.execCommand('copy');
                } catch (e) {
                    ok = false;
                }
            }
            let info = document.getElementById('clipboard-info');
            info.innerHTML = ok ? 'Copied to the clipboard' : 'COPYING ERROR!!!';
            info.style.display = '';
            if (window._myTimeout !== undefined) {
                clearTimeout(window._myTimeout);
            }
            window._myTimeout = setTimeout(() => info.style.display = 'none', 3000);
        }
    }
}


let activePage = '';

let mdConverter = new showdown.Converter({
    extensions: ['admonition'],
    ghCompatibleHeaderId: true,
    openLinksInNewWindow: true,
});

function renderUpdate() {
    let container = $('#update')
    container.html(mdConverter.makeHtml(fromTemplate(appData.updateMarkdown)));
    addClipboardButton(container.get()[0]);
}

function renderMenu() {
    let container = $('#menu')
    container.html(mdConverter.makeHtml(fromTemplate(appData.menuMarkdown)));
}

function renderToc() {
    let toc = [];
    for (let header of document.querySelector('#content').querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        let level = parseInt(header.tagName.substring(1)) - 1;
        toc.push(`${'    '.repeat(level)}* [${header.innerText}](#${header.id})`);
    }
    toc = toc.join('\n');
    $('#toc').html(mdConverter.makeHtml(toc));
}

function renderHelp() {
    let container = $('#content')
    container.html(mdConverter.makeHtml(fromTemplate(appData.helpMarkdown)));
    addClipboardButton(container.get()[0]);
    renderToc();
}

function renderReleaseNotes() {
    let container = $('#content')
    let markdown = fromTemplate(appData.releaseNotesMarkdown);
    let range = activePage.replace(/^#release-notes-?/, '');
    if (range.trim()) {
        range = range.split('--');
        let [from, to] = range.map(parseVersion);
        if (!to) [from, to] = [parseVersion('0.0.0'), from];
        let startIndex = 0;
        let endIndex = markdown.length;
        for (let m of markdown.matchAll(/(?:^|\n)#\s+v([0-9.]+)/g)) {
            let cur = parseVersion(m[1]);
            if (cur.number <= from.number) {
                endIndex = Math.min(endIndex, m.index);
            }
            if (cur.number >= to.number) {
                startIndex = Math.max(startIndex, m.index);
            }
        }
        markdown = markdown.substring(startIndex, endIndex);
    }
    let releaseNotesConverter = new showdown.Converter({
        extensions: ['admonition'],
        ghCompatibleHeaderId: true,
        openLinksInNewWindow: true,
        prefixHeaderId: `${activePage}---`,
    });
    container.html(releaseNotesConverter.makeHtml(markdown));
    addClipboardButton(container.get()[0]);
    renderToc();
}

function renderPage() {
    if (location.hash.startsWith('#release-notes')) {
        let [page] = location.hash.split('---');
        page = page.replace(/\./g, '-');
        if (activePage != page) {
            activePage = page;
            renderReleaseNotes();
            renderMenu();
        }
    } else if (activePage != 'help') {
        activePage = 'help';
        renderHelp();
        renderMenu();
    }
}

async function main() {
    appData = {};
    let p1 = readFile('update.md');
    let p2 = readFile('release-notes.md');
    let p3 = readFile('menu.md');
    getUserPluginData();
    await readVersions();
    appData.downloadUrl = fromTemplate(downloadUrl);
    createUpdateCommand();
    appData.helpMarkdown = await readFile(appData.helpVerInfo.helpFile);
    appData.updateMarkdown = await p1;
    appData.releaseNotesMarkdown = await p2;
    appData.menuMarkdown = await p3;
    console.log('appData', appData);
    renderUpdate();
    renderPage(true);
}

function debugUser(plugin, wireshark, file, tool) {
    let f = btoa(JSON.stringify([plugin, wireshark, file, tool]));
    location.href = '?' + f;
    setTimeout(main, 1000);
}

main();

window.addEventListener('hashchange', () => {
    renderPage();
});
