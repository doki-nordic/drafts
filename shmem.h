#ifndef SHMEM_H
#define SHMEM_H

#include <iostream>
#include <stdint.h>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <atomic>


#define SHMEM_CACHE_SIZE 8


#define ROUND_UP(value, size) (((value) + (size) - 1) / (size) * (size))
#define ROUND_DOWN(value, size) ((value) / (size) * (size))

#define MAX_MEM_SIZE ROUND_UP(1024 * 1024, SHMEM_CACHE_SIZE)

class ShMem;

struct ShMemInstance {
    ShMem* shmem;
    uint8_t* startPtr;
};


class ShMem {
public:
    uint8_t *buffer;
    uint8_t *startPtr;
    uint32_t size;

public:
    ShMem(uint32_t size): size(size) {
        if (size > MAX_MEM_SIZE) {
            std::fprintf(stderr, "Invalid size!\n");
            std::exit(1);
        }
        buffer = new uint8_t[size + 2 * SHMEM_CACHE_SIZE];
        startPtr = (uint8_t*)ROUND_UP((uintptr_t)buffer, SHMEM_CACHE_SIZE);
    }
    ~ShMem() {
        delete[] buffer;
    }

    void* getInstance() {
        auto startPtr = new uint8_t[2 * (MAX_MEM_SIZE + sizeof(ShMemInstance))];
        auto shadowPtr = (uint8_t*)ROUND_UP((uintptr_t)startPtr + sizeof(ShMemInstance), MAX_MEM_SIZE);
        auto instance = ((ShMemInstance*)shadowPtr) - 1;
        instance->startPtr = startPtr;
        instance->shmem = this;
        return shadowPtr;
    }

    static void freeInstance(void* ptr) {
        auto shadowPtr = (uint8_t*)ROUND_DOWN((uintptr_t)ptr, MAX_MEM_SIZE);
        auto instance = ((ShMemInstance*)shadowPtr) - 1;
        delete[] instance->startPtr;
    }

    static void invalidateRange(void* ptr, uint32_t size) {
        auto shadowPtr = (uint8_t*)ROUND_DOWN((uintptr_t)ptr, MAX_MEM_SIZE);
        auto instance = ((ShMemInstance*)shadowPtr) - 1;
        auto shmem = instance->shmem;
        auto startOffset = ROUND_DOWN((uint8_t*)ptr - shadowPtr, SHMEM_CACHE_SIZE);
        auto endOffset = ROUND_UP((uint8_t*)ptr - shadowPtr + size, SHMEM_CACHE_SIZE);
        std::atomic_thread_fence(std::memory_order_seq_cst);
        std::memcpy(shadowPtr + startOffset, shmem->startPtr + startOffset, endOffset - startOffset);
        std::atomic_thread_fence(std::memory_order_seq_cst);
    }

    static void flushRange(void* ptr, uint32_t size) {
        auto shadowPtr = (uint8_t*)ROUND_DOWN((uintptr_t)ptr, MAX_MEM_SIZE);
        auto instance = ((ShMemInstance*)shadowPtr) - 1;
        auto shmem = instance->shmem;
        auto startOffset = ROUND_DOWN((uint8_t*)ptr - shadowPtr, SHMEM_CACHE_SIZE);
        auto endOffset = ROUND_UP((uint8_t*)ptr - shadowPtr + size, SHMEM_CACHE_SIZE);
        std::atomic_thread_fence(std::memory_order_seq_cst);
        std::memcpy(shmem->startPtr + startOffset, shadowPtr + startOffset, endOffset - startOffset);
        std::atomic_thread_fence(std::memory_order_seq_cst);
    }

};

#define TEST(cond) if (!(cond)) { std::fprintf(stderr, "TEST FAILED %s:%d: %s\n", __FILE__, __LINE__, #cond); exit(100); }

static void testShMem() {
    ShMem shmem(MAX_MEM_SIZE);
    uint8_t* core1 = (uint8_t*)shmem.getInstance();
    uint8_t* core2 = (uint8_t*)shmem.getInstance();

    for (int o = 0; o < MAX_MEM_SIZE; o += MAX_MEM_SIZE / 8) {
        std::memcpy(core1 + o, "ABCDEFGHIJ", 10);
        std::memcpy(core2 + o, "JIHGFEDCBA", 10);
        TEST(std::memcmp(core1 + o, "ABCDEFGHIJ", 10) == 0);
        TEST(std::memcmp(core2 + o, "JIHGFEDCBA", 10) == 0);
        ShMem::flushRange(core1 + o, 1);
        ShMem::flushRange(core2 + o + 9, 1);
        TEST(std::memcmp(core1 + o, "ABCDEFGHIJ", 10) == 0);
        TEST(std::memcmp(core2 + o, "JIHGFEDCBA", 10) == 0);
        ShMem::invalidateRange(core1 + o, 8);
        TEST(std::memcmp(core1 + o, "ABCDEFGHIJ", 10) == 0);
        ShMem::invalidateRange(core1 + o + 9, 1);
        TEST(std::memcmp(core1 + o, "ABCDEFGHBA", 10) == 0);
        ShMem::invalidateRange(core2 + o + 8, 100);
        TEST(std::memcmp(core2 + o, "JIHGFEDCBA", 10) == 0);
        ShMem::invalidateRange(core2 + o + 7, 100);
        TEST(std::memcmp(core2 + o, "ABCDEFGHBA", 10) == 0);
    }

    std::cout << "Shared memory emulator test success." << std::endl;
}

#endif
