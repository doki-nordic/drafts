
#ifndef SERIALIZE
#define SERIALIZE(...)
#endif

#if !SERIALIZATION_DECODERS

struct Attr {
	char name[16];
	UUID id;
	int value;
	char* descr;
};

SERIALIZE(TYPE_CODERS(Attr, gatt_attr_encode, gatt_attr_decode));

/* Autogenerated: function      sjO */
int func(int x, int *buf[])
{
	#error This function was removed from the serialization interface, \
		but it contains a user code. Make sure that it is no longer \
		needed and delete it manually.
	SERIALIZE(OUT(buf));
	SERIALIZE(ARRAY_SIZE_CONST(buf, BUF_SIZE));
	SERIALIZE(ENC_BUF_SIZE(12))
	SERIALIZE(ENC_BUF_SIZE_ADJUST(-1))
	//SERIALIZE(ONE_PASS_ENCODING) - to force one pass: by default when buffer size is unpredictable two pass is generated
	/* Autogenerated: locals */
	int result;
	CborEncoder enc;
	CborParser dec;
	/* Autogenerated: end */

	/* Autogenerated: encode          utD */ // - 6-char hash of autogenerated block content (first 30-bits of e.g. MD5)
	cbor_encode_int(&enc, x);
	/* Autogenerated: end             -0/ */

	/* Autogenerated: send */
	rptrans_send(&enc, &dec);
	/* Autogenerated: end */

	/* Autogenerated: parse */
	result = cbor_get_int(&dec);
	/* Autogenerated: end */

	/* Autogenerated: return */
	return result;
	/* Autogenerated: end */
}
/* Autogenerated: end          /8L */

#else 

void func_decode(CborParser& in, CborEncoder& out)
{

}

#endif
