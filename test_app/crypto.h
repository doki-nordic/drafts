#ifndef _CRYPTO_H
#define _CRYPTO_H

#include "config.h"
#include <stdint.h>

#define CONFIG_MODULE_CRYPTO TRUE

void aes128_ecb_encrypt_in_place(uint8_t *data, uint8_t key[16]);

#endif
