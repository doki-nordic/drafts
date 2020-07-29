const Parsing = require("./Parsing");
const NrfRpcCborGenerator = require("./NrfRpcCborGenerator");
const { options } = require("./Options");
const { removeTypeQualifiers } = require("./Utils");


/** @module Units */


const IN = exports.IN = "IN";
const OUT = exports.OUT = "OUT";
const INOUT = exports.INOUT = "INOUT";


const RSP_FUNC_POSTFIX = exports.RSP_FUNC_POSTFIX = '_rpc_rsp';
const RES_STRUCT_POSTFIX = exports.RES_STRUCT_POSTFIX = '_rpc_res';
const RECV_FUNC_POSTFIX = exports.RECV_FUNC_POSTFIX = '_rpc_handler';
const CALLBACK_RECV_POSTFIX = exports.CALLBACK_RECV_POSTFIX = '_rpc_cbk_handler';

const STRUCT_ENCODE_POSTFIX = exports.STRUCT_ENCODE_POSTFIX = '_enc';
const STRUCT_DECODE_POSTFIX = exports.STRUCT_DECODE_POSTFIX = '_dec';
const STRUCT_BUFFER_INIT_VALUE_POSTFIX = exports.STRUCT_BUFFER_INIT_VALUE_POSTFIX = '_buf_init';
const STRUCT_BUFFER_SIZE_POSTFIX = exports.STRUCT_BUFFER_SIZE_POSTFIX = '_buf_size';
const STRUCT_SCRATCHPAD_SIZE_POSTFIX = exports.STRUCT_SCRATCHPAD_SIZE_POSTFIX = '_sp_size';

let generator = null;

function getGenerator() {
	if (generator === null) {
		generator = require(`./${options.generator}`);
	}
	return generator;
}


/** Groups all functionality for function serialization.
 * * Client:
 *	* (sendFunc)  xyz - encode parameters, send and optionally parse response
 *	* (rspFunc)   xyz_rpc_rsp - (optional) parse response
 *	* (resStruct) struct xyz_rpc_res - (optional) parsing response results
 * * Host:
 *	* (recvFunc)  xyz_rpc_handler - decode parameters, execute, encode response
 *      * (regMacro)  xyz_rpc_reg - macro registering handler
 * 
 * 
 * 
 * SERIALIZE() macros:
 * 	EVENT - serialize a an event
 * 	INLINE_RESPONSE - parse response in the same function
 * 	IGNORE_RETURN - ignore that function returns a value, generate function as it returns 'void'.
 * 	CUSTOM_RESPONSE - prevent from using standard response handlers, but always generate a new response handler.
 * 	OUT(param) - serialize 'param' as an output.
 * 	INOUT(param) - serialize 'param' as on input-output.
 * 	STR(param) - serialize 'param' as a string (not a pointer to a 'char').
 * 	ADD_IN(type, param) - add custom input parameter.
 * 	ADD_OUT(type, param) - add custom output paramter.
 * 	ADD_INOUT(type, param)- add custom input-output paramter.
 * 
 */
class UnitFunc {

