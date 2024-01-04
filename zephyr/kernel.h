#ifndef ZEPHYR_KERNEL_H
#define ZEPHYR_KERNEL_H

#include <atomic>

#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include <zephyr/configs.h>


#define _XXXX1 _YYYY,
#define Z_IS_ENABLED3(ignore_this, val, ...) val
#define Z_IS_ENABLED2(one_or_two_args) Z_IS_ENABLED3(one_or_two_args 1, 0)
#define Z_IS_ENABLED1(config_macro) Z_IS_ENABLED2(_XXXX##config_macro)
#define IS_ENABLED(config_macro) Z_IS_ENABLED1(config_macro)

#define __sync_synchronize() "Do not use it. Use barrier_dmem_fence_full."()

static inline void barrier_dmem_fence_full() {
	std::atomic_thread_fence(std::memory_order_seq_cst);
}

int sys_cache_data_flush_range(void *addr, size_t size);
int sys_cache_data_invd_range(void *addr, size_t size);

#define __ASSERT(cond, text) do { if (!(cond)) { fprintf(stderr, "ASSERT: %s\n", text); exit(50); } } while (false)
#define __ASSERT_NO_MSG(cond) __ASSERT((cond), #cond)

// Emulation specific functions

void* EMU_get_shared_memory();

#endif
