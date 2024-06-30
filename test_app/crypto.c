
#include "config.h"

#if CONFIG_MODULE_CRYPTO

#include "heap.h"
#include "crypto.h"

void aes128_ecb_encrypt_in_place(uint8_t *data, uint8_t key[16])
{
    void *temp = malloc(16);
}

#endif // CONFIG_MODULE_CRYPTO
