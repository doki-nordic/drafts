/*
// JOB TABLE:

BR task_0
LD r1, #1
BR task_1
LD r0, #data_state
BR task_2
LD r0, #data_state

*/


// Configuration comes from main CPU
uint32_t cmd_dma_ptr;
uint32_t dummy_bytes_dma_ptr;
uint32_t spim_end_channel;
uint8_t *packet_ptr;

// Other variables
uint8_t data_state = 0;

void task_0(void) // Triggered by TIMER to start SPI burst
{
	NRF_P0->OUTCLR = (1 << 0); // lower CSN
	NRF_SPIM02->MAX_CNT = 1;
	NRF_SPIM02->PTR = cmd_dma_ptr;
	NRF_SPIM02->TASKS_START = 1;
	/*
	// LD r1, #1 (from job table)
	LD r0, #NRF_P0->OUTCLR
	OUT r0, r1
	LD r0, #NRF_SPIM02->MAX_CNT
	OUT r0, r1
	LD r0, #NRF_SPIM02->PTR
	LD r2, #cmd_dma_ptr
	OUT r0, r2
	LD r0, #NRF_P0->TASKS_START
	OUT r0, r1
	EXIT

    // Or with async IO
	// LD r1, #1 (from job table)
	LD r0, #NRF_P0->OUTCLR
	AOUT r0, r1
	LD r0, #NRF_SPIM02->MAX_CNT
	AOUT r0, r1
	LD r0, #NRF_SPIM02->PTR
	LD r2, #cmd_dma_ptr
	AOUT r0, r2
	LD r0, #NRF_P0->TASKS_START
	OUT r0, r1
	EXIT

	*/
}

void task_1(void) // Triggered by SPIM end event
{
	if (!data_state) {
		NRF_TIMER02->TASKS_START = 1;
	} else {
		NRF_TIMER03->TASKS_START = 1; // Start delay after burst
		p1 = NRF_P1->IN;
		buttons = (p1 >> 3) & 1;
		buttons |= (p1 >> (6 - 1)) & 2;
		buttons |= (p1 >> (23 - 2)) & 4;
		// further packet processing (packet_ptr)
		EVENT_0(); // Notify that packet is ready to be send
	}
	/*
	// LD r0, #data_state (from job table)
	BRBS r0, 0, task1_in_data_state
	   !LD r1, #1
	LD r0, #NRF_TIMER02->TASKS_START
	OUT r0, r1
	EXIT

	task1_in_data_state:
	LD r0, #NRF_TIMER03->TASKS_START
	OUT r0, r1
	LD r0, #NRF_P1->IN
	IN r0, r2
	MOV r0, r2
	SHR r0, #3
	AND r0, r1
	MOV r1, r2
	SHR r1, #5
	LD r3, #2
	AND r1, r3
	OR r0, r1
	SHR r2, #21
	LD r3, #4
	AND r2, r3
	OR r0, r2
	...
	EVENT 0
	EXIT

	*/
}

void task_2(void) // Triggered by TIMER after command byte and delay
{
	if (!data_state) {
		NRF_SPIM02->PTR = dummy_bytes_dma_ptr;
		NRF_SPIM02->MAX_CNT = 6;
		NRF_SPIM02->TASKS_START = 1;
	} else {
		NRF_P0->OUTSET = (1 << 0); // raise CSN
	}
	data_state ^= 1;
	/*
	// LD r0, #data_state (from job table)
	XOR r0, #1
	BRBC r0, 0, task2_in_data_state
	   !ST r0, #data_state
	...
	EXIT

	task2_in_data_state:
	...
	EXIT

	*/
}