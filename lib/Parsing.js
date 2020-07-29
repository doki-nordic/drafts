const { writeFileSync, readFileSync } = require('fs');
const { execSync } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { SourceFragments } = require('./SourceFragments');
const { findRecursive, filterRecursive } = require('./Utils');
const CodeBlocks = require('./CodeBlocks');
const NoiselessTags = require('./NoiselessTags');
const { options } = require('./Options');
const path = require('path');


/** @module Parsing */


const CLIENT = /** */ exports.CLIENT = 'CLIENT';
const HOST =   /** */ exports.HOST = 'HOST';
const OTHER =  /** */ exports.OTHER = 'OTHER';

//TODO: check isInvalid AST field to display a warning that something may be incorrectly parsed in this node.

/** Function source code manipulation class.
*/
class Func {

	/** Create new empty function with the given name.
	 */
	constructor(name) {
		/** Function name. */
		this.name = name;
		/** Was the function defined (has a body). */
		this.defined = false;
		/** Side of the source code. */
		this.side = null;
		/** Clang AST node. */
		this._node = null;
		/** `SourceFragments` of a file that defines this function. */
		this._src = null;
		/** Array of cached `SerializeMacro` parsed from body of this function. */
		this._serializeMacros = null;
	}


	/** Replace a previous declaration if a new one has more information.
	 * @param {Object} node Clang AST node that declares the function.
	 * @param {CLIENT|HOST|OTHER} side In which source file function was declared.
	 * @param {SourceFragments} src Source file manipulation object.
	 */
	add(node, side, src) {
		if (this.defined) {
			// ignore if already defined
			return;
		}

		this.defined = !!findRecursive(node.inner, inner => (
			inner.kind == 'CompoundStmt'
		));

		if (!this.defined && this._node && !this._node.isInput) {
			// ignore repeated declarations
			return;
		}

		this._node = node;
		this.side = node.loc.isInput ? side : OTHER;
		this._src = node.loc.isInput ? src : null;
	}


	/** Get return type name of the function. */
	getReturnType() {

		let type = this._node.type.qualType;
		let index = type.length - 1;
		let brackets = 1;
		while (index > 0 && brackets > 0) {
			index--;
			if (type[index] == '(') {
				brackets--;
			} else if (type[index] == ')') {
				brackets++;
			}
		}
		return type.substr(0, index).trim();
	}


	/** Get iterator of `[name, type]` over the function parameters. */
	*getParams() {

		let paramsNode = this._node.inner.filter(n => n.kind == 'ParmVarDecl');
		for (let node of paramsNode) {
			yield [node.name, node.type.qualType.trim()];
		}
	}


	/** Get array of `SerializeMacro` contained in this function body.
	 * @param {string} [key] Match only SERIALIZE(key(...)) macros.
	 */
	getSerializeMacros(key) {

		if (this._serializeMacros == null) {
			this._serializeMacros = [];

			let list = filterRecursive(this._node, inner => (
				inner.kind == 'StringLiteral' &&
				inner.value.startsWith('"__SERIALIZE__:')
			));

			for (let inner of list) {
				this._serializeMacros.push(new SerializeMacro(inner, this._src, this.side));
			}
		}

		if (key) {
			return this._serializeMacros.filter(m => m.key == key);
		} else {
			return this._serializeMacros;
		}
	}


	/** Return `true` if function is serializable (contains at least one `SERIALIZE()` macro). */
	isSerializable() {
		return !!findRecursive(this._node, inner => (
			inner.kind == 'StringLiteral' &&
			inner.value.startsWith('"__SERIALIZE__:')
		));
	}

	placeholderBefore() {
		return new Placeholder(this._node.range.begin.offset, this._src);
	}


