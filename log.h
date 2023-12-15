#ifndef LOG_H
#define LOG_H

#include <utility>
#include <thread>
#include <map>

extern std::map<std::thread::id, std::string> threadNames;
extern std::map<void*, std::string> addressNames;

const char* getThreadName() {
    auto id = std::this_thread::get_id();
    if (threadNames.count(id) == 0) {
        threadNames[id] = "???";
    }
    return threadNames[id].c_str();
}

void setThreadName(const char* name) {
    auto id = std::this_thread::get_id();
    threadNames[id] = name;
}

template<typename T>
void A(T* address, const std::string& name) {
    addressNames[(void*)address] = name;
}

template<typename T>
const char* A(T* address) {
    if (addressNames.count((void*)address) == 0) {
        char buf[20];
        sprintf(buf, "%p", (void*)address);
        addressNames[(void*)address] = buf;
    }
    return addressNames[(void*)address].c_str();
}

#if 0
#define LOG(text, ...) printf("%10s: " text "        (%s:%d)\n", getThreadName(), ##__VA_ARGS__, __FILE__, __LINE__)
#else
#define LOG(...)
#endif

#endif
