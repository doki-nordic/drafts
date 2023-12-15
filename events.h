#ifndef EVENTS_H
#define EVENTS_H


#include <thread>
#include <vector>
#include <set>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <chrono>

#include "shmem.h"

struct Event {
    bool active;
    void (*callback)(void*);
    void* data;
    Event(void (*callback)(void*), void* data): active(false), callback(callback), data(data) {}
};

extern std::mutex eventMutex;
extern std::condition_variable eventCV;
extern std::set<Event*> events;
extern volatile bool stopEventThreadRequest;
extern std::shared_ptr<std::thread> eventThread;

static void runEventThread() {
    while (true) {
        std::unique_lock lk(eventMutex);
        eventCV.wait(lk);
        bool rerun;
        do {
            std::atomic_thread_fence(std::memory_order_seq_cst);
            if (stopEventThreadRequest) {
                return;
            }
            rerun = false;
            for (auto event: events) {
                if (event->active) {
                    event->active = false;
                    if (event->callback) {
                        event->callback(event->data);
                    }
                    rerun = true;
                }
            }
        } while (rerun);
    }
}

static void stopEventThread() {
    using namespace std::chrono_literals;
    std::this_thread::sleep_for(0.1s);
    std::unique_lock lk(eventMutex);
    stopEventThreadRequest = true;
    std::atomic_thread_fence(std::memory_order_seq_cst);
    lk.unlock();
    eventCV.notify_one();
    eventThread->join();
}

static void* create_event(void (*callback)(void*) = nullptr, void* data = nullptr) {
    std::unique_lock lk(eventMutex);
    auto ev = new Event(callback, data);
    events.insert(ev);
    return (void*)ev;
}

static void fire_event(void* event) {
    std::unique_lock lk(eventMutex);
    auto ev = (Event*)event;
    ev->active = true;
    lk.unlock();
    eventCV.notify_one();
}

static void set_event_callback(void* event, void (*callback)(void*), void* data = nullptr) {
    std::unique_lock lk(eventMutex);
    auto ev = (Event*)event;
    ev->callback = callback;
    ev->data = data;
}

static void testEvents() {

    using namespace std::chrono_literals;

    struct TestData {
        volatile int counter;
        void* volatile event1;
        void* volatile event2;
        int state;
        static void handler1(void* vdata) {
            TestData* data = (TestData*)vdata;
            switch (data->state++)
            {
            case 1:
                TEST(data->counter == 10);
                break;
            case 2:
                TEST(data->counter == 20);
                break;
            case 3:
                TEST(data->counter == 30);
                break;
            case 4:
                TEST(data->counter == 40);
                break;
            case 5:
                TEST(data->counter == 50);
                break;
            }
        }
        static void handler2(void* vdata) {
            TestData* data = (TestData*)vdata;
            switch (data->state++)
            {
            case 6:
                TEST(data->counter == 60);
                break;
            case 7:
                TEST(data->counter == 70);
                break;
            case 8:
                TEST(data->counter == 80);
                break;
            case 9:
                TEST(data->counter == 90);
                break;
            case 10:
                TEST(data->counter == 100);
                break;
            }
        }
        static void run1(TestData* data) {
            data->counter = 10;
            fire_event(data->event1);
            std::this_thread::sleep_for(0.2s);
            data->counter = 20;
            fire_event(data->event1);
            std::this_thread::sleep_for(0.2s);
            data->counter = 30;
            fire_event(data->event1);
            std::this_thread::sleep_for(2s);
            data->counter = 60;
            fire_event(data->event2);
            std::this_thread::sleep_for(0.2s);
            data->counter = 70;
            fire_event(data->event2);
            std::this_thread::sleep_for(0.2s);
            data->counter = 80;
            fire_event(data->event2);
        }
        static void run2(TestData* data) {
            std::this_thread::sleep_for(2s);
            data->counter = 40;
            fire_event(data->event1);
            std::this_thread::sleep_for(0.2s);
            data->counter = 50;
            fire_event(data->event1);
            std::this_thread::sleep_for(2s);
            data->counter = 90;
            fire_event(data->event2);
            std::this_thread::sleep_for(0.2s);
            data->counter = 100;
            fire_event(data->event2);
        }
    };

    TestData data;
    data.event1 = create_event();
    data.event2 = create_event();
    data.state = 1;
    set_event_callback(data.event1, TestData::handler1, &data);
    set_event_callback(data.event2, TestData::handler2, &data);
    std::thread t1(TestData::run1, &data);
    std::thread t2(TestData::run2, &data);

    t1.join();
    t2.join();
    std::this_thread::sleep_for(2s);
    TEST(data.state == 11);
    TEST(data.counter == 100);

    std::cout << "Events emulator test success." << std::endl;
};

#endif
