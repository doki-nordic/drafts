const CodeBlocks = require('./CodeBlocks');
const Units = require('./Units');
const { platformIntTypes, REGEN_WARNING, removeTypeQualifiers } = require('./Utils');
const { options } = require('./Options');


/** @module NrfRpcCborGenerator */

let predefinedResponseHandlers = {
	'bool': ['ser_rsp_simple_bool', 'ser_rsp_send_bool'],
	'float': ['ser_rsp_simple_float', 'ser_rsp_send_float'],
	'double': ['ser_rsp_simple_double', 'ser_rsp_send_double'],
	'int8_t': ['ser_rsp_simple_i8', 'ser_rsp_send_i8'],
	'uint8_t': ['ser_rsp_simple_u8', 'ser_rsp_send_u8'],
	'int16_t': ['ser_rsp_simple_i16', 'ser_rsp_send_i16'],
	'uint16_t': ['ser_rsp_simple_u16', 'ser_rsp_send_u16'],
	'int32_t': ['ser_rsp_simple_i32', 'ser_rsp_send_i32'],
	'uint32_t': ['ser_rsp_simple_u32', 'ser_rsp_send_u32'],
	'int64_t': ['ser_rsp_simple_i64', 'ser_rsp_send_i64'],
	'uint64_t': ['ser_rsp_simple_u64', 'ser_rsp_send_u64']
};

/*

sendFuncBufMax -
sendFuncEnc    -
sendFuncAssign -
recvFuncLoc    -
recvFuncDec    -
recvFuncPar    -
resStructField -
sendFuncReturn -
rspFuncDec     -
recvFuncBufMax -
recvFuncEnc    -
sendFuncLoc    -
sendFuncCalc   -
scratchpad     -
recvFuncCalc   -
recvFuncOutDec -
*/

