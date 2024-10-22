


function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryMatcher(query: string) {
    let parts = query.split(/(?:[^\w\x7F-\uFFFF]|(?:(?<=\d)(?!\d))|(?:(?<!\d)(?=\d)))+/gm)
        .map(x => x.trim())
        .filter(x => x)
        .map(x => escapeRegExp(x))
        .join('|');
    if (parts.length === 0) return undefined;
    return new RegExp('(' + parts + ')', 'i');
}

function highlighSearchResult(text: string, matcher?: RegExp): any[] {
    if (!matcher) return [text];
    let parts = text.split(matcher);
    if (parts.length < 3) return [text];
    let res: any[] = [];
    parts.forEach((part, index) => {
        if (index % 2 === 1) res.push('<<<', part, '>>>');
        else res.push(part);
    });
    console.log(res.join(''));
    return res;
}

let regexp = queryMatcher(' some/text/120xyz232sdsdasd3 ');
console.log(regexp?.test('This is sodme Text about 1d20 times.'));

