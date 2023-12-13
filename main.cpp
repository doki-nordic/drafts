

#include <cstddef>
#include <thread>
#include <vector>
#include <set>
#include <mutex>
#include <condition_variable>

#include "shmem.h"
#include "events.h"


struct tx_write_memory
{
    volatile uint32_t sync_value2;
    volatile uint32_t write_index;
    volatile uint32_t buffer[];
};

struct rx_write_memory
{
    volatile uint32_t sync_value1;
    volatile uint32_t read_index;
};

struct rx_fifo {
    uint32_t sync_value;
    uint32_t read_index;
    uint32_t size_words;
    volatile const struct tx_write_memory* tx_write;
    volatile struct rx_write_memory* rx_write;
};

struct tx_fifo {
    uint32_t sync_value;
    uint32_t write_index;
    uint32_t size_words;
    volatile struct tx_write_memory* tx_write;
    volatile const struct rx_write_memory* rx_write;
};

struct icmsg_instance {
    struct rx_fifo rx;
    struct tx_fifo tx;
    void* tx_event;
    void* rx_event;
};

void reset_rx(struct rx_fifo *rx) {
    ShMem::invalidateRange((void*)rx->tx_write, offsetof(struct tx_write_memory, buffer));
    rx->read_index = rx->tx_write->write_index % rx->size_words;
    rx->rx_write->read_index = rx->read_index;
    ShMem::flushRange((void*)&rx->rx_write->read_index, sizeof(rx->rx_write->read_index));
    rx->sync_value = rx->tx_write->sync_value2;
    rx->rx_write->sync_value1 = rx->sync_value;
    ShMem::flushRange((void*)&rx->rx_write->sync_value1, sizeof(rx->rx_write->sync_value1));
}

void reset_tx(struct tx_fifo *tx) {
    ShMem::invalidateRange((void*)tx->tx_write, offsetof(struct tx_write_memory, buffer));
    ShMem::invalidateRange((void*)tx->rx_write, sizeof(struct rx_write_memory));
    tx->write_index = tx->tx_write->write_index % tx->size_words;
    tx->sync_value = tx->tx_write->sync_value2;
    tx->sync_value++;
    if (tx->sync_value == tx->rx_write->sync_value1) {
        tx->sync_value++;
    }
    tx->tx_write->sync_value2 = tx->sync_value;
    ShMem::flushRange((void*)&tx->tx_write->sync_value2, sizeof(tx->tx_write->sync_value2));
}

void icmsg_callback(void* data) {
    struct icmsg_instance *instance = (struct icmsg_instance *)data;
}


int icmsg_init(struct icmsg_instance *instance, void* tx_buffer, uint32_t tx_size, void* rx_buffer, uint32_t rx_size, void* rx_event, void* tx_event) {

    // Align the buffer to cache line size
    uint8_t* tx_ptr = (uint8_t*)ROUND_UP((uintptr_t)tx_buffer, SHMEM_CACHE_SIZE);
    uint8_t* tx_end = (uint8_t*)ROUND_DOWN((uintptr_t)tx_buffer + tx_size, SHMEM_CACHE_SIZE);
    size_t tx_real_size = tx_end - tx_ptr;
    uint8_t* rx_ptr = (uint8_t*)ROUND_UP((uintptr_t)rx_buffer, SHMEM_CACHE_SIZE);
    uint8_t* rx_end = (uint8_t*)ROUND_DOWN((uintptr_t)rx_buffer + rx_size, SHMEM_CACHE_SIZE);
    size_t rx_real_size = rx_end - rx_ptr;

    // Save events
    instance->rx_event = rx_event;
    instance->tx_event = tx_event;

    // Assign pointers to TX buffer parameter
    instance->rx.rx_write = (struct rx_write_memory*)tx_ptr;
    tx_ptr += sizeof(struct rx_write_memory);
    instance->tx.tx_write = (struct tx_write_memory*)tx_ptr;
    instance->tx.size_words = (tx_real_size - sizeof(struct rx_write_memory)) / sizeof(uint32_t);

    // Assign pointers to RX buffer parameter
    instance->tx.rx_write = (struct rx_write_memory*)rx_ptr;
    rx_ptr += sizeof(struct rx_write_memory);
    instance->rx.tx_write = (struct tx_write_memory*)rx_ptr;
    instance->rx.size_words = (tx_real_size - sizeof(struct rx_write_memory)) / sizeof(uint32_t);

    // Reset RX part
    reset_rx(&instance->rx);

    // Reset TX part
    reset_tx(&instance->tx);

    // Start receiving events
    set_event_callback(rx_event, icmsg_callback, instance);

    // Notify the other side
    fire_event(tx_event);
};

std::mutex eventMutex;
std::condition_variable eventCV;
std::set<Event*> events;

int main() {
    std::thread eventThread(runEventThread);
    eventThread.join();
}