let paramTemplates = {
	'in T': {
		sendFuncBufMax: p => p.basicType.bufferSize,
		sendFuncEnc: p => `${p.encoderName}(&_ctx.encoder, ${p.name});`,
		sendFuncAssign: p => p.isSizeForOutput() ? `_result.${p.name} = ${p.name};` : '',
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ${p.decoderName}(_value);`,
		recvFuncPar: p => `${p.name}`,
		resStructField: p => p.isSizeForOutput() ? `${p.type} ${p.name};` : '',
	},
	'in O*': {
		sendFuncBufMax: p => platformIntTypes['uintptr_t'].bytes + 1,
		sendFuncEnc: p => `ser_encode_uint(&_ctx.encoder, (uintptr_t)${p.name});`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = (${p.type})ser_decode_uint(_value);`,
		recvFuncPar: p => `${p.name}`,
	},
	'ret T': {
		sendFuncReturn: p => `return _result.${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => `_res->${p.name} = ${p.decoderName}(_value);`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => p.basicType.bufferSize,
		recvFuncEnc: p => `${p.encoderName}(&_ctx.encoder, &${p.name});`,
	},
	'out T*': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => `*(_res->${p.name}) = ${p.decoderName}(_value);`,
		recvFuncLoc: p => `${p.shortType} _${p.name}_data;\n${p.type} ${p.name} = &_${p.name}_data;`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => p.basicType.bufferSize,
		recvFuncEnc: p => `${p.encoderName}(&_ctx.encoder, *${p.name});`,
	},
	'out O**': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => `*(_res->${p.name}) = (${p.shortType} *)(uintptr_t)ser_decode_uint(_value);`,
		recvFuncLoc: p => `${p.shortType} *_${p.name}_data;\n${p.type} ${p.name} = &_${p.name}_data;`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => platformIntTypes['uintptr_t'].bytes + 1,
		recvFuncEnc: p => `ser_encode_uint(&_ctx.encoder, (uintptr_t)(*${p.name}));`,
	},
	'inout T*': {
		sendFuncBufMax: p => p.basicType.bufferSize,
		sendFuncEnc: p => `${p.encoderName}(&_ctx.encoder, *${p.name});`,
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => `*(_res->${p.name}) = ${p.decoderName}(_value);`,
		recvFuncLoc: p => `${p.shortType} _${p.name}_data;\n${p.type} ${p.name} = &_${p.name}_data;`,
		recvFuncDec: p => `*${p.name} = ${p.decoderName}(_value);`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => p.basicType.bufferSize,
		recvFuncEnc: p => `${p.encoderName}(&_ctx.encoder, *${p.name});`,
	},
	'in T[]?': 'in T[]',
	'in T[]': {
		sendFuncBufMax: p => 5,
		sendFuncLoc: p => `size_t _${p.name}_size;`,
		sendFuncCalc: p => `_${p.name}_size = ${p.isNullable ? `!${p.name} ? 0 : ` : ''}${p.basicType.sizeOf} * ${p.getArraySize()};\n_buffer_size_max += _${p.name}_size;`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(_${p.name}_size);`,
		sendFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, _${p.name}_size);`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_decode_buffer_sp(&_scratchpad);`,
		recvFuncPar: p => `${p.name}`,
	},
	'inout T[]?': 'inout T[]',
	'inout T[]': {
		sendFuncBufMax: p => 5,
		sendFuncLoc: p => `size_t _${p.name}_size;`,
		sendFuncCalc: p => `_${p.name}_size = ${p.isNullable ? `!${p.name} ? 0 : ` : ''}${p.basicType.sizeOf} * ${p.getArraySize()};
					_buffer_size_max += _${p.name}_size;`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(_${p.name}_size);`,
		sendFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, _${p.name}_size);`,
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => `ser_decode_buffer(_value, _res->${p.name}, ${p.basicType.sizeOf} * ${p.getArraySize()});`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_decode_buffer_sp(&_scratchpad);`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => 5,
		recvFuncCalc: p => `_buffer_size_max += ${p.isNullable ? `!${p.name} ? 0 : ` : ''}${p.basicType.sizeOf} * ${p.getArraySize()};`,
		recvFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, ${p.basicType.sizeOf} * ${p.getArraySize()});`,
	},
	'in STR': {
		sendFuncBufMax: p => 5,
		sendFuncLoc: p => `size_t _${p.name}_strlen;`,
		sendFuncCalc: p => `_${p.name}_strlen = strlen(${p.name});\n_buffer_size_max += _${p.name}_strlen;`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(_${p.name}_strlen + 1);`,
		sendFuncEnc: p => `ser_encode_str(&_ctx.encoder, ${p.name}, _${p.name}_strlen);`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_decode_str_sp(&_scratchpad);`,
		recvFuncPar: p => `${p.name}`,
	},
	'out STR[]': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(${p.getArraySize()});`,
		rspFuncDec: p => `ser_decode_str(_value, _res->${p.name}, ${p.getArraySize('(_res->$)')});`,
		resStructField: p => `${p.type} ${p.name};`,
		recvFuncLoc: p => `size_t _${p.name}_strlen;\n${p.type} ${p.name};`,
		recvFuncOutDec: p => `${p.name} = ser_scratchpad_get(${p.getArraySize()});`,
		recvFuncPar: p => `${p.name}`,
		recvFuncCalc: p => `_${p.name}_strlen = strlen(${p.name});\n_buffer_size_max += _${p.name}_strlen;`,
		recvFuncEnc: p => `ser_encode_str(&_ctx.encoder, ${p.name}, _${p.name}_strlen);`,
		recvFuncBufMax: p => 5,
	},
	'in CBK': {
		sendFuncBufMax: p => 5,
		sendFuncEnc: p => `ser_encode_callback(&_ctx.encoder, ${p.name});`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = (${p.type})ser_decode_callback(_value, ${p.type}_encoder);`,
		recvFuncPar: p => `${p.name}`,
	},
	'in RS*?': 'in RS*',
	'in RS*': {
		sendFuncBufMax: p => 3,
		sendFuncCalc: p => `_buffer_size_max += ${p.name} ? sizeof(${p.shortType}) : 0;`,
		sendFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, sizeof(${p.shortType}));`,
		recvFuncLoc: p => `${p.shortType} _${p.name}_data;\n${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_decode_buffer(_value, &_${p.name}_data, sizeof(${p.shortType}));`,
		recvFuncPar: p => `${p.name}`,
	},
	'out RS[]': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(${p.getArraySize()} * sizeof(${p.shortType}));`,
		rspFuncDec: p => `ser_decode_buffer(_value, _res->${p.name}, ${p.getArraySize('(_res->$)')} * sizeof(${p.shortType}));`,
		resStructField: p => `${p.type} ${p.name};`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncOutDec: p => `${p.name} = ser_scratchpad_get(${p.getArraySize()} * sizeof(${p.shortType}));`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => 5,
		recvFuncCalc: p => `_buffer_size_max += ${p.getArraySize()} * sizeof(${p.shortType});`,
		recvFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, ${p.getArraySize()} * sizeof(${p.shortType}));`,
	},
	'inout RS*?': 'inout RS*',
	'inout RS*': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		rspFuncDec: p => `ser_decode_buffer(_value, _res->${p.name}, sizeof(${p.shortType}));`,
		resStructField: p => `${p.type} ${p.name};`,
		sendFuncBufMax: p => 3,
		sendFuncCalc: p => `_buffer_size_max += ${p.name} ? sizeof(${p.shortType}) : 0;`,
		sendFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, sizeof(${p.shortType}));`,
		recvFuncLoc: p => `${p.shortType} _${p.name}_data;\n${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_decode_buffer(_value, &_${p.name}_data, sizeof(${p.shortType}));`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => 3,
		recvFuncCalc: p => `_buffer_size_max += ${p.name} ? sizeof(${p.shortType}) : 0;`,
		recvFuncEnc: p => `ser_encode_buffer(&_ctx.encoder, ${p.name}, sizeof(${p.shortType}));`,
	},
	'in S*': {
		sendFuncBufMax: p => p.encoder.bufferConst ? parseInt(p.encoder.bufferConst) : 0,
		sendFuncCalc: p => p.encoder.bufSizeFunc ? `_buffer_size_max += ${p.encoder.bufSizeFunc.name}(${p.name});` : '',
		scratchpad: p => p.encoder.spSizeFunc ? `_scratchpad_size += ${p.encoder.spSizeFunc.name}(${p.name});` : '',
		sendFuncEnc: p => `${p.encoder.encFunc.name}(&_ctx.encoder, ${p.name});`,
		recvFuncLoc: p => `${p.shortType} ${p.name};`,
		recvFuncDec: p => !p.encoder.decFunc ? REGEN_WARNING : `${p.encoder.decFunc.name}(${p.encoder.spSizeFunc ? '&_scratchpad' : '_value'}, &${p.name});`,
		recvFuncPar: p => `&${p.name}`,
	},
	'out S*': {
		sendFuncAssign: p => `_result.${p.name} = ${p.name};`,
		resStructField: p => `${p.type} ${p.name};`,
		rspFuncDec: p => !p.decoder.decFunc ? REGEN_WARNING : `${p.decoder.decFunc.name}(${p.decoder.spSizeFunc ? '&_scratchpad' : '_value'}, _res->${p.name});`,
		recvFuncLoc: p => `${p.shortType} _${p.name}_data;\n${p.type} ${p.name} = &_${p.name}_data;`,
		recvFuncPar: p => `${p.name}`,
		recvFuncBufMax: p => p.decoder.bufferConst ? parseInt(p.decoder.bufferConst) : 0,
		recvFuncCalc: p => p.decoder.bufSizeFunc ? `_buffer_size_max += ${p.decoder.bufSizeFunc.name}(${p.name});` : '',
		recvFuncEnc: p => `${p.decoder.encFunc.name}(&_ctx.encoder, ${p.name});`,
	},
	'in S[]': {
		sendFuncCalc: p => {
			if (p.encoder.bufSizeFunc || p.encoder.spSizeFunc) {
				let r = `for ($_i = 0; _i < ${p.getArraySize()}; _i++) {\n`;
				if (p.encoder.bufSizeFunc) {
					r += `@_buffer_size_max += ${p.encoder.bufSizeFunc.name}(&${p.name}[_i]);\n`;
				}
				if (p.encoder.spSizeFunc) {
					r += `@_scratchpad_size += SCRATCHPAD_ALIGN(sizeof(${p.shortType}));\n`;
					r += `@_scratchpad_size += ${p.encoder.spSizeFunc.name}(&${p.name}[_i]);\n`;
				}
				return r + '}';
			} else if (p.encoder.bufferConst) {
				return `_buffer_size_max += ${p.getArraySize()} * ${p.encoder.bufferConst};`;
			} else {
				return '';
			}
		},
		scratchpad: p => p.encoder.spSizeFunc ? `@` : '',
		sendFuncEnc: p => `for (_i = 0; _i < ${p.getArraySize()}; _i++) {
				   @	${p.encoder.encFunc.name}(&_ctx.encoder, &${p.name}[_i]);
				   }`,
		recvFuncLoc: p => `${p.type} ${p.name};`,
		recvFuncDec: p => `${p.name} = ser_scratchpad_get(&_scratchpad, ${p.getArraySize()} * sizeof(${p.shortType}));
				   if (${p.name} == NULL) {
				   @	goto decoding_error;
				   }
				   for ($_i = 0; _i < ${p.getArraySize()}; _i++) {
				   @	${p.encoder.decFunc.name}(&_scratchpad, &${p.name}[_i]);
				   }`,
		recvFuncPar: p => `${p.name}`,
	},
	'in CS': {
		sendFuncBufMax: p => 3,
		sendFuncEnc: p => `ser_encode_callback_slot(&_ctx.encoder, ${p.name});`,
		recvFuncLoc: p => `${p.base.callbackType} ${p.name};`,
		recvFuncDec: p => `${p.name} = (${p.base.callbackType})ser_decode_callback_slot(_value);`,
	},
};



