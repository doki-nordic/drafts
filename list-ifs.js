const fs = require('fs');


let src = fs.readFileSync('gatt.c', 'utf-8');

let stack = [];

const lineLength = 104;

function addComment(line, comment) {
    if (comment.trim() == '') return line;
    if (line.trim() == '') return '';
    line += ' '.repeat(Math.max(0, lineLength - line.replace(/\t/g, '        ').length));
    line += '// ';
    line += comment;
    return line;
}

let prev = null;

for (let line of src.split(/\r?\n/)) {
    if (line.endsWith('\\')) {
        if (prev !== null) {
            prev = prev + ' ' + line.substr(0, line.length - 1).trim();
        } else {
            prev = line.substr(0, line.length - 1).trimEnd();
        }
        continue;
    }
    if (prev !== null) {
        line = prev + ' ' + line.trim();
    }
    prev = null;
    let trimmed = line.trim();
    let x;
    if (trimmed.startsWith('#else')) {
        x = stack.pop();
    }
    if (trimmed.startsWith('#endif')) {
        stack.pop();
    }
    if (trimmed.startsWith('#elif')) {
        x = stack.pop();
    }
    if (stack.length > 1) {
        console.log(addComment(line, '(' + stack.join(') && (')) + ')');
    } else {
        console.log(addComment(line, stack.join()));
    }
    if (trimmed.startsWith('#if')) {
        let cond = trimmed.substr(3).trim();
        stack.push(cond);
    }
    if (trimmed.startsWith('#else')) {
        stack.push('(not ' + x + ')');
    }
    if (trimmed.startsWith('#elif')) {
        stack.push(`(${trimmed.substr(5).trim()}) && (not ${x})`);
    }
}