	constructor(module, name) {

		this.module = module;
		this.parser = module.parser;
		this.name = name;
		this.sendFunc = null;
		this.sendFuncPlaceholder = null;
		this.rspFunc = null;
		this.rspFuncPlaceholder = null;
		this.params = {};
		this.isEvent = false;
		this.functions = [];
		this.generator = null;

		this._collectSymbols();

		this.isEvent = this._checkAnnotation('EVENT');
		this.ignoreReturn = this._checkAnnotation('IGNORE_RETURN');
		this.customResponse = this._checkAnnotation('CUSTOM_RESPONSE');
		this.inlineResponse = this._checkAnnotation('INLINE_RESPONSE');
		this.responseHandlerGenerate = !this.inlineResponse;

		for (let m of this.sendFunc.getSerializeMacros('CALLBACK')) {
			this.isCallback = true;
			this.callbackType = m.value;
		}

		if (this.isEvent && this.inlineResponse) {
			throw Error(`Inline response is not possible for event in function '${this.name}'.`);
		}

		let returnType = this.sendFunc.getReturnType();

		let callOrderIndex = 0;

		if (returnType != 'void' && !this.ignoreReturn) {
			this.params['_result'] = {
				name: '_result',
				type: returnType,
				dir: OUT,
				isReturn: true,
				callOrder: -1,
			}
		}

		for (let [name, type] of this.sendFunc.getParams()) {
			if (name === undefined) {
				throw Error(`All parameters in '${this.name}' must be named.`);
			} else if (this.isCallback && name.startsWith('_rsv')) {
				continue;
			}
			this.params[name] = {
				name: name,
				type: type,
				dir: IN,
				callOrder: callOrderIndex
			}
			callOrderIndex++;
		}

		for (let m of this.sendFunc.getSerializeMacros('OUT')) {
			if (!(m.value in this.params)) {
				throw new Error(`Parameter '${m.value}' not found for SERIALIZE(OUT(...)) in '${this.name}'.`);
			}
			this.params[m.value].dir = OUT;
		}

		for (let m of this.sendFunc.getSerializeMacros('INOUT')) {
			if (!(m.value in this.params)) {
				throw new Error(`Parameter '${m.value}' not found for SERIALIZE(INOUT(...)) in '${this.name}'.`);
			}
			this.params[m.value].dir = INOUT;
		}

		for (let m of this.sendFunc.getSerializeMacros('ADD')) {
			let [dir, type, name] = m.value.split('`');
			dir = dir.toUpperCase();
			this.params[name] = {
				name: name,
				type: type,
				dir: dir == 'IN' ? IN : dir == 'OUT' ? OUT : dir == 'INOUT' ? INOUT : null,
				callOrder: -1
			}
			if (this.params[name].dir === null) {
				throw Error(`Invalid direction specifier for SERIALIZE(ADD(...)) in function ${this.name}`);
			}
		}

		for (let m of this.sendFunc.getSerializeMacros('DEL')) {
			let name = m.value.split('`');
			delete this.params[name];
		}

		for (let m of this.sendFunc.getSerializeMacros('STR')) {
			if (!(m.value in this.params)) {
				throw new Error(`Parameter '${m.value}' not found for SERIALIZE(STR(...)) in '${this.name}'.`);
			}
			this.params[m.value].isString = true;
		}

		for (let m of this.sendFunc.getSerializeMacros('SIZE')) {
			let [name, size] = m.value.split('`');
			this.params[name].isArray = true;
			this.params[name].sizePattern = size;
			this.params[name].sizeParam = null;
		}

		for (let m of this.sendFunc.getSerializeMacros('SIZE_PARAM')) {
			let [name, size] = m.value.split('`');
			this.params[name].isArray = true;
			this.params[name].sizePattern = '$';
			this.params[name].sizeParam = size;
			this.params[size].isSize = true;
			this.params[size].arrays = this.params[size].arrays || [];
			this.params[size].arrays.push(name);
			this._putParamBefore(size, name);
		}

		for (let m of this.sendFunc.getSerializeMacros('SIZE_PARAM_EX')) {
			let [name, pattern, size] = m.value.split('`');
			this.params[name].isArray = true;
			this.params[name].sizePattern = pattern;
			this.params[name].sizeParam = size;
			this.params[size].isSize = true;
			this.params[size].arrays = this.params[size].arrays || [];
			this.params[size].arrays.push(name);
			this._putParamBefore(size, name);
		}

		for (let m of this.sendFunc.getSerializeMacros('NULLABLE')) {
			this.params[m.value].isNullable = true;
		}
	}

	_putParamBefore(first, later) {
		let keys = Object.keys(this.params);
		let firstIndex = keys.indexOf(first);
		let laterIndex = keys.indexOf(later);
		if (firstIndex < 0 || laterIndex < 0) {
			throw Error(`Cannot find '${first}' or '${later}' parameter.`);
		}
		if (firstIndex <= laterIndex) {
			return;
		}
		let entries = Object.entries(this.params);
		let x = entries.splice(firstIndex, 1)[0];
		entries.splice(laterIndex, 0, x);
		this.params = Object.fromEntries(entries);
	}

	_checkAnnotation(name) // TODO: Rename serialize macro to annotation
	{
		for (let f of this.functions) {
			if (f.getSerializeMacros(name).length > 0) {
				return true;
			}
		}
		return false;
	}

