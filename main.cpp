

#include <cstddef>
#include <thread>
#include <vector>
#include <set>
#include <mutex>
#include <condition_variable>

#include "shmem.h"
#include "events.h"
#include "work.h"
#include "log.h"

#define MAX_RX_DATA_SIZE_LOG2 10
#define MAX_TX_DATA_SIZE_LOG2 23
#define MAX_RX_DATA_SIZE (1 << MAX_RX_DATA_SIZE_LOG2)
#define MAX_TX_DATA_SIZE (1 << MAX_TX_DATA_SIZE_LOG2)

#define MIN(a, b) ((a) < (b) ? (a) : (b))

using namespace std::chrono_literals;

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
    uint32_t max_data_size;
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
    const struct icmsg_callbacks* callbacks;
    bool connected;
    struct k_work work;
};


void reset_rx(struct icmsg_instance* instance) {
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;
    LOG("%s: Reset RX", A(instance));
    ShMem::invalidateRange((void*)rx->tx_write, offsetof(struct tx_write_memory, buffer));
    rx->read_index = rx->tx_write->write_index % rx->size_words;
    rx->rx_write->read_index = rx->read_index;
    LOG("%s: Read index %d", A(instance), rx->read_index);
    ShMem::flushRange((void*)&rx->rx_write->read_index, sizeof(rx->rx_write->read_index));
    rx->sync_value = rx->tx_write->sync_value2;
    rx->rx_write->sync_value1 = rx->sync_value;
    tx->max_data_size = 1 << (rx->sync_value >> 27);
    LOG("%s: Sync %08X, max data size %d", A(instance), rx->sync_value, tx->max_data_size);
    ShMem::flushRange((void*)&rx->rx_write->sync_value1, sizeof(rx->rx_write->sync_value1));
}

static uint32_t update_sync_value(uint32_t value) {
    return ((value + 1) & 0x000FFFFF) | (MAX_RX_DATA_SIZE_LOG2 << 27);
}

void reset_tx(struct tx_fifo *tx) {
    ShMem::invalidateRange((void*)tx->tx_write, offsetof(struct tx_write_memory, buffer));
    ShMem::invalidateRange((void*)tx->rx_write, sizeof(struct rx_write_memory));
    tx->write_index = tx->tx_write->write_index % tx->size_words;
    tx->sync_value = tx->tx_write->sync_value2;
    tx->sync_value = update_sync_value(tx->sync_value);
    if (tx->sync_value == tx->rx_write->sync_value1) {
        tx->sync_value = update_sync_value(tx->sync_value);
    }
    tx->tx_write->sync_value2 = tx->sync_value;
    ShMem::flushRange((void*)&tx->tx_write->sync_value2, sizeof(tx->tx_write->sync_value2));
}

void receive_one_packet(struct icmsg_instance *instance, uint32_t remote_write_index)
{
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    // Read and interpret header of the first packet.
    ShMem::invalidateRange((void*)&rx->tx_write->buffer[rx->read_index], sizeof(uint32_t));
    uint32_t header = rx->tx_write->buffer[rx->read_index];
    uint32_t size = header & 0xFFFFFF;
    uint32_t sync_value_lower = (header >> 24) & 0x3F;
    rx->read_index = (rx->read_index + 1) % rx->size_words;

    // Calculate total remaining words in FIFO (can contain more than one packet).
    uint32_t total_remaining_words;
    if (remote_write_index >= rx->read_index) {
        total_remaining_words = remote_write_index - rx->read_index;
    } else {
        total_remaining_words = rx->size_words - (rx->read_index - remote_write_index);
    }

    // Calculate and validate number of packet data words.
    uint32_t packet_data_words = (size + 3) / 4;
    if (packet_data_words > total_remaining_words) {
        // TODO: report error
        rx->read_index = remote_write_index;
        return;
    }

    // Move read index - consume this packet.
    uint32_t packet_data_index = rx->read_index;
    rx->read_index = (rx->read_index + packet_data_words) % rx->size_words;

    // If we have packet from the previous session, silently ignore them.
    if (sync_value_lower != (tx->sync_value & 0x3F)) {
        return;
    }

    // Check if we are able to receive such big packet. If not, skip and report error.
    if (size > MAX_RX_DATA_SIZE) {
        // TODO: report error
        return;
    }

    // Create VLA on stack to temporarily store the packet data.
    uint8_t temp_buffer[size];
    uint32_t size_remaining = size;

    // Copy from shared memory packet data as much as possible.
    int32_t copy_bytes = MIN(size_remaining, (rx->size_words - packet_data_index) * sizeof(uint32_t));
    ShMem::invalidateRange((void*)&rx->tx_write->buffer[packet_data_index], copy_bytes);
    std::memcpy(temp_buffer, (void*)&rx->tx_write->buffer[packet_data_index], copy_bytes);
    size_remaining -= copy_bytes;

    // If data was wrapped, continue reading from the beginning.
    if (size_remaining > 0) {
        ShMem::invalidateRange((void*)rx->tx_write->buffer, size_remaining);
        std::memcpy(temp_buffer + copy_bytes, (void*)rx->tx_write->buffer, size_remaining);
    }

    // Call the receive callback.
    instance->callbacks->received(temp_buffer, size, instance, instance->callbacks->user_data);
}

