#ifndef __HEAP_H
#define __HEAP_H

#include <config.h>

#define CONFIG_MODULE_HEAP TRUE

void *malloc(size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);

/** @brief Heap memory size */
#ifndef CONFIG_HEAP_SIZE
#define CONFIG_HEAP_SIZE 4 * 1024
#endif

ENSURE_CONFIG(CONFIG_HEAP_SIZE >= 1024, "Minimum heap size is 1024 bytes.");
ENSURE_CONFIG(CONFIG_HEAP_SIZE % 8 == 0, "Heap size must be aligned to 8 bytes.");


#endif // __HEAP_H


// config --load path/to/sdk/config_args.txt --source './**/*.c' -I. -DNRF54H20 -DBOARD_PCA10156 -DWITH_PPR


/*

COMMON:
    - load: path/to/sdk/config_args.txt
    - define: NRF54H20 BOARD_PCA10156

RAD:
    - load: path/to/sdk/images/ipc_radio/config_args.txt

PPR:
    - if: defined(WITH_PPR)
    - source: src/ppr/main.c

APP:
    - source: src/app/main.c
    - prebuild: RAD PPR


*/