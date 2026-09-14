Use cases:

Complicated SPIM sequence with delays and multiple transactions [power and performance improvement]

Example: mouse sensors burst transactions has complicated timing requirements that SPIM does not support.

Radio multiple transmission/reception and partial packet processing without main CPU involvement. [power  improvement]

Example: send packets with data received from sensors without waking up main CPU at all.

Fast radio responses, e.g. switching state, buffer, channel without main CPU involvement that can take some time and power [power and performance improvement]

Example: In ESB PRX, check if sender requested ACK and switch radio to TX if yes, switch packet pointer to next buffer and start receiving again otherwise.

Advanced asynchronous memory-to-memory copying [power and performance improvement].

Example: When fragmented packets must be copied to single send buffer, main CPU may delegate this job and do other tasks or go idle.

Low power implementation of SW protocols with bit-banging. [power and feature improvement]

Example: Single-wire half-duplex UART, or 1-wire.

Simple processing of input signals to avoid unneeded main CPU wake ups. [power  improvement]

Example: If we didn’t get end of frame over UART, we may skip waking up main CPU.

CPU

Custom architecture

Designed to write in assembly only (but if someone get crazy idea to write C compiler, the architecture should not block it)

Reduced ALU

32-bit architecture since all our registers are 32-bit

8x32-bit general purpose registers, less if needed, e.g. 6 should be still ok, 4 would require more LD/ST to store temporary data.

One-stage pipeline if possible, two-stage if required.

Allowed if needed: next instruction after branch is always executed like in MIPS, because code is meant to be written always in assembly and architecture does not to be scalable.

CPU is designed to execute jobs - it is like preemptive interrupt. There is no main context, everything executes from job.

There is no IDLE-like (WFI/WFE). Once job is executed CPU goes to IDLE.

If new job was triggered and old job is working, new job becomes pending.

If job is pending and it is triggered once more, overflow flag is set and once job gets executed, it can examine that flag.

Job pending flag is cleared when job starts to execute, so if the same job is triggered for the second time while it is executing, it will be re-executed once more to handle new trigger.

When job starts to execute, clearing pending flag must be atomic, so each trigger is handled without race conditions.

Peripheral Interface:

Generally works the same as other peripherals: registers, tasks, events

Each TASKS_JOB[n] triggers job number n.

Each EVENTS_TRIGGERED[n] is triggered by the RPP CPU.

RESET bit resets the state, but just needed part of the state. RAMs, general purpose registers may stay the same, because they will be initialized on startup.

INSTR register loads instruction to INSTRUCTION RAM and increment load address. Consecutive writes to INSTR fill up INSTRUCTION RAM with new program.

Other approach to loading program: write just small program and trigger job. The job will copy instructions from main RAM to INSTRUCTION RAM. This way loading is asynchronous (at least partially)

If INSTRUCTION RAM is busy write waits, so it is best to load program when CPU is not working.

STATE register tells currently executing job.

Maybe also JOBS registers that tells current job flags (pending, overflow).

Instruction set

Very reduced instruction set with known number of cycles

IN/OUT instruction gets access to main chip’s address space over AMBIX. This includes RAM banks, RRAM, peripherals in this domain and others.

It uses general purpose register as address (with immediate offset if possible)

LD/ST instructions gets access to DATA RAM

It should support large enough immediate value for fast reading from DATA RAM.

It should support addressing with registers (with offset if possible)

Usual ALU instructions: ADD, SUB, OR, AND, XOR, SHR, SHL, etc.

Bit shift may need to be reduced, e.g. just one bit like in AVR or limited shift values.

Branches and conditional branches

indirect: uses register as the target

direct: uses immediate value relative to current PC

next instruction may be executed

CALL and ICALL (indirect call) will write current PC to link register (e.g. r7), returns with IJUMP r7

PC has only number of bits as needed by instruction RAM space. It points to instruction address, not byte address.

Job is started by setting PC = 2 * job_index

Assuming that next instruction after branch is always executed, the job table at the beginning of instruction RAM is following:



BR job_0_handler
// First instruction of job_0_handler
BR job_1_handler
// First instruction of job_1_handler
// ...
Job exists with EXIT instruction, but because of pre-fetch, next instruction after exit will be executed at the beginning of next job, so it must end with EXIT and NOP

TRIGGER instruction to TRIGGER output event (or as internal CPU register)

Instruction RAM:

It is 16-bit wide, but since we are keeping only instructions in it and if we are able to fit instructions in less bits, it can be less than 16 bits.

RPP CPU has no direct address to instruction RAM expect instruction fetch

Instruction RAM can be only written with INSTR register

If instruction fetch operation is ongoing, the INSTR write operation will wait until instr. RAM is free. The instr. RAM will be busy all the time if instructions are executed in one cycle, so it should not be written while RPP is running.

Exception is when RPP is writing to INSTR, because it will cause CPU to wait until write is finished, so RAM will not be busy for some number of cycles.

Data RAM:

It is 32-bit wide, but also should support 8 and 16-bit access

Accessible only from RPP CPU

AMBIX bridge

Accessible with IN/OUT instructions

Those instruction waits until transaction is finished

If possible, add different variants of IN/OUT instructions that does not wait, e.g.:

AOUT rS, rA (asynchronous out) that writes, but without waiting

AIN rA (asynchronous in) that requests read, but without waiting for result

WAIT rD that wait for previous operation to finish, if it was IN, rD contains read value, otherwise undefined value.

If operation is pending, you cannot use other instructions IN/OUT/AOUT/AIN. Or, other option IN/OUT/AOUT/AIN waits for previous operation to finish.

Internal CPU registers

ALU state bits

PC (if actually needed)

job flags (pending, override)

To consider if access them with IN/OUT instructions or dedicated instructions

Other things to consider:

Add built-in timer for easier short time measurements/delays. May be needed for bit-banging implementations.

Direct access to GPIO to speed-up bit-banging.

Disabling job handlers to use TASKS not as trigger for job, but as input data. Single internal register will give access to state (triggered, overflowed) and other registers will allow to clear or set those flags. Also atomic access would be needed, e.g. clear flags for job[n] and get value before clearing - this will make sure that no task trigger is lost.

Some register or FIFO that flows from main CPU to some internal register of RPP CPU, e.g. to pass parameters for jobs.