	/** Regenerates a function source code.
	 * @param {Object} blocks Code blocks that will replace the function.
	 */
	regenerate(blocks, blockOrder, withHeader) {

		blocks = Object.assign({}, blocks);
		if (!this.defined) {
			throw Error('Internal: Cannot regenerate not defined function.');
		}

		if (!withHeader) {
			delete blocks[CodeBlocks.HEADER];
			delete blocks[CodeBlocks.FOOTER];
			let bodyNode = this._node.inner.find(node => node.kind == 'CompoundStmt');
			let bodyStart = bodyNode.range.begin.offset;
			let bodyEnd = bodyNode.range.end.offset + 1;
			let userBlocks = NoiselessTags.extract(this._src.substring(bodyStart + 1, bodyEnd - 1), CodeBlocks.BEGIN);
			let newCode = NoiselessTags.generate(blocks, userBlocks, blockOrder);
			let bodyFragment = this._src.create(bodyStart + 1, bodyEnd - 1);
			bodyFragment.text = '\n' + newCode;
		} else {
			let start = this._node.range.begin.offset;
			let end = this._node.range.end.offset + 1;
			let lineLen = this._src.substring(end);
			lineLen = lineLen.indexOf('\n');
			if (lineLen >= 0) {
				end += lineLen + 1;
			}
			let userBlocks = NoiselessTags.extract(this._src.substring(start, end), CodeBlocks.BEGIN);
			let newCode = NoiselessTags.generate(blocks, userBlocks, blockOrder);
			let bodyFragment = this._src.create(start, end);
			bodyFragment.text = newCode;
		}
	}

};


class Placeholder {
	constructor(offset, src, atTheEnd) {
		this._offset = offset;
		this._src = src;
		this._fragment = src.create(offset, offset, atTheEnd);
	}

	placeholderBefore() {
		return new Placeholder(this._offset, this._src);
	}

	regenerate(blocks, blockOrder) {
		this._fragment.text = NoiselessTags.generate(blocks, {}, blockOrder) + '\n';
		if (this._fragment.text.trim() == '') {
			this._fragment.text = '';
		}
	}

};


/** Contains information about parsed structure.
 */
class Struct {
	constructor(name) {
		this.name = name;
		this.defined = false;
		this.side = null;
		this._node = null;
		this._src = null;
	}

	add(node, side, src) {
		if (this.defined) {
			// ignore declarations if already defined
			return;
		}

		this.defined = !!findRecursive(node.inner, inner => (
			inner.kind == 'FieldDecl'
		));

		if (!this.defined && this._node) {
			// ignore repeated declarations
			return;
		}

		this._node = node;
		this._src = node.loc.isInput ? src : null;
		this.side = node.loc.isInput ? side : OTHER;
		this.defined = node.completeDefinition;
	}


	/** Get iterator of `[name, type]` over the function parameters. */
	*getFields() {
		//TODO: get also fields from inner structures as `field.innerField`
		//TODO: get also fields from unnamed structures ("kind": "IndirectFieldDecl")
		//TODO: indicate if field is inside a union

		let fieldNodes = this._node.inner.filter(n => n.kind == 'FieldDecl');
		for (let node of fieldNodes) {
			yield [node.name, node.type.qualType.trim()];
		}
	}


	/** Regenerates a structure source code.
	 * @param {Object} blocks Code blocks that will replace the structure.
	 */
	regenerate(blocks, blockOrder) {

		blocks = Object.assign({}, blocks);
		if (!this.defined) {
			throw Error('Internal: Cannot regenerate not defined structure.');
		}

		let start = this._node.range.begin.offset;
		let end = this._node.range.end.offset + 1;
		let lineLen = this._src.substring(end);
		lineLen = lineLen.indexOf('\n');
		if (lineLen >= 0) {
			end += lineLen + 1;
		}
		let userBlocks = NoiselessTags.extract(this._src.substring(start, end), CodeBlocks.BEGIN);
		let newCode = NoiselessTags.generate(blocks, userBlocks, blockOrder);
		let bodyFragment = this._src.create(start, end);
		bodyFragment.text = newCode;
	}
};


