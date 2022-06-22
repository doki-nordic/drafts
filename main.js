

const fs = require('fs');
var FlexSearch = require("flexsearch");

let totalSize = 0;
let all = {};

function listRecursive(base, path, result) {
	path = path || '';
	result = result || [];
	let list = fs.readdirSync(`${base}/${path}`);
	for (let file of list) {
		let stat = fs.lstatSync(`${base}/${path}/${file}`);
		if (stat.isDirectory()) {
			listRecursive(base, `${path}/${file}`, result);
		} else if (file.endsWith('.rst')) {
			result.push(`${path}/${file}`);
			totalSize += stat.size;
			all[`${path}/${file}`] = fs.readFileSync(`${base}/${path}/${file}`, 'utf-8');
		}
	}
	return result;
}

async function main_create() {

	let list = listRecursive('..');

	let index = new FlexSearch.Index({
		preset: "score",
		tokenize: "full",
		cache: true,
		resolution: 20,
		context: true,
		optimize: false,
		encode: false,
	});

	let count = 0;
	let names = [];
	for (let file of list) {
		let text = fs.readFileSync(`..${file}`, 'utf-8');
		index.add(count, text);
		names[count] = file;
		count++;
		if (count % 10 == 0) console.log(`${count} of ${list.length}`)
		//if (count > 100) break;
	}

	search(index, list);

	const output = {};

	await index.export((key, data) => {
		console.log(JSON.stringify(key), data.length);
		output[key] = data;
		fs.writeFileSync('output.json', JSON.stringify(output));
	});

	fs.writeFileSync('list.json', JSON.stringify(list));
	fs.writeFileSync('all.json', JSON.stringify(all));

	console.log(`Total size: ${totalSize}`);

}

function search(index, list) {
	let idx = index.search('remote', 20);
	let res = JSON.stringify(idx);
	console.log(res);
	fs.writeFileSync('res.json', res, null, 4);
	for (let id of idx) {
		console.log(list[id]);
	}
}

function main_search() {
	let list = JSON.parse(fs.readFileSync('list.json', 'utf-8'));
	let data = JSON.parse(fs.readFileSync('output.json', 'utf-8'));
	let index = new FlexSearch.Index('match');
	for (let key in data) {
		console.log(JSON.stringify(key), data[key].length);
		index.import(key, data[key]);
	}
	search(index, list);
}

main_create();
//main_search();