let fieldTemplates = {
	'T': {
		encBufMax: p => p.basicType.bufferSize,
		encFunc: p => `${p.encoderName}(_encoder, _data->${p.name});`,
		decFunc: p => `_data->${p.name} = ${p.decoderName}(_value);`,
	},
	'O*': {
		encBufMax: p => 5,
		encFunc: p => `ser_encode_uint(_encoder, (uintptr_t)_data->${p.name});`,
		decFunc: p => `_data->${p.name} = (${p.type})(uintptr_t)ser_decoder_uint(_value);`,
	},
	'RS*?': 'RS*',
	'RS*': {
		encBufMax: p => p.isNullable ? 1 : 3,
		encCalc: p => `_buffer_size_max += ${p.isNullable ? `!_data->${p.name} ? 0 : 2 + ` : ''}sizeof(${p.shortType});`,
		scratchpad: p => `_scratchpad_size += ${p.isNullable ? `!_data->${p.name} ? 0 : ` : ''}SCRATCHPAD_ALIGN(sizeof(${p.shortType}));`,
		encFunc: p => `ser_encode_buffer(_encoder, &_data->${p.name}, sizeof(${p.shortType}));`,
		decFunc: p => `_data->${p.name} = ser_decode_buffer_sp(_scratchpad);`,
	},
	'in S*': {
		sendFuncBufMax: p => p.encoder.bufferConst ? parseInt(p.encoder.bufferConst) : 0,
		sendFuncCalc: p => p.encoder.bufSizeFunc ? `_buffer_size_max += ${p.encoder.bufSizeFunc.name}(${p.name});` : '',
		scratchpad: p => p.encoder.spSizeFunc ? `_scratchpad_size += ${p.encoder.spSizeFunc.name}(${p.name});` : '',
		sendFuncEnc: p => `${p.encoder.encFunc.name}(&_ctx.encoder, ${p.name});`,
		recvFuncLoc: p => `${p.shortType} ${p.name};`,
		recvFuncDec: p => !p.encoder.decFunc ? REGEN_WARNING : `${p.encoder.decFunc.name}(${p.encoder.spSizeFunc ? '&_scratchpad' : '_value'}, &${p.name});`,
		recvFuncPar: p => `&${p.name}`,
	},
	'T[]': {
		encBufMax: p => 5,
		encCalc: p => `_buffer_size_max += ${p.basicType.sizeOf} * ${p.getArraySize('_data->$')};`,
		scratchpad: p => `_scratchpad_size += SCRATCHPAD_ALIGN(${p.basicType.sizeOf} * ${p.getArraySize('_data->$')});`,
		encFunc: p => `ser_encode_buffer(_encoder, _data->${p.name}, ${p.basicType.sizeOf} * ${p.getArraySize('_data->$')});`,
		decFunc: p => `_data->${p.name} = ser_decode_buffer_sp(_scratchpad);`,
	},
	'T[#]': {
		encBufMax: p => 5,
		encCalc: p => `_buffer_size_max += ${p.constantSizeArray} * ${p.basicType.sizeOf};`,
		encFunc: p => `ser_encode_buffer(_encoder, _data->${p.name}, ${p.constantSizeArray} * ${p.basicType.sizeOf});`,
		decFunc: p => `ser_decode_buffer(_value, _data->${p.name}, ${p.constantSizeArray} * ${p.basicType.sizeOf});`,
	},
	'RS': {
		encBufMax: p => 3,
		encCalc: p => `_buffer_size_max += sizeof(${p.type});`,
		encFunc: p => `ser_encode_buffer(_encoder, &_data->${p.name}, sizeof(${p.type}));`,
		decFunc: p => `ser_decode_buffer(_value, &_data->${p.type}, sizeof(${p.type}));`,
	},
	'CBK': {
		encBufMax: p => 5,
		encFunc: p => `ser_encode_callback(&_ctx.encoder, _data->${p.name});`,
		decFunc: p => `_data->${p.name} = (${p.type})ser_decode_callback(_value, ${p.type}_encoder);`,
	}
};