static void icmsg_work_handler(struct k_work *work)
{
    struct icmsg_instance *instance = CONTAINER_OF(work, struct icmsg_instance, work);
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    LOG("%s: handler", A(instance));

    bool redo = false;

    // Check incoming sync value. If updated, start new session.
    ShMem::invalidateRange((void*)rx->tx_write, offsetof(struct tx_write_memory, buffer));
    if (rx->tx_write->sync_value2 != rx->sync_value) {
        LOG("%s: remote session started", A(instance));
        // Reset RX fifo.
        reset_rx(instance);
        // If instance was already fully initialized, inform about remote reset.
        if (instance->connected && instance->callbacks->remote_reset) {
            LOG("%s: remote reset callback", A(instance));
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
    LOG("%s: remote write index %d, read index %d", A(instance), remote_write_index, rx->read_index);
    if (remote_write_index != rx->read_index) {
        while (remote_write_index != rx->read_index) {
            receive_one_packet(instance, remote_write_index);
        }
        // Update read index, so the remote will know that packets were received.
        rx->rx_write->read_index = rx->read_index;
        ShMem::flushRange((void*)&rx->rx_write->read_index, sizeof(rx->rx_write->read_index));
        // Wake up remote in case it is waiting for more available space in FIFO.
        fire_event(tx->tx_event);
        redo = true;
    }

    if (redo) {
        k_work_submit(&instance->work);
    }
}

void icmsg_callback(void* data) {
    struct icmsg_instance *instance = (struct icmsg_instance *)data;
    LOG("%s: signaled", A(instance));
    k_work_submit(&instance->work);
}

int icmsg_init(struct icmsg_instance *instance, void* tx_buffer, uint32_t tx_size, void* rx_buffer, uint32_t rx_size, void* rx_event, void* tx_event, const struct icmsg_callbacks* callbacks) {

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
    instance->tx.max_data_size = 0;
    k_work_init(&instance->work, icmsg_work_handler);

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
    reset_rx(instance);

    // Reset TX part
    reset_tx(&instance->tx);

    // Start receiving events
    set_event_callback(rx_event, icmsg_callback, instance);

    // Notify the other side
    fire_event(tx_event);

    return 0;
};

int icmsg_send(struct icmsg_instance *instance, const void* buffer, uint32_t size)
{
    struct rx_fifo *rx = &instance->rx;
    struct tx_fifo *tx = &instance->tx;

    // Check if size is acceptable.
    if (size > MAX_TX_DATA_SIZE || size > tx->max_data_size) {
        LOG("%s Too big packet data, size %d, hard limit %d, remote limit %d", A(instance), size, MAX_TX_DATA_SIZE, tx->max_data_size);
        return -1; //return -ENOMEM;
    }

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

    if (packet_words > available_words) {
        LOG("%s Too many words to send, packet words %d, available words %d", A(instance), packet_words, available_words);
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
        tx->write_index = (tx->write_index + (copy_bytes + (3 + 4)) / 4) % tx->size_words;
    }

    // Update write index in shared memory, so the remote can read it.
    tx->tx_write->write_index = tx->write_index;
    ShMem::flushRange((void*)&tx->tx_write->write_index, sizeof(tx->tx_write->write_index));

    // Ping remote that new packet is available.
    fire_event(tx->tx_event);

    return 0;
}

uint32_t* preview1;
uint32_t* preview2;

struct TestPing {

    static const uint32_t FIFO_SIZE = 64 + 4 + 8 + 8;

    static const icmsg_callbacks sendingCallbacks;
    static const icmsg_callbacks respondingCallbacks;

    static void sendingCore(void* mem, void* rx_event, void* tx_event) {
        setThreadName("sending");
        const char *text;
        icmsg_instance icmsg;
        A(&icmsg, "sendingICmsg");
        LOG("S - initializing...");
        icmsg_init(&icmsg, (uint8_t*)mem, FIFO_SIZE, (uint8_t*)mem + FIFO_SIZE, FIFO_SIZE, rx_event, tx_event, &sendingCallbacks);
        std::this_thread::sleep_for(0.5s);
        LOG("S - sending Test1");
        icmsg_send(&icmsg, "1. Test1", 8);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "2. Test2", 8);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "3. Next", 7);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "4. Other string", 15);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "5. Next line", 12);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "6. Some long text that will be send", 35);
        std::this_thread::sleep_for(0.2s);
        icmsg_init(&icmsg, (uint8_t*)mem, FIFO_SIZE, (uint8_t*)mem + FIFO_SIZE, FIFO_SIZE, rx_event, tx_event, &sendingCallbacks);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "7. This is even longer text that we have to send to do ping-pong", 64);
        std::this_thread::sleep_for(0.2s);
        icmsg_send(&icmsg, "8. The end", 10);
        std::this_thread::sleep_for(1s);
        LOG("S - done thread");
    }

    static void respondingCore(void* mem, void* rx_event, void* tx_event) {
        setThreadName("responding");
        icmsg_instance icmsg;
        A(&icmsg, "respondingICmsg");
        LOG("R - initializing...");
        icmsg_init(&icmsg, (uint8_t*)mem + FIFO_SIZE, FIFO_SIZE, (uint8_t*)mem, FIFO_SIZE, rx_event, tx_event, &respondingCallbacks);
        std::this_thread::sleep_for(1s);
        icmsg_init(&icmsg, (uint8_t*)mem + FIFO_SIZE, FIFO_SIZE, (uint8_t*)mem, FIFO_SIZE, rx_event, tx_event, &respondingCallbacks);
        std::this_thread::sleep_for(5s);
        LOG("R - done thread");
    }

    static void sendingCore_connected(struct icmsg_instance *instance, void* user_data)
    {
        printf("sending core - connected\n");
    }

    static void sendingCore_remote_reset(struct icmsg_instance *instance, void* user_data)
    {
        printf("sending core - remote reset\n");
    }

    static void sendingCore_received(uint8_t *buffer, uint32_t size, struct icmsg_instance *instance, void* user_data)
    {
        printf("Pong %d bytes: \"%s\"\n", size, std::string((char*)buffer, size).c_str());
    }

    static void respondingCore_connected(struct icmsg_instance *instance, void* user_data)
    {
        printf("responding core - connected\n");
    }

    static void respondingCore_remote_reset(struct icmsg_instance *instance, void* user_data)
    {
        printf("responding core - remote reset\n");
    }

    static void respondingCore_received(uint8_t *buffer, uint32_t size, struct icmsg_instance *instance, void* user_data)
    {
        printf("Ping %d bytes: \"%s\"\n", size, std::string((char*)buffer, size).c_str());
        icmsg_send(instance, buffer, size);
    }

    static void run()
    {
        ShMem shmem(2 * FIFO_SIZE);
        preview1 = (uint32_t*)shmem.startPtr;
        preview2 = (uint32_t*)((uint8_t*)shmem.startPtr + FIFO_SIZE);
        std::memset(preview1, 0, FIFO_SIZE);
        std::memset(preview2, 0, FIFO_SIZE);
        void* core1 = shmem.getInstance();
        void* core2 = shmem.getInstance();
        void* event1 = create_event();
        void* event2 = create_event();
        A(event1, "responding=>sending");
        A(event2, "sending=>responding");
        std::thread t1(sendingCore, core1, event1, event2);
        std::thread t2(respondingCore, core2, event2, event1);
        t1.join();
        t2.join();
        LOG("RS - done test");
    }
};

const icmsg_callbacks TestPing::sendingCallbacks = {
    .connected = TestPing::sendingCore_connected,
    .remote_reset = TestPing::sendingCore_remote_reset,
    .received = TestPing::sendingCore_received,
};

const icmsg_callbacks TestPing::respondingCallbacks = {
    .connected = TestPing::respondingCore_connected,
    .remote_reset = TestPing::respondingCore_remote_reset,
    .received = TestPing::respondingCore_received,
};

std::mutex eventMutex;
std::condition_variable eventCV;
std::set<Event*> events;
volatile bool stopEventThreadRequest = false;
std::shared_ptr<std::thread> eventThread;

std::mutex workMutex;
std::queue<k_work*> system_work_queue;
void* workEvent;

std::map<std::thread::id, std::string> threadNames;
std::map<void*, std::string> addressNames;

int main()
{
    setThreadName("main");
    init_work_queue();
    eventThread = std::make_shared<std::thread>(runEventThread);
    //testShMem();
    //testEvents();
    TestPing::run();
    stopEventThread();
    return 0;
}