	_collectSymbols() {
		if (this.name in this.parser.cli.functions) {
			this.sender = this.parser.cli;
			this.receiver = this.parser.host;
		} else if (this.name in this.parser.host.functions) {
			this.sender = this.parser.host;
			this.receiver = this.parser.cli;
		} else {
			throw Error(`Generation of function '${this.name}' was requested, but function is undefined.`);
		}

		this.sendFunc = this.sender.functions[this.name];

		if (this.sendFunc.defined) {
			this.functions.push(this.sendFunc);
		} else {
			let list = this.parser.getSerializeMacros('FUNC').filter(m => m.value == this.name);
			if (list.length < 1) {
				throw Error(`Function '${this.name}' generation location is unknown. Use 'SERIALIZE(FUNC(${this.name}))'.`);
			}
			this.sendFuncPlaceholder = list[0];
		}

		this.rspFunc = this.sender.functions[this.name + RSP_FUNC_POSTFIX];

		if (!this.rspFunc) {
			this.rspFuncPlaceholder = this.sendFuncPlaceholder ? this.sendFuncPlaceholder.placeholderBefore() : this.sendFunc.placeholderBefore();
		} else {
			this.functions.push(this.rspFunc);
		}

		this.resStruct = this.sender.structures['struct ' + this.name + RES_STRUCT_POSTFIX];

		if (!this.resStruct) {
			this.resStructPlaceholder = this.rspFunc ? this.rspFunc.placeholderBefore() : this.rspFuncPlaceholder.placeholderBefore();
		}

		this.recvFunc = this.receiver.functions[this.name + RECV_FUNC_POSTFIX];

		if (!this.recvFunc) {
			this.recvFuncPlaceholder = this.parser.newPlaceholder(this.receiver.side);
		} else {
			this.functions.push(this.recvFunc);
		}

		let list = this.parser.getSerializeMacros('REGISTER_DECODER').filter(m => m.value == this.name + RECV_FUNC_POSTFIX);
		if (list.length != 1) {
			this.regMacroPlaceholder = this.parser.newPlaceholder(this.receiver.side);
		} else {
			this.regMacro = list[0];
		}
	}

	generate() {

		let generator = new (getGenerator().GenFunc)(this);

		generator.generateCliSendFunc(this.sendFunc.defined ? this.sendFunc : this.sendFuncPlaceholder); // false

		if (this.responseHandlerGenerate) {
			generator.generateCliRspFunc(this.rspFunc || this.rspFuncPlaceholder); // true
			generator.generateCliResStruct(this.resStruct || this.resStructPlaceholder); // true
		} else {
			if (this.rspFunc) {
				this.rspFunc.regenerate({}, [], true);
			}
			if (this.resStruct) {
				this.resStruct.regenerate({}, [], true);
			}
		}

		generator.generateHostRecvFunc(this.recvFunc || this.recvFuncPlaceholder); // true

		generator.generateRegMacro(this.regMacro || this.regMacroPlaceholder); // true
	}

	getGroup() {
		return this.module.group;
	}

	getId() {
		let pattern = this.isEvent ? this.module.evtPattern : this.module.cmdPattern;
		return pattern.replace('$', this.name.toUpperCase());
	}

};


class UnitStruct {

	constructor(module, func, custom) {
		this.module = module;
		this.parser = module.parser;
		this.encFunc = func;
		this.custom = custom;
		this.type = custom ? func.getSerializeMacros('CUSTOM_STRUCT')[0].value : func.getSerializeMacros('STRUCT')[0].value;

		if (!func.name.endsWith(STRUCT_ENCODE_POSTFIX)) {
			throw Error(`Structure '${this.type}' encoder '${func.name}' must end with '${STRUCT_ENCODE_POSTFIX}'.`);
		}

		this.name = func.name.substr(0, func.name.length - STRUCT_ENCODE_POSTFIX.length);

		if (func.side == Parsing.CLIENT) {
			this.encoder = this.parser.cli;
			this.decoder = this.parser.host;
		} else {
			this.encoder = this.parser.host;
			this.decoder = this.parser.cli;
		}

		this._collectSymbols();

		this.struct = this.encoder.structures[this.type];
		if (!this.struct) {
			this.struct = this.decoder.structures[this.type];
		}

		if (!this.struct) {
			throw new Error(`Cannot find a structure '${this.type}' for encoder '${func.name}'.`);
		}

		if (custom) {
			return;
		}

		this.fields = {};
		for (let [name, type] of this.struct.getFields()) {
			this.fields[name] = {
				name: name,
				type: type,
			};
		}

		for (let m of this.encFunc.getSerializeMacros('STRUCT_INLINE')) {
			let name = m.value;
			this._checkFieldExists(name);
			let type = removeTypeQualifiers(this.fields[name].type);
			delete this.fields[name];
			let struct = this.encoder.structures[type];
			if (!struct) {
				struct = this.decoder.structures[type];
			}
			if (!struct) {
				throw new Error(`Cannot find a structure '${this.type}' for encoder '${func.name}'.`);
			}
			for (let [innerName, innerType] of struct.getFields()) {
				this.fields[`${name}.${innerName}`] = {
					name: `${name}.${innerName}`,
					type: innerType,
				};
			}
		}


		for (let m of this.encFunc.getSerializeMacros('SIZE')) {
			let [name, size] = m.value.split('`');
			this._checkFieldExists(name);
			this.fields[name].isArray = true;
			this.fields[name].sizePattern = size;
			this.fields[name].sizeParam = null;
		}

		for (let m of this.encFunc.getSerializeMacros('SIZE_PARAM')) {
			let [name, size] = m.value.split('`');
			this.fields[name].isArray = true;
			this.fields[name].sizePattern = '$';
			this.fields[name].sizeParam = size;
			this.fields[size].isSize = true;
			this._putParamBefore(size, name);
		}

		for (let m of this.encFunc.getSerializeMacros('SIZE_PARAM_EX')) {
			let [name, pattern, size] = m.value.split('`');
			this.fields[name].isArray = true;
			this.fields[name].sizePattern = pattern;
			this.fields[name].sizeParam = size;
			this.fields[size].isSize = true;
			this._putParamBefore(size, name);
		}

		for (let m of this.encFunc.getSerializeMacros('NULLABLE')) {
			this.fields[m.value].isNullable = true;
		}
	}