function getBasicType(type) {

	if (type in platformIntTypes) {
		let info = platformIntTypes[type];
		return {
			sizeOf: `sizeof(${type})`,
			bufferSize: 1 + info.bytes,
			encoderName: info.signed ? 'ser_encode_int' : 'ser_encode_uint',
			decoderName: info.signed ? 'ser_decode_int' : 'ser_decode_uint',
		}
	} else if (type == 'bool') {
		return {
			sizeOf: 'sizeof(bool)',
			bufferSize: 1,
			encoderName: 'ser_encode_bool',
			decoderName: 'ser_decode_bool',
		}
	} else if (type == 'float') {
		return {
			sizeOf: 'sizeof(float)',
			bufferSize: 5,
			encoderName: 'ser_encode_float',
			decoderName: 'ser_decode_float',
		}
	} else if (type == 'double') {
		return {
			sizeOf: 'sizeof(float)',
			bufferSize: 9,
			encoderName: 'ser_encode_double',
			decoderName: 'ser_decode_double',
		}
	}

	return null;
}


class Param {

	constructor(gen, info, isField) {

		this.gen = gen;
		this.base = gen.base;
		this.ptrCount = 0;
		this.name = info.name;
		this.type = info.type;
		this.dir = info.dir;
		this.isString = info.isString;
		this.isArray = info.isArray;
		this.sizePattern = info.sizePattern;
		this.sizeParam = info.sizeParam;
		this.isSize = info.isSize;
		this.arrays = info.arrays;
		this.isReturn = info.isReturn;
		this.isNullable = info.isNullable;
		this.callOrder = info.callOrder;
		this.isCallback = false;
		this.basicType = null;

		let base = this.base;

		this.shortType = removeTypeQualifiers(this.type);

		while (this.shortType.endsWith('*')) {
			this.shortType = this.shortType
				.substr(0, this.shortType.length - 1)
				.trim();
			this.ptrCount++;
		}

		let m;

		if ((m = this.shortType.match(/\s*\[([0-9]*)\]$/))) {
			this.shortType = this.shortType.substr(0, this.shortType.length - m[0].length);
			this.constantSizeArray = parseInt(m[1]);
			if (this.isArray) {
				throw Error(`Field '${this.name}' is constant size array, so SIZE() annotation is not expected in function '${base.name}'.`);
			}
		}

		let templName = '';

		if (!isField) {
			if (this.isReturn) {
				templName = 'ret ';
			} else if (this.dir == Units.IN) {
				templName = 'in ';
			} else if (this.dir == Units.OUT) {
				templName = 'out ';
			} else {
				templName = 'inout ';
			}
		}


		if (this.isString) {
			templName += 'STR';
			if (this.ptrCount == 0 || !(this.shortType in platformIntTypes) || platformIntTypes[this.shortType].bytes != 1) {
				throw Error(`Parameter '${this.name}' cannot be a string in functions '${base.name}'.`);
			}
			if (!this.isArray) {
				this.ptrCount--;
			}
		} else {
			this.basicType = getBasicType(this.shortType);
			if (this.basicType) {
				templName += 'T';
				this.encoderName = this.basicType.encoderName;
				this.decoderName = this.basicType.decoderName;
			} else {
				this.isCallback = base.module.isCallback(this.shortType);
				if (this.isCallback) {
					templName += 'CBK';
				} else if (base.module.isRawStruct(this.shortType)) { // TODO: rename shortType to baseType
					templName += 'RS';
				} else if (base.module.isOpaqueStruct(this.shortType)) { // TODO: rename shortType to baseType
					templName += 'O';
				} else if (base.isCallback && this.shortType == 'ser_callback_slot_t') {
					templName += 'CS';
				} else {
					// TODO: if (!base.module.isStruct(type)) throw
					templName += 'S';
					if (this.dir == Units.IN || this.dir == Units.INOUT) {
						this.encoder = this.base.module.findStructCodec(this.shortType, base, info);
					}
					if (this.dir == Units.INOUT || this.dir == Units.OUT) {
						this.decoder = this.base.module.findStructCodec(this.shortType, base, info, true);
					}
				}
			}
		}

		if (this.constantSizeArray) {
			templName += '[#]';
		} else if (this.isArray) {
			if (this.ptrCount == 0) {
				throw Error(`Parameter '${this.name}' cannot be an array in function '${base.name}'.`);
			}
			templName += '*'.repeat(this.ptrCount - 1) + '[]';
		} else {
			templName += '*'.repeat(this.ptrCount);
		}

		if (this.isNullable) {
			templName += '?';
		}

		let templates = isField ? fieldTemplates : paramTemplates;

		do {
			if (!(templName in templates)) {
				throw Error(`No template for '${templName}' (generated from ${this.type}) in function '${base.name}'.`);
			}
			this.templ = templates[templName];
			templName = this.templ;
		} while (typeof (templName) == 'string');
	}

