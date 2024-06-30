

#if CONFIG_MODULE_CRYPTO

#include <heap.h>

#define MIN_HEAP_SIZE (8 * 1024)
#define PREFERRED_HEAP_SIZE (16 * 1024)

ENSURE_CONFIG(CONFIG_HEAP_SIZE >= MIN_HEAP_SIZE, "Crypto module requires at least {MIN_HEAP_SIZE} bytes of heap memory.");
PREFER_CONFIG(CONFIG_HEAP_SIZE >= PREFERRED_HEAP_SIZE, "Crypto module prefers at least {PREFERRED_HEAP_SIZE} bytes of heap memory.");

#if CONFIG_X
ENSURE_CONFIG(CONFIG_X == FALSE);
#else
ENSURE_CONFIG(CONFIG_X == TRUE);
#endif

#endif // CONFIG_MODULE_CRYPTO