/** Contains information about parsed callback typedef.
 */
class Callback {
	constructor(name) {
		this.name = name;
		this.node = null;
		this.side = null;
		this.src = null;
	}

	add(node, side, src) {
		if (this.node) {
			// ignore repeated declarations
			return;
		}

		this.node = node;
		this.side = node.loc.isInput ? side : OTHER;
		this.src = node.loc.isInput ? src : null;
	}
};


/** Contains information about parsed global SERIALIZE() macro.
 */
class SerializeMacro {

	constructor(node, src, side) {

		this._node = node;
		this._src = src;
		this.side = side;

		this._inner = findRecursive(node, inner => (
			inner.kind == 'StringLiteral' &&
			inner.value.startsWith('"__SERIALIZE__:')
		));

		if (!this._inner) {
			throw Error('Internal: Invalid content of SERIALIZE() macro.');
		}

		let text = this._inner.value;
		text = text.substring(15, text.length - 1);
		let index = text.indexOf('=');
		if (index >= 0) {
			this.value = text.substr(index + 1);
			this.key = text.substr(0, index);
		} else {
			this.key = text;
		}
	}

	_findEndOfString(text, pos, last) {
		while (pos < text.length) {
			let c = text[pos];
			if (c == '\\') {
				pos += 2;
			} else if (c == last) {
				return pos + 1;
			} else {
				pos++;
			}
		}
		throw Error('Cannot find end of string literal.');
	}

	_findEndOfStatement(text, pos, last) {
		pos = pos || 0;
		last = last || ';';
		while (pos < text.length) {
			let c = text[pos];
			if (c == last) {
				return pos + 1;
			} else if (c == '(') {
				pos = this._findEndOfStatement(text, pos + 1, ')');
			} else if (c == '{') {
				pos = this._findEndOfStatement(text, pos + 1, '}');
			} else if (c == '[') {
				pos = this._findEndOfStatement(text, pos + 1, ']');
			} else if (c == '"') {
				pos = this._findEndOfString(text, pos + 1, '"');
			} else if (c == '\'') {
				pos = this._findEndOfString(text, pos + 1, '\'');
			} else if (c == '/' && pos + 1 < text.length && text[pos + 1] == '*') {
				let next = text.indexOf('*/', pos + 1);
				if (next < 0) {
					throw Error('Cannot find end of comment.');
				}
				pos = next + 2;
			} else if (c == '/' && pos + 1 < text.length && text[pos + 1] == '/') {
				let next = text.indexOf('\n', pos + 1);
				if (next < 0) {
					throw Error('Cannot find end of comment.');
				}
				pos = next + 1;
			} else if (c == ']' || c == '}' || c == ')' || c == '#') {
				throw Error('Cannot find end of statement.');
			} else {
				pos++;
			}
		}
		throw Error('Cannot find end of statement.');
	}

	regenerate(blocks, blockOrder) {

		let begin = this._node.loc.expansionLoc.offset;
		let text = this._src.substring(begin);
		let len = this._findEndOfStatement(text);
		let m = text.substr(len).match(/^(\s|\/\*[\S\s]*?\*\/)*?\n/);
		if (m) {
			len += m[0].length;
		}
		let bodyFragment = this._src.create(begin, begin + len);
		bodyFragment.text = NoiselessTags.generate(blocks, {}, blockOrder);
	}


};


/** Parses the input.
 */
class Parser {