	_generateBlock(blocks, codeBlock, templField) {

		if (templField in this.templ) {
			let code = this.templ[templField](this);
			if (typeof (blocks[codeBlock]) == 'number') {
				blocks[codeBlock] += code;
			} else if (code.length > 0) {
				blocks[codeBlock] = (blocks[codeBlock] || '') + code + '\n';
			}
		}
	}

	generateCliSendFunc(blocks) {

		this._generateBlock(blocks, CodeBlocks.LOCALS, 'sendFuncLoc');
		this._generateBlock(blocks, CodeBlocks.ENCODE, 'sendFuncEnc');
		this._generateBlock(blocks, CodeBlocks.CALC, 'sendFuncCalc');
		this._generateBlock(blocks, CodeBlocks.SCRATCHPAD_CALC, 'scratchpad');
		this._generateBlock(blocks, CodeBlocks.ASSIGN, 'sendFuncAssign');
		this._generateBlock(blocks, CodeBlocks.RETURN, 'sendFuncReturn');
		this._generateBlock(blocks, CodeBlocks.BUFFER_MAX, 'sendFuncBufMax');

	}

	generateCliRspFunc(blocks) {

		this._generateBlock(blocks, CodeBlocks.LOCALS, 'rspFuncLoc');
		this._generateBlock(blocks, CodeBlocks.DECODE_RES, 'rspFuncDec');

	}

	generateCliResStruct(blocks) {

		this._generateBlock(blocks, CodeBlocks.FIELDS, 'resStructField');

	}

	generateHostRecvFunc(blocks) {

		this._generateBlock(blocks, CodeBlocks.LOCALS, 'recvFuncLoc');
		this._generateBlock(blocks, CodeBlocks.DECODE, 'recvFuncDec');
		this._generateBlock(blocks, CodeBlocks.ENCODE_RES, 'recvFuncEnc');
		this._generateBlock(blocks, CodeBlocks.OUTPUT_ALLOC, 'recvFuncOutDec');
		this._generateBlock(blocks, CodeBlocks.CALC, 'recvFuncCalc');
		this._generateBlock(blocks, CodeBlocks.BUFFER_MAX, 'recvFuncBufMax');
		this._generateBlock(blocks, CodeBlocks.SCRATCHPAD_CALC, 'scratchpad');

	}

	generateEncFunc(blocks) {

		this._generateBlock(blocks, CodeBlocks.ENCODE, 'encFunc');

	}

	generateBufSizeConst(blocks) {

		this._generateBlock(blocks, CodeBlocks.BUFFER_MAX, 'encBufMax');

	}

	generateEncCalc(blocks) {

		this._generateBlock(blocks, CodeBlocks.CALC, 'encCalc');

	}

	generateSpCalc(blocks) {

		this._generateBlock(blocks, CodeBlocks.SCRATCHPAD_CALC, 'scratchpad');

	}

	generateDecFunc(blocks) {

		this._generateBlock(blocks, CodeBlocks.DECODE, 'decFunc');

	}

	getBufferSize() {
		if (this.basicType) {
			return this.basicType.bufferSize;
		} else if (this.isString || this.isCallback) {
			return 5;
		}
	}

	getArraySize(innerPattern) {
		if (innerPattern) {
			return this.sizePattern.replace('$', innerPattern.replace('$', this.sizeParam));
		} else {
			return this.sizePattern.replace('$', this.sizeParam);
		}
	}

	isSizeForOutput() {
		if (!this.isSize) {
			return false;
		}

		for (let arr of this.arrays) {
			if (this.gen.base.params[arr].dir != Units.IN) {
				return true;
			}
		}

		return false;
	}
}

class GenFunc {

	constructor(base) {

		this.base = base;
		this.params = [];

		for (let name in base.params) {
			let param = base.params[name];
			this.params.push(new Param(this, param));
		}
	}

	_getPredefinedResponseHandler() {
		let base = this.base;

		if (base.customResponse) {
			return null;
		}

		let num = 0;
		for (let name in base.params) {
			if (name != '_result' && base.params[name].dir != Units.IN) {
				num++;
			}
		}
		if (num > 0) {
			return null;
		}

		if (!base.params._result) {
			return ['ser_rsp_simple_void', 'ser_rsp_send_void'];
		}

		let type = base.params._result.type;

		if (type in predefinedResponseHandlers) {
			return predefinedResponseHandlers[type];
		}

		let info = platformIntTypes[type];

		if (info) {
			return predefinedResponseHandlers[info.stdint];
		}

		return null;
	}

