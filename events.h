#ifndef EVENTS_H
#define EVENTS_H


#include <thread>
#include <vector>
#include <set>
#include <mutex>
#include <condition_variable>

struct Event {
    bool active;
    void (*callback)(void*);
    void* data;
    Event(void (*callback)(void*), void* data): active(false), callback(callback), data(data) {}
};

extern std::mutex eventMutex;
extern std::condition_variable eventCV;
extern std::set<Event*> events;

static void runEventThread() {
    while (true) {
        std::unique_lock lk(eventMutex);
        eventCV.wait(lk);
        bool rerun;
        do {
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
}

#endif