	_checkFieldExists(fieldName) {
		if (!this.fields[fieldName]) {
			console.log(Object.keys(this.fields).join(', '));
			throw Error(`Cannot find field '${fieldName}'.`); // TODO: show more details.
		}
	}

	_putParamBefore(first, later) {
		let keys = Object.keys(this.fields);
		let firstIndex = keys.indexOf(first);
		let laterIndex = keys.indexOf(later);
		if (firstIndex < 0 || laterIndex < 0) {
			throw Error(`Cannot find '${first}' or '${later}' parameter.`);
		}
		if (firstIndex <= laterIndex) {
			return;
		}
		let entries = Object.entries(this.fields);
		let x = entries.splice(firstIndex, 1)[0];
		entries.splice(laterIndex, 0, x);
		this.fields = Object.fromEntries(entries);
	}

	_collectSymbols() {

		this.bufSizeFunc = this.encoder.functions[this.name + STRUCT_BUFFER_SIZE_POSTFIX];
		if (!this.bufSizeFunc) {
			this.bufSizeFuncPlaceholder = this.encFunc.placeholderBefore();
		}

		this.spSizeFunc = this.encoder.functions[this.name + STRUCT_SCRATCHPAD_SIZE_POSTFIX];
		if (!this.spSizeFunc) {
			this.spSizeFuncPlaceholder = this.encFunc.placeholderBefore();
		}

		this.decFunc = this.decoder.functions[this.name + STRUCT_DECODE_POSTFIX];
		if (!this.decFunc) {
			this.decFuncPlaceholder = this.parser.newPlaceholder(this.decoder.side);
		}

		let list = this.parser.getSerializeMacros('STRUCT_BUFFER_CONST').filter(m => m.value.startsWith(this.name + '`') && m.side == this.encoder.side);
		if (list.length > 1) {
			throw Error(`More than one STRUCT_BUFFER_CONST for '${this.name}'`);
		} else if (list.length == 1) {
			this.bufSizeAnnotation = list[0];
			let [_, value] = list[0].value.split('`');
			this.bufferConst = value;
		} else {
			this.bufSizeAnnotationPlaceholder = this.parser.newPlaceholder(this.encoder.side);
		}
	}

	generate() {
		if (this.custom) {
			return;
		}

		let generator = new (getGenerator().GenStruct)(this);

		generator.generateEncFunc(this.encFunc);
		generator.generateBufSizeFunc(this.bufSizeFunc || this.bufSizeFuncPlaceholder);
		generator.generateSpSizeFunc(this.spSizeFunc || this.spSizeFuncPlaceholder);
		generator.generateDecFunc(this.decFunc || this.decFuncPlaceholder);
		generator.generateBufSizeConst(this.bufSizeAnnotation || this.bufSizeAnnotationPlaceholder);
	}


};


/** Top level class */
class Module {