	generateCliSendFunc(func) {
		let base = this.base;

		let blocks = { [CodeBlocks.BUFFER_MAX]: 0 };

		let rsp = this._getPredefinedResponseHandler(base);

		let params;
		if (rsp) {
			params = this.params.filter(param => !param.isReturn)
		} else {
			params = this.params;
		}

		//TODO: Generate CodeBlocks.HEADER if function declared, but not defined.

		blocks[CodeBlocks.LOCALS] = `
			struct nrf_rpc_cbor_ctx _ctx;
		`;

		for (let param of params) {
			param.generateCliSendFunc(blocks);
		}

		blocks[CodeBlocks.ALLOCATE] = `
			NRF_RPC_CBOR_ALLOC(_ctx, _buffer_size_max);
		`;

		if (base.isInlineResponse) {
			throw new Error('Not implemented!')
		} else if (base.isEvent) {
			base.responseHandlerGenerate = false;
			blocks[CodeBlocks.SEND] = `
				nrf_rpc_cbor_evt_no_err(&${base.getGroup()},
				@	${base.getId()}, &_ctx);
			`;
		} else {
			if (rsp) {
				base.responseHandlerGenerate = false;
				blocks[CodeBlocks.SEND] = `
					nrf_rpc_cbor_cmd_no_err(&${base.getGroup()}, ${base.getId()},
					@	&_ctx, ${rsp[0]}, ${base.params._result ? '&_result' : 'NULL'});
				`;
				if (base.params._result) {
					blocks[CodeBlocks.LOCALS] += `${base.params._result.type} _result;\n`;
					blocks[CodeBlocks.RETURN] = `return _result;\n`;
				}
			} else {
				blocks[CodeBlocks.SEND] = `
					nrf_rpc_cbor_cmd_no_err(&${base.getGroup()}, ${base.getId()},
					@	&_ctx, ${base.name}${Units.RSP_FUNC_POSTFIX}, &_result);
				`;
				blocks[CodeBlocks.LOCALS] += `struct ${base.name}${Units.RES_STRUCT_POSTFIX} _result;\n`;
			}
		}

		if (blocks[CodeBlocks.SCRATCHPAD_CALC] && blocks[CodeBlocks.SCRATCHPAD_CALC].trim() != '') {
			blocks[CodeBlocks.LOCALS] += 'size_t _scratchpad_size = 0;\n';
			blocks[CodeBlocks.BUFFER_MAX] += 5;
			blocks[CodeBlocks.ALLOCATE] += `
				ser_encode_uint(&_ctx.encoder, _scratchpad_size);
			`;
		}

		blocks[CodeBlocks.LOCALS] += `
			size_t _buffer_size_max = ${blocks[CodeBlocks.BUFFER_MAX]};
		`;
		delete blocks[CodeBlocks.BUFFER_MAX];

		this._addLoopIndex(blocks);

		let blockOrder = [
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.CALC,
			CodeBlocks.SCRATCHPAD_CALC,
			CodeBlocks.ALLOCATE,
			CodeBlocks.ENCODE,
			CodeBlocks.ASSIGN,
			CodeBlocks.SEND,
			CodeBlocks.RETURN,
		];

		func.regenerate(blocks, blockOrder, false);
	}


	_addLoopIndex(blocks) {
		let addIndex = false;

		for (let n in blocks) {
			blocks[n] = blocks[n].replace(/\$_i/g, () => { addIndex = true; return '_i'; });
		}

		if (addIndex) {
			blocks[CodeBlocks.LOCALS] += 'size_t _i;\n';
		}
	}


	generateCliRspFunc(func) {
		let base = this.base;

		let blocks = {};

		blocks[CodeBlocks.HEADER] = `
			\\static void ${base.name}${Units.RSP_FUNC_POSTFIX}(CborValue *_value, void *_handler_data)
			\\{
		`;

		blocks[CodeBlocks.LOCALS] = `
			struct entropy_get_result *_res =
			@	(struct ${base.name}${Units.RES_STRUCT_POSTFIX} *)_handler_data;
		`;

		for (let param of this.params) {
			param.generateCliRspFunc(blocks);
		}

		blocks[CodeBlocks.FOOTER] = `
			\\}
		`;

		this._addLoopIndex(blocks);

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.DECODE_RES,
			CodeBlocks.FOOTER,
		];

