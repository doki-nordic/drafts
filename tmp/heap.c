
#include <config.h>

#if CONFIG_MODULE_HEAP

#include <common/utils.h>
#include <heap.h>

ENSURE_IN_RANGE(CONFIG_HEAP_SIZE, 512, CONFIG_DEVICE_RAM_SIZE);

#endif // CONFIG_MODULE_HEAP

