

#include <stdint.h>

/** @brief General Purpose Register 0 */
extern uint32_t r0;
/** @brief General Purpose Register 1 */
extern uint32_t r1;
/** @brief General Purpose Register 2 */
extern uint32_t r2;
/** @brief General Purpose Register 3 */
extern uint32_t r3;
/** @brief General Purpose Register 4 */
extern uint32_t r4;
/** @brief General Purpose Register 5 */
extern uint32_t r5;
/** @brief General Purpose Register 6 */
extern uint32_t r6;
/** @brief Link Register and General Purpose Register 7 */
extern uint32_t r7;
/** @brief Pseudovariable for delayed memory reads */
extern uint32_t delayed;
/** @brief IO memory */
extern uint32_t IO[];

/** @brief Zero ALU flag */
extern bool Z;

/** @brief Negative ALU flag */
extern bool N;

/** @brief Less Than condition */
extern bool LT;

/** @brief Greater Than condition */
extern bool GT;

/** @brief Less Than or Equal condition */
extern bool LE;

/** @brief Greater Than or Equal condition */
extern bool GE;

/** @brief Ensures all previous IO operations are completed */
void io_fence();

/** @brief Triggers an event with the given index */
void trigger(uint32_t);

/** @brief Exits the current job */
void exit();

/** @brief No operation */
void nop();

/** @brief Execute also the given instruction before actual branch
 *
 * This macro should be used after goto and call to put instructions
 * that after branch instructions, but they will be executed before the actual branch.
 * This is caused by delay branch.
 *
 * It not used, NOP instruction is added after goto and call instructions.
 */
#define ALSO(instruction) ; do { instruction; } while(0)

void other();

void job_0_entry()
{
	IO[r0 + 4] = r1;
	delayed = IO[r0];
fib:
	r2 = 0;
	r3 = 1;
	r0 = delayed;
loop_fib:
	r1 |= r1;
	r4 = 1;
	if (Z) goto end_fib
		ALSO(r1 -= r4);
	r4 = r2;
	r2 = r3;
	r3 += r4;
	r4 = 4;
	IO[r0] = r2;
	goto loop_fib
		ALSO(r0 += r4);
	return other();
end_fib:
	io_fence();
	trigger(0);
	exit();
}

struct Register {

	Register() = default;
	Register(const Register&) = default;

	const Register& operator *() const {
		return *this;
	}

	const Register& operator=(const Register&) const {
		return *this;
	}

	const Register& operator=(void(*a)()) const {
		return *this;
	}

	const Register& operator=(uint32_t) const {
		return *this;
	}

	const Register& operator=(void*) const {
		return *this;
	}

	operator void*() const {
		return nullptr;
	}

	void operator()() const {
	}

	Register &old;

    // TODO: With advanced templating, registers numbers can be preserved, so following construct will show an error:
    // r1 = r2 - r1;
};

const Register& operator+(const Register& lhs, uint32_t offset) {
	return lhs;
}


Register r1x;
Register r2x;

const int x;

bool some_external_function();

extern void *some_void_pointer;

#define combine while (some_external_function())
#define external(label) *some_void_pointer
#define call goto

uint32_t some_variable;
uint32_t some_array[10];

void function_name() {
}

#define size(x) (100)

using alias = Register;


void examples()
{
	// ALU operations
	r1 += r2;
	r1 |= r3;
	// Data transfer
	r1 = r2;
	// Load store operations
	r1 = 120; // 120 will be added to constants array
	r1x = (uint32_t)&function_name + 12;
	r2x = (uint32_t)&some_array + 12 / 2;
	r5 = sizeof(some_array) / sizeof(some_array[0]);
	r1 = some_variable; // Load value from memory
	r1 = *((uint8_t*)&some_variable + 5); // Load value from memory
	some_variable = r1; // Store value to memory
	r1x = *r2x; // Load value from memory address stored in r2
	*r2x = r1x; // Store value to memory address stored in r2
	r1x = *(r2x + x); // Load value from memory address stored in r2 with constant offset 12
	*(r2x + 12) = r1x; // Store value to memory address stored in r2 with constant offset 12
	// IO operations
	IO[r0 + 4] = r1; // Write to IO memory at offset 4 from r0
	r2 = IO[r0]; // Read from IO memory at offset 0 from r0
	delayed = IO[r0]; // Read from IO memory at offset 0 from r0, but don't wait for result yet
	r2 = delayed; // Wait for the result of the previous IO read
	io_fence(); // Wait for all previous IO operations to complete
	trigger(0); // Trigger output event 0
	// Branches
	goto label; // Branch to the specified label
	goto external(label); // Branch to a label from other function
	goto external(function_name); // Branch to the specified function
	goto external(r1); // Go to the address stored in r1x
	// Calls
	function_name(); // Call the specified function
	r1x(); // Call the function at the address stored in r1x
	call label; // Call the specified label as a function
	call external(label); // Call the specified label from other function
	// Conditional branches
	if (Z) goto label_if_zero; // Branch if zero flag is set
	// Adding postponed instruction
	combine { r2 += r1; goto label; }
	combine { r2 += r1; r1(); }
	combine { r1 |= r5; if (Z) goto label; }
	// Exit job
	exit();
	// Labels
	label:
	label_if_zero:
	// Register aliases
	alias tmp = r1x;
	tmp = r3;
}


/* 

*/


