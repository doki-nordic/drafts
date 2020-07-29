

/** @module Utils */


function* filterRecursive(obj, condition) {
	if (typeof (obj) != 'object') return;
	if (condition(obj)) yield obj;
	if (obj instanceof Array) {
		for (let item of obj) {
			for (let x of filterRecursive(item, condition)) yield x;
		}
	} else {
		for (let key in obj) {
			for (let x of filterRecursive(obj[key], condition)) yield x;
		}
	}
}


function findRecursive(obj, condition) {
	for (let x of filterRecursive(obj, condition)) {
		return x;
	}
	return null;
}


let platformIntTypesText = `
s8:
	int8_t
	char
	signed char

u8:
	uint8_t
	unsigned char

s16:
	int16_t
	short
	short int
	signed short
	signed short int

u16:
	uint16_t
	unsigned short
	unsigned short int

s32:
	int32_t
	ssize_t
	intptr_t
	int
	signed int
	long
	long int
	signed long
	signed long int

u32:
	uint32_t
	size_t
	uintptr_t
	unsigned
	unsigned int
	unsigned long
	unsigned long int

s64:
	int64_t
	long long
	long long int
	signed long long
	signed long long int

u64:
	uint64_t
	unsigned long long
	unsigned long long int
`;


let platformIntTypes = {};

(function () {
	let info = null;
	for (let line of platformIntTypesText.split('\n')) {
		line = line.trim();
		if (line.length == 0) continue;
		let m = line.match(/^(s|u)([0-9]{1,2}):$/);
		if (m) {
			info = {
				signed: (m[1] == 's'),
				bits: 1 * m[2],
				bytes: m[2] / 8,
				stdint: `${(m[1] == 'u') ? 'u' : ''}int${m[2]}_t`
			};
		} else {
			platformIntTypes[line] = info;
		}
	}
})();


function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeTypeQualifiers(type) {
	return type
		//.replace(/\[[0-9]*\]/gi, '*')
		.replace(/(^|[^a-z0-9_])(const|volatile)($|[^a-z0-9_])/gi, '$1$3')
		.replace(/(^|[^a-z0-9_])(const|volatile)($|[^a-z0-9_])/gi, '$1$3')
		.replace(/(^|[^a-z0-9_])(const|volatile)($|[^a-z0-9_])/gi, '$1$3')
		.replace(/\s+/g, ' ')
		.trim();
}

exports.REGEN_WARNING = '\n#warning Some dependent code is not generated yet. Generate code again.\n';
exports.filterRecursive = filterRecursive;
exports.findRecursive = findRecursive;
exports.platformIntTypes = platformIntTypes;
exports.escapeRegExp = escapeRegExp;
exports.removeTypeQualifiers = removeTypeQualifiers;