	constructor(filePath) {
		this.parser = new Parsing.Parser(filePath);
		this.generatedUnitFunc = {};
		this.cmdPattern = this.parser.getSerializeMacro('CMD_ID');
		this.evtPattern = this.parser.getSerializeMacro('EVT_ID');
		if (!this.cmdPattern || !this.evtPattern) {
			throw Error(`Cannot create command or event ID. Use both 'SERIALIZE(CMD_ID(...))' and 'SERIALIZE(EVT_ID(...))'.`);
		}
		this.cmdPattern = this.cmdPattern.value;
		this.evtPattern = this.evtPattern.value;
		this.group = this.parser.getSerializeMacro('GROUP');
		if (!this.group) {
			throw Error(`Group is unknown. Use 'SERIALIZE(GROUP(...))'.`);
		}
		this.group = this.group.value;

		this.definedCallbacks = {};
		this.rawStructures = {};

		for (let m of this.parser.getSerializeMacros('RAW_STRUCT')) {
			this.rawStructures[m.value.trim()] = true;
		}

		this.opaqueStructures = {};

		for (let m of this.parser.getSerializeMacros('OPAQUE_STRUCT')) {
			this.opaqueStructures[m.value.trim()] = true;
		}

		this.structEncoders = { // TODO: rename to codecs
			[Parsing.HOST]: {},
			[Parsing.CLIENT]: {},
		}

	}


	isCallback(name) {
		return !!this.definedCallbacks[name];
	}


	execute() {

		for (let name in this.parser.commonCallbacks) {
			this.definedCallbacks[name] = true;
		}

		for (let name in this.parser.commonFunctions) {
			let func = this.parser.commonFunctions[name];

			if (func.getSerializeMacros('STRUCT').length > 0) {
				func.isStructEnc = true;
				let s = new UnitStruct(this, func);
				this.structEncoders[func.side][s.name] = s;
			}

			if (func.getSerializeMacros('CUSTOM_STRUCT').length > 0) {
				func.isStructEnc = true;
				let s = new UnitStruct(this, func, true);
				this.structEncoders[func.side][s.name] = s;
			}
		}

		for (let name in this.parser.commonFunctions) {
			let func = this.parser.commonFunctions[name];

			if (func.isStructEnc) {
				// skip
			} else if (name.endsWith(RSP_FUNC_POSTFIX)) {
				this._generateUnitFunc(name.substr(0, name.length - RSP_FUNC_POSTFIX.length));
			} else if (name.endsWith(RECV_FUNC_POSTFIX)) {
				this._generateUnitFunc(name.substr(0, name.length - RECV_FUNC_POSTFIX.length));
			} else if (func.isSerializable()) {
				this._generateUnitFunc(name);
			}
		}

		for (let name in this.parser.commonStructures) {

			if (!name.startsWith('struct ')) {
				continue;
			}

			if (name.endsWith(RES_STRUCT_POSTFIX)) {
				this._generateUnitFunc(name.substring(7, name.length - RSP_FUNC_POSTFIX.length));
			}
		}

		for (let m of this.parser.getSerializeMacros('FUNC')) {

			this._generateUnitFunc(m.value);
		}

		for (let side in this.structEncoders) {
			for (let name in this.structEncoders[side]) {
				this.structEncoders[side][name].generate();
			}
		}
	}


	_generateUnitFunc(name) {

		if (name in this.generatedUnitFunc) {
			return;
		}
		this.generatedUnitFunc[name] = true;

		let f = new UnitFunc(this, name);
		f.generate();
	}


	save() {
		this.parser.save();
	}

	isRawStruct(typeName) {
		if (this.rawStructures[typeName.trim()]) {
			return true;
		}
		if (typeName.startsWith('struct ') && this.rawStructures[typeName.substr(7).trim()]) {
			return true;
		}
		return false;
	}

	isOpaqueStruct(typeName) {
		if (this.opaqueStructures[typeName.trim()]) {
			return true;
		}
		if (typeName.startsWith('struct ') && this.opaqueStructures[typeName.substr(7).trim()]) {
			return true;
		}
		return false;
	}

	findStructCodec(typeName, func, info, oppositeSide) {

		let enc;

		let f = func.sendFunc || func.sendFuncPlaceholder || func.encFunc || func.encFuncPlaceholder;
		let side = f.side;
		if (oppositeSide) {
			side = (side == Parsing.HOST) ? Parsing.CLIENT : Parsing.HOST;
		}

		if (info.customCodec) {
			enc = this.structEncoders[side][info.customCodec];
			if (!enc) {
				throw Error(`Cannot find structure codec '${info.customCodec}' for function '${func.name}'.`);
			}
		} else {
			let structName = typeName.startsWith('struct ') ? typeName.substr(7).trim() : typeName;
			enc = this.structEncoders[side][structName];
			if (!enc) {
				throw Error(`Cannot find structure codec for '${typeName}' for '${func.name}'.`);
			}
		}

		return enc;
	}

}


exports.UnitFunc = UnitFunc;
exports.Module = Module;