	constructor(inputFile) {

		this.cli = { side: CLIENT };
		this.host = { side: HOST };

		this._clangPath = options.clangPath;
		this._clangParams = options.clangParams;
		this._clangCliParams = options.clangCliParams;
		this._clangHostParams = options.clangHostParams;
		this._generatorInclude = options.generatorInclude;
		this._dumpIntermediateFiles = options.dumpIntermediateFiles;

		this.symbols = {};
		this.cli.functions = {};
		this.cli.structures = {};
		this.cli.callbacks = {};
		this.host.functions = {};
		this.host.structures = {};
		this.host.callbacks = {};
		this.commonFunctions = {};
		this.commonStructures = {};
		this.commonCallbacks = {};
		this.serializeMacros = [];

		this.cli._ast = {};
		this.host._ast = {};
		this.cli._src = {};
		this.host._src = {};

		inputFile = path.resolve(inputFile);

		let inputSide = this._detectSourceSide(inputFile);

		if (inputSide == CLIENT) {
			this.cli._srcPath = inputFile;
			[this.cli._ast, this.cli._src] = this._parseFile(inputFile, this._clangCliParams);
			this.host._srcPath = this._getOppositeSideFile(inputFile, this.cli._ast);
			[this.host._ast, this.host._src] = this._parseFile(this.host._srcPath, this._clangHostParams);
		} else {
			this.host._srcPath = inputFile;
			[this.host._ast, this.host._src] = this._parseFile(inputFile, this._clangHostParams);
			this.cli._srcPath = this._getOppositeSideFile(inputFile, this.host._ast);
			[this.cli._ast, this.cli._src] = this._parseFile(this.cli._srcPath, this._clangCliParams);
		}

		this._collectSymbols(this.cli._ast, CLIENT, this.cli.functions, this.cli.structures, this.cli.callbacks);
		this._collectSymbols(this.host._ast, HOST, this.host.functions, this.host.structures, this.host.callbacks);
		this.commonFunctions = this._collectCommon(this.cli.functions, this.host.functions);
		this.commonStructures = this._collectCommon(this.cli.structures, this.host.structures);
		this.commonCallbacks = this._collectCommon(this.cli.callbacks, this.host.callbacks);
		this._collectSerializeMacros(this.cli._ast, this.cli._src, CLIENT);
		this._collectSerializeMacros(this.host._ast, this.host._src, HOST);
	}

	_collectCommon(cliSymbols, hostSymbols) {
		let res = {};

		for (let name in hostSymbols) {
			res[name] = hostSymbols[name];
		}
		for (let name in cliSymbols) {
			res[name] = cliSymbols[name];
		}

		return res;
	}

