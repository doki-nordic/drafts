
#ifndef WORK_H
#define WORK_H

#include <queue>
#include <mutex>

#include "events.h"
#include "log.h"

#define CONTAINER_OF(ptr, type, field)                               \
	({                                                           \
		((type *)(((char *)(ptr)) - offsetof(type, field))); \
	})

struct k_work;

typedef void (*k_work_handler_t)(struct k_work *work);

struct k_work
{
    bool inQueue;
    k_work_handler_t work_handler;
};

#define K_WORK_DEFINE(work, work_handler) static Work work(work_handler);

extern std::mutex workMutex;
extern std::queue<k_work*> system_work_queue;
extern void* workEvent;

void k_work_init(struct k_work *work, k_work_handler_t handler)
{
    work->inQueue = false;
    work->work_handler = handler;
}

static int k_work_submit(struct k_work *work) {
    std::unique_lock lk(workMutex);
    if (!work->inQueue) {
        work->inQueue = true;
        system_work_queue.push(work);
        lk.unlock();
        fire_event(workEvent);
    }
    return 0;
}

static void process_queue(void*) {
    std::unique_lock lk(workMutex);
    while (system_work_queue.size() > 0) {
        k_work* w = system_work_queue.front();
        system_work_queue.pop();
        w->inQueue = false;
        if (w->work_handler) {
            lk.unlock();
            w->work_handler(w);
            lk.lock();
        }
    }
}

static void init_work_queue() {
    workEvent = create_event(process_queue);
    A(workEvent, "work");
}


#endif
