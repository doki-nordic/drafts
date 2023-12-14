

#include <cstddef>
#include <thread>
#include <vector>
#include <set>
#include <mutex>
#include <condition_variable>

#include "shmem.h"
#include "events.h"

struct icmsg_instance;

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
    void* rx_event;
    volatile const struct tx_write_memory* tx_write;
    volatile struct rx_write_memory* rx_write;
};

struct tx_fifo {
    uint32_t sync_value;
    uint32_t write_index;
    uint32_t size_words;
    void* tx_event;
    volatile struct tx_write_memory* tx_write;
    volatile const struct rx_write_memory* rx_write;
};

struct icmsg_callbacks {
    void (*connected)(struct icmsg_instance *instance, void* user_data);
    void (*remote_reset)(struct icmsg_instance *instance, void* user_data);
    void (*received)(uint8_t *buffer, uint32_t size, struct icmsg_instance *instance, void* user_data);
    void* user_data;
};

struct icmsg_instance {
    struct rx_fifo rx;
    struct tx_fifo tx;
    struct icmsg_callbacks* callbacks;
    bool connected;
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

void receive_packet(struct icmsg_instance *instance, uint32_t remote_write_index)
{
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    uint32_t total_incoming_words;
    if (remote_write_index >= rx->read_index) {
        total_incoming_words = remote_write_index - rx->read_index;
    } else {
        total_incoming_words = rx->size_words - (rx->read_index - remote_write_index);
    }

    ShMem::invalidateRange((void*)&rx->tx_write->buffer[rx->read_index], sizeof(uint32_t));
    uint32_t header = rx->tx_write->buffer[rx->read_index];
    uint32_t size = header & 0xFFFFFF;
    uint32_t sync_value_lower = (header >> 24) & 0x3F;
    rx->read_index++;

    uint32_t packet_words = 1 + (size + 3) / 4;
    if (packet_words > total_incoming_words) {
        // TODO: report error
        rx->read_index = remote_write_index;
    }
}


void icmsg_callback(void* data) {
    struct icmsg_instance *instance = (struct icmsg_instance *)data;
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    bool redo;

    do {
        redo = false;

        // Check incoming sync value. If updated, start new session.
        ShMem::invalidateRange((void*)rx->tx_write, offsetof(struct tx_write_memory, buffer));
        if (rx->tx_write->sync_value2 != rx->sync_value) {
            // Reset RX fifo.
            reset_rx(rx);
            // If instance was already fully initialized, inform about remote reset.
            if (instance->connected && instance->callbacks->remote_reset) {
                instance->callbacks->remote_reset(instance, instance->callbacks->user_data);
            }
            // Wake up remote to finalize initialization on remote side.
            fire_event(tx->tx_event);
            redo = true;
        }

        // If not connected yet, check if remote initialized receiver for this session.
        if (!instance->connected) {
            ShMem::invalidateRange((void*)&tx->rx_write->sync_value1, sizeof(tx->rx_write->sync_value1));
            // If sync value is as expected, remote is ready to receive, so call the callback.
            if (tx->sync_value == tx->rx_write->sync_value1) {
                instance->connected = true;
                if (instance->callbacks->connected) {
                    instance->callbacks->connected(instance, instance->callbacks->user_data);
                }
                redo = true;
            }
        }

        // If there something in FIFO, read all.
        uint32_t remote_write_index = rx->tx_write->write_index % rx->size_words;
        if (remote_write_index != rx->read_index) {
            while (remote_write_index != rx->read_index) {
                receive_packet(instance, remote_write_index);
            }
            // Update read index, so the remote will know that packets were received.
            rx->rx_write->read_index = rx->read_index;
            ShMem::flushRange((void*)&rx->rx_write->read_index, sizeof(rx->rx_write->read_index));
            // Wake up remote in case it is waiting for more available space in FIFO.
            fire_event(tx->tx_event);
            redo = true;
        }

    } while (redo);
}


int icmsg_init(struct icmsg_instance *instance, void* tx_buffer, uint32_t tx_size, void* rx_buffer, uint32_t rx_size, void* rx_event, void* tx_event, struct icmsg_callbacks* callbacks) {

    // Align the buffer to cache line size
    uint8_t* tx_ptr = (uint8_t*)ROUND_UP((uintptr_t)tx_buffer, SHMEM_CACHE_SIZE);
    uint8_t* tx_end = (uint8_t*)ROUND_DOWN((uintptr_t)tx_buffer + tx_size, SHMEM_CACHE_SIZE);
    size_t tx_real_size = tx_end - tx_ptr;
    uint8_t* rx_ptr = (uint8_t*)ROUND_UP((uintptr_t)rx_buffer, SHMEM_CACHE_SIZE);
    uint8_t* rx_end = (uint8_t*)ROUND_DOWN((uintptr_t)rx_buffer + rx_size, SHMEM_CACHE_SIZE);
    size_t rx_real_size = rx_end - rx_ptr;

    // Save events
    instance->rx.rx_event = rx_event;
    instance->tx.tx_event = tx_event;
    instance->connected = false;
    instance->callbacks = callbacks;

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

    return 0;
};

#define MAX_DATA_SIZE 0x00FFFFFF

#define MIN(a, b) ((a) < (b) ? (a) : (b))

int icmsg_send(struct icmsg_instance *instance, const void* buffer, uint32_t size)
{
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    // Get read index and available fifo words based on it.
    ShMem::invalidateRange((void*)&tx->rx_write->read_index, sizeof(tx->rx_write->read_index));
    uint32_t read_index = tx->rx_write->read_index % tx->size_words;
    uint32_t available_words;

    if (read_index < tx->write_index) {
        available_words = tx->write_index - read_index - 1;
    } else {
        available_words = tx->size_words - (read_index - tx->write_index) - 1;
    }

    // Check if size packet will fit into the available space.
    uint32_t packet_words = (size + (3 + 4)) / 4;

    if (packet_words > available_words || size > MAX_DATA_SIZE) {
        return -1; //return -ENOMEM; // TODO: wait if timeout is required
    }

    // Put packet header.
    uint32_t header = ((rx->sync_value & 0x3F) << 24) | size;
    tx->tx_write->buffer[tx->write_index] = header;

    // Copy data as much as possible (all or until end of fifo buffer).
    uint32_t copy_bytes = MIN(size, (tx->size_words - tx->write_index - 1) * 4);
    std::memcpy((void*)&tx->tx_write->buffer[tx->write_index + 1], buffer, copy_bytes);

    // Flush cache including header.
    ShMem::flushRange((uint8_t*)&tx->tx_write->buffer[tx->write_index], copy_bytes + 4);

    // Calculate remaining bytes to copy.
    size -= copy_bytes;

    if (size > 0) {
        // If there are remaining bytes, wrap to the beginning of the buffer.
        std::memcpy((void*)tx->tx_write->buffer, (uint8_t*)buffer + copy_bytes, size);
        ShMem::flushRange((void*)tx->tx_write->buffer, size);
        tx->write_index = (size + 3) / 4;
    } else {
        // No wrapping, so just update the write index.
        tx->write_index += ((copy_bytes + 3) / 4) % tx->size_words;
    }

    // Update write index in shared memory, so the remote can read it.
    tx->tx_write->write_index = tx->write_index;

    // Ping remote that new packet is available.
    fire_event(tx->tx_event);
}

std::mutex eventMutex;
std::condition_variable eventCV;
std::set<Event*> events;

int main()
{
    std::thread eventThread(runEventThread);
    eventThread.join();
}