		func.regenerate(blocks, blockOrder, true); // TODO: remove withHeaders: do it based on CodeBlocks.HEADER existence
	}

	generateCliResStruct(func) {
		let base = this.base;

		let blocks = {};

		blocks[CodeBlocks.HEADER] = `
			\\struct ${base.name}${Units.RES_STRUCT_POSTFIX}
			\\{
		`;

		for (let param of this.params) {
			param.generateCliResStruct(blocks);
		}

		blocks[CodeBlocks.FOOTER] = `
			\\};
		`;

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.FIELDS,
			CodeBlocks.FOOTER,
		];

		func.regenerate(blocks, blockOrder, true);
	}

	generateHostRecvFunc(func) {
		let base = this.base;

		let blocks = { [CodeBlocks.BUFFER_MAX]: 0 };

		let rsp = this._getPredefinedResponseHandler(base);

		let params;
		if (rsp) {
			params = this.params.filter(param => !param.isReturn)
		} else {
			params = this.params;
		}

		blocks[CodeBlocks.HEADER] = `
			\\static void ${base.name}${Units.RECV_FUNC_POSTFIX}(CborValue *_value, void *_handler_data)
			\\{
		`;


		blocks[CodeBlocks.LOCALS] = '';

		if (!rsp) {
			blocks[CodeBlocks.LOCALS] += `
				struct nrf_rpc_cbor_ctx _ctx;
			`;
		}

		for (let param of params) {
			param.generateHostRecvFunc(blocks);
		}

		if (!rsp) {
			blocks[CodeBlocks.LOCALS] += `
				size_t _buffer_size_max = ${blocks[CodeBlocks.BUFFER_MAX]};
			`;
		} else if (base.params._result) {
			blocks[CodeBlocks.LOCALS] += `
				${base.params._result.type} _result;
			`;
		}
		delete blocks[CodeBlocks.BUFFER_MAX];

		if (blocks[CodeBlocks.SCRATCHPAD_CALC] && blocks[CodeBlocks.SCRATCHPAD_CALC].trim() != '') {
			delete blocks[CodeBlocks.SCRATCHPAD_CALC];
			blocks[CodeBlocks.LOCALS] += `
				struct ser_scratchpad _scratchpad;
			`;
			blocks[CodeBlocks.SCRATCHPAD_ALLOC] = `
				SER_SCRATCHPAD_ALLOC(&_scratchpad, _value);
			`;
		}


		if (CodeBlocks.DECODE in blocks && blocks[CodeBlocks.DECODE].length > 0) {
			blocks[CodeBlocks.DECODE_DONE] = `
				if (!ser_decoding_done_and_check(_value)) {
				@	goto decoding_error;
				}
			`;
		} else {
			blocks[CodeBlocks.DECODE_DONE] = `
				nrf_rpc_cbor_decoding_done(_value);
			`;
		}

		let paramNames = [];
		for (let p of this.params.filter(p => p.callOrder >= 0).sort((a, b) => a.callOrder - b.callOrder)) {
			if (p.name != '_result' && 'recvFuncPar' in p.templ) {
				paramNames.push(p.templ.recvFuncPar(p));
			}
		}

		if (base.isCallback) {
			blocks[CodeBlocks.EXECUTE] = `
				${base.params._result ? '_result =' : ''} callback_slot(${paramNames.join(', ')});
			`;
		} else {
			blocks[CodeBlocks.EXECUTE] = `
				${base.params._result ? '_result =' : ''} ${base.name}(${paramNames.join(', ')});
			`;
		}

		if (base.isEvent) {
			// Do not generate response
		} else if (!rsp) {
			blocks[CodeBlocks.ALLOCATE] = `
				NRF_RPC_CBOR_ALLOC(_ctx, _buffer_size_max);
			`;

			blocks[CodeBlocks.SEND] = `
				nrf_rpc_cbor_rsp_no_err(&_ctx);
			`;
		} else if (base.params._result) {
			blocks[CodeBlocks.SEND] = `
				${rsp[1]}(_result);
			`;
		} else {
			blocks[CodeBlocks.SEND] = `
				${rsp[1]}();
			`;
		}

		blocks[CodeBlocks.FOOTER] = '';

		if (Object.values(blocks).some(t => t.indexOf('goto decoding_done_and_error') >= 0)) {
			blocks[CodeBlocks.FOOTER] += `
				return;
				\\decoding_done_and_error:
				nrf_rpc_cbor_decoding_done(_value);
				\\decoding_error:
				report_decoding_error(${base.getId()}, _handler_data);
			`;
		} else if (Object.values(blocks).some(t => t.indexOf('goto decoding_error') >= 0)) {
			blocks[CodeBlocks.FOOTER] += `
				return;
				\\decoding_error:
				report_decoding_error(${base.getId()}, _handler_data);
			`;
		}

		if (blocks[CodeBlocks.SCRATCHPAD_ALLOC]) {
			blocks[CodeBlocks.SCRATCHPAD_FREE] = `
				SER_SCRATCHPAD_FREE(&_scratchpad);
			`;
			blocks[CodeBlocks.FOOTER] += `
				SER_SCRATCHPAD_FREE(&_scratchpad);
			`;
		}

		blocks[CodeBlocks.FOOTER] += `
			\\}
		`;

		this._addLoopIndex(blocks);

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.SCRATCHPAD_ALLOC,
			CodeBlocks.DECODE,
			CodeBlocks.DECODE_DONE,
			CodeBlocks.OUTPUT_ALLOC,
			CodeBlocks.EXECUTE,
			CodeBlocks.CALC,
			CodeBlocks.ALLOCATE,
			CodeBlocks.ENCODE_RES,
			CodeBlocks.SCRATCHPAD_FREE,
			CodeBlocks.SEND,
			CodeBlocks.FOOTER,
		];

		func.regenerate(blocks, blockOrder, true);
	}

	generateRegMacro(macro) {
		let base = this.base;

		let blocks = {
			[CodeBlocks.HEADER]: `
				\\NRF_RPC_CBOR_CMD_DECODER(${base.getGroup()}, ${base.name}, ${base.getId()},
				${base.name}${Units.RECV_FUNC_POSTFIX}, NULL);
		`};

		let blockOrder = [
			CodeBlocks.HEADER,
		];

		macro.regenerate(blocks, blockOrder, true);
	}

};