	_getOppositeSideFile(thisFile, ast) {
		let node = findRecursive(ast, node => (
			node.kind == 'StringLiteral' &&
			(node.value.startsWith('"__SERIALIZE__:HOST_FILE=') ||
				node.value.startsWith('"__SERIALIZE__:CLI_FILE='))
		));
		let otherFile = node.value.substring(node.value.indexOf('=') + 1, node.value.length - 1);
		otherFile = otherFile.replace(/\\(["'\\])/g, '$1');
		let thisDir = path.dirname(thisFile);
		otherFile = path.resolve(thisDir, otherFile);
		return otherFile;
	}

	_detectSourceSide(path) {
		let src = readFileSync(path, 'utf-8');
		let cli = !!src.match(/SERIALIZE\s*\(\s*HOST_FILE\s*\(.*?\)\s*\)/);
		let host = !!src.match(/SERIALIZE\s*\(\s*CLI_FILE\s*\(.*?\)\s*\)/);
		if (cli && !host) {
			return CLIENT;
		} else if (host && !cli) {
			return HOST;
		} else {
			throw Error(`Cannot which side is the input file. Use one of 'SERIALIZE(HOST_FILE(...))' or 'SERIALIZE(CLI_FILE(...))'.`);
		}
	}


	getSerializeMacros(key) {
		return this.serializeMacros.filter(m => (m.key == key));
	}


	getSerializeMacro(key) {
		let m = this.serializeMacros.filter(m => (m.key == key));
		if (m.length == 0) {
			return undefined;
		} else if (m.length = 1) {
			return m[0];
		} else {
			throw Error(`Expected no more than one SERIALIZE(${key}...) macro.`);
		}
	}


	_collectSymbols(ast, side, functions, structures, callbacks) {

		this._collectItems(ast, functions, side, Func, '', node =>
			node.kind == 'FunctionDecl'
		);

		this._collectItems(ast, structures, side, Struct, 'struct ', node =>
			node.kind == 'RecordDecl' &&
			node.tagUsed == 'struct' &&
			'name' in node
		);

		this._collectItems(ast, callbacks, side, Callback, '', node =>
			node.kind == 'TypedefDecl' &&
			'inner' in node &&
			node.inner.some(node2 =>
				node2.kind == 'PointerType' &&
				'inner' in node2 &&
				node2.inner.some(node3 =>
					node3.kind == 'ParenType' &&
					'inner' in node3 &&
					node3.inner.some(node4 =>
						node4.kind == 'FunctionProtoType'
					)
				)
			)
		);
	}


	_collectSerializeMacros(ast, src, side) {

		let list = ast.inner.filter(node =>
			node.kind == 'VarDecl' &&
			node.name.startsWith('_serialize_unique_') &&
			!!findRecursive(node, inner => (
				inner.kind == 'StringLiteral' &&
				inner.value.startsWith('"__SERIALIZE__:')
			))
		);

		for (let node of list) {
			this.serializeMacros.push(new SerializeMacro(node, src, side));
		}
	}


	_parseFile(file, specificParams) {

		let json;
		try {
			// TODO: more advanced method of executing clang
			let output = execSync(`${this._clangPath} -Xclang -ast-dump=json -fsyntax-only -include ${this._generatorInclude} ${this._clangParams} ${specificParams} ${file}`);
			json = new StringDecoder().write(output);
		} catch (ex) {
			if ('stdout' in ex && ex.stdout.length > 0) {
				json = new StringDecoder().write(ex.stdout);
			} else {
				console.log(ex);
				process.exit(1);
			}
		}

		if (this._dumpIntermediateFiles) {
			writeFileSync(`${file}.ast.json`, json);
		};

		let ast = JSON.parse(json);
		Parser._checkAstFiles(ast, file);

		return [ast, new SourceFragments(file)];
	}


	static _checkAstFiles(node, fileName, state) {
		if (typeof (node) == 'object') {
			state = state || { isInput: false };
			if (node instanceof Array) {
				for (let item of node) {
					Parser._checkAstFiles(item, fileName, state);
				}
			} else {
				if ('offset' in node && 'col' in node) {
					if ('file' in node) {
						state.isInput = (node.file == fileName);
					}
					node.isInput = state.isInput;
				}
				for (let i in node) {
					Parser._checkAstFiles(node[i], fileName, state);
				}
				if ('spellingLoc' in node && 'expansionLoc' in node) {
					node.isInput = node.expansionLoc.isInput;
					node.offset = node.expansionLoc.offset;
					node.file = node.expansionLoc.file;
					node.line = node.expansionLoc.line;
					node.col = node.expansionLoc.col;
					node.tokLen = node.expansionLoc.tokLen;
					node.includedFrom = node.expansionLoc.includedFrom;
				}
			}
		}
	}


	_collectItems(ast, collection, side, Class, namePrefix, callback) {

		let list = ast.inner.filter(callback);

		for (let node of list) {
			let name = namePrefix + node.name;
			if (!(name in collection)) {
				collection[name] = new Class(name);
			}
			collection[name].add(node, side, side == CLIENT ? this.cli._src : this.host._src);
		}
	}

	save() {
		this.cli._src.save(this.cli._srcPath);
		this.host._src.save(this.host._srcPath);
	}

	newPlaceholder(side) {
		if (side == HOST) {
			return new Placeholder(this.host._src.length, this.host._src, true);
		} else {
			return new Placeholder(this.cli._src.length, this.cli._src, true);
		}
	}
};


exports.Parser = Parser;
exports.Func = Func;
exports.SerializeMacro = SerializeMacro;

