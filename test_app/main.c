

#include "crypto.h"


int main() {
    static uint8_t data[16] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    static uint8_t key[16] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    aes128_ecb_encrypt_in_place(data, key);
    return data[0];
}