class GenStruct {

	constructor(base) {

		this.base = base;
		this.fields = [];

		for (let name in base.fields) {
			let field = base.fields[name];
			this.fields.push(new Param(this, field, true));
		}
	}

	generateEncFunc(func) {
		let base = this.base;
		let fields = this.fields;

		let blocks = { [CodeBlocks.BUFFER_MAX]: 0 };

		blocks[CodeBlocks.HEADER] = `
			\\void ${base.name}${Units.STRUCT_ENCODE_POSTFIX}(CborEncoder *_encoder, ${base.type} *_data)
			\\{
		`;

		for (let field of fields) {
			field.generateEncFunc(blocks);
		}

		if (blocks[CodeBlocks.BUFFER_MAX]) {
			blocks[CodeBlocks.ANNOTATION] = `
				SERIALIZE(STRUCT_BUFFER_CONST(${blocks[CodeBlocks.BUFFER_MAX]}));
			`;
		}
		delete blocks[CodeBlocks.BUFFER_MAX];


		blocks[CodeBlocks.FOOTER] = `
			\\}
		`;

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.ANNOTATION,
			CodeBlocks.ENCODE,
			CodeBlocks.FOOTER,
		];

		func.regenerate(blocks, blockOrder, true);
	}

	generateBufSizeFunc(func) {

		let base = this.base;
		let fields = this.fields;

		let blocks = {};

		blocks[CodeBlocks.HEADER] = `
			\\size_t ${base.name}${Units.STRUCT_BUFFER_SIZE_POSTFIX}(${base.type} *_data)
			\\{
		`;

		blocks[CodeBlocks.LOCALS] = `
			size_t _buffer_size_max = 0;
		`;

		for (let field of fields) {
			field.generateEncCalc(blocks);
		}

		blocks[CodeBlocks.RETURN] = `
			return _buffer_size_max;
		`;

		blocks[CodeBlocks.FOOTER] = `
			\\}
		`;

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.CALC,
			CodeBlocks.RETURN,
			CodeBlocks.FOOTER,
		];

		if (blocks[CodeBlocks.CALC]) {
			func.regenerate(blocks, blockOrder, true);
		} else {
			func.regenerate({}, [], true);
		}
	}

	generateBufSizeConst(macro) {
		let base = this.base;
		let fields = this.fields;

		let blocks = { [CodeBlocks.BUFFER_MAX]: 0 };

		for (let field of fields) {
			field.generateBufSizeConst(blocks);
		}

		if (blocks[CodeBlocks.BUFFER_MAX]) {
			blocks = { [CodeBlocks.HEADER]: `\\SERIALIZE(STRUCT_BUFFER_CONST(${base.name}, ${blocks[CodeBlocks.BUFFER_MAX]}));\n` };
			let blockOrder = [CodeBlocks.HEADER];
			macro.regenerate(blocks, blockOrder, true);
		} else {
			macro.regenerate({}, [], true);
		}
	}

	generateSpSizeFunc(func) {

		let base = this.base;
		let fields = this.fields;

		let blocks = {};

		blocks[CodeBlocks.HEADER] = `
			\\size_t ${base.name}${Units.STRUCT_SCRATCHPAD_SIZE_POSTFIX}(${base.type} *_data)
			\\{
		`;

		blocks[CodeBlocks.LOCALS] = `
			size_t _scratchpad_size = 0;
		`;

		for (let field of fields) {
			field.generateSpCalc(blocks);
		}

		blocks[CodeBlocks.RETURN] = `
			return _scratchpad_size;
		`;

		blocks[CodeBlocks.FOOTER] = `
			\\}
		`;

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.SCRATCHPAD_CALC,
			CodeBlocks.RETURN,
			CodeBlocks.FOOTER,
		];

		if (blocks[CodeBlocks.SCRATCHPAD_CALC]) {
			this.scratchpadUsed = true;
			func.regenerate(blocks, blockOrder, true);
		} else {
			this.scratchpadUsed = false;
			func.regenerate({}, [], true);
		}
	}

	generateDecFunc(func) {
		let base = this.base;
		let fields = this.fields;

		let blocks = {};

		if (typeof (this.scratchpadUsed) != 'boolean') {
			throw Error('Internal: Scratchpad calculation should be generated before decode function.');
		}

		if (this.scratchpadUsed) {
			blocks[CodeBlocks.HEADER] = `
				\\void ${base.name}${Units.STRUCT_DECODE_POSTFIX}(struct ser_scratchpad *_scratchpad, ${base.type} *_data)
				\\{
			`;
			blocks[CodeBlocks.LOCALS] = `
				CborValue *_value = _scratchpad->value;
			`;
		} else {
			blocks[CodeBlocks.HEADER] = `
				\\void ${base.name}${Units.STRUCT_DECODE_POSTFIX}(CborValue *_value, ${base.type} *_data)
				\\{
			`;
		}

		for (let field of fields) {
			field.generateDecFunc(blocks);
		}

		blocks[CodeBlocks.FOOTER] = `
			\\}
		`;

		let blockOrder = [
			CodeBlocks.HEADER,
			CodeBlocks.BEGIN,
			CodeBlocks.LOCALS,
			CodeBlocks.DECODE,
			CodeBlocks.FOOTER,
		];

		func.regenerate(blocks, blockOrder, true);
	}



};


exports.GenFunc = GenFunc;
exports.GenStruct = GenStruct;
