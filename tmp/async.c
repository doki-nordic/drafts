


#define AWAIT_icbmsg_alloc(ctx, error_handler_label, ...) \
    res = icbmsg_alloc_async(ctx, #__VA_ARGS__); \
        ctx->caller = _async__caller; \
        _async_this_ctx->resume = &&_label121; \
        goto _async_await_start; \
    } \
    _label121: do {} while(0);


void schedule_async_resume_work(int result, void* buffer, size_t size, void* user_data) {
    awaitable_work* work = (awaitable_work*)user_data;
    work->pending = false;
    work->result = result;
    work->buffer = buffer;
    work->size = size;
    workqueue_schedule(&work);
}

void from_interrupt(void* user_data) {
    awaitable_work* work = (awaitable_work*)user_data;
    work->result = EOK;
    work->handler();
}

struct SendSomethingCtx {
    WorkItem item;
}

int internalFunc(InternalFuncState* state, StandardCallback callback, void* user_data) {
    int res;
    AWAIT_FUNC_PROLOGUE(internalFunc, state);

    int res = icbmsg_alloc_async($(ctx), 1024, MS(100), schedule_async_resume_work, &work_item);
    AWAIT_WITH_ERR(res, alloc_error);

    int res = wait_for_timer($(ctx_timer), from_interrupt, &work_item);
    AWAIT_WITH_ERR(res, wait_error);

    //...
    exit_func:
    if (ASYNC_SYNC) {
        return res;
    } else {
        callback(res, user_data);
    }
}

void sendSomething() {
    int res;

    AWAIT_WORK_PROLOGUE(&work_item, pending_handler);

    res = icbmsg_alloc_async($(ctx), 1024, MS(100), schedule_async_resume_work, &work_item);
    AWAIT_WITH_ERR(res, alloc_error);

    res = wait_for_timer($(ctx_timer), from_interrupt, &work_item);
    AWAIT_WITH_ERR(res, wait_error);

    // AWAIT_WITH_ERR:
    _async_res = res;
    if (_async_res < 0) {
        _async_resume = &&_label121;
        _async_error = &&alloc_error;
        goto _async_await_maybe_start; // if _async_res != STATUS_ASYNC jump back to label
    }
    _label121:
    res = _async_res;

    memcpy($(icbmsg_alloc_ctx)->buffer, my_data, 1024);
    icbmsg_send(buffer);

    wait_error:
    icbmsg_free($(ctx), $(buffer));

    alloc_error:
    if (AWAIT_RESULT == TIMEOUT) {

    }

    pending_handler:
    // Nothing to do
}

void sendSomethingSync() {
    uint8_t* buffer = icbmsg_alloc(NULL, 1024);
    memcpy(buffer, my_data, 1024);
    icbmsg_send(buffer);
}
