
#define RADIO_STATE_TXIDLE  1
#define RADIO_STATE_DISABLED  2
#define RADIO_STATE_TXRU  3

#define EVENT_FATAL 0

#define TASK_RADIO_READY 0

function start_tx_exchange()
{
    alias state = r4;
    alias hi = r3;

    r0 = (1 << TASK_RADIO_READY);
    JOB_CLR = r0;

    // Read the current state of the radio
    hi = ram_const(hi16(NRF_RADIO->STATE));
    state = ram_const(lo16(NRF_RADIO->STATE));
    trigger(EVENT_TIMER_RESTART);
    state = IO32[hi, state];
    nop();
    // Jump to the appropriate start function based on the radio state
    r0 = RADIO_STATE_TXIDLE;
    combine {
        if (state == r0) goto external(start_from_txidle);
        r0 = RADIO_STATE_DISABLED;
    }
    combine {
        if (state == r0) goto external(start_from_disabled);
        r0 = RADIO_STATE_TXRU;
    }
    if (state == r0) goto external(start_from_txru);

    // Trigger a fatal error if the radio is in an unexpected state
    trigger(EVENT_FATAL);
    exit();
    /*
    start_tx_exchange:
    MOV r0, 1 << TASK_RADIO_READY
    OUTI r0, JOB_CLR
    LD r3, #ram_const(hi16(NRF_RADIO->STATE));
    LD r4, #ram_const(lo16(NRF_RADIO->STATE));
    TRIGGER EVENT_TIMER_RESTART
    IN32 r4, r3
    NOP
    MOV r0, RADIO_STATE_TXIDLE
    CMP r4, r0
    BEQ start_from_txidle
    MOV r0, RADIO_STATE_DISABLED
    CMP r4, r0
    BEQ start_from_disabled
    MOV r0, RADIO_STATE_TXRU
    CMP r4, r0
    BEQ start_from_txru
    TRIGGER EVENT_FATAL
    EXIT
    NOP
    */
}


function start_from_disabled(alias hi = r3)
{
    alias lo = r4;
    
    lo = ram_const(lo16(NRF_RADIO->TXEN));
    r1 ^= r1;
    r0 = 1;
    combine {
        goto external(start_from_txru);
        IO32[hi, lo] = (r1, r0);
    }
    /*
    start_from_disabled:
    LD r4, #ram_const(lo16(NRF_RADIO->TXEN))
    XOR r1, r1
    LI r0, 1
    BR start_from_txru
    OUT32 r4, r3 // r1:r0 is always data for OUT32
    */
}

function start_from_txru(alias hi = r3)
{
    r0 = (1 << TASK_RADIO_READY);
    call external(wait_for_event.skip_wait);
    goto external(start_from_txidle);
    /*
    start_from_txru:
    LI r0, 1 << TASK_RADIO_READY
    CALL wait_for_event.skip_wait
    NOP
    BR start_from_txidle
    NOP
    */
}

function start_from_txidle(alias hi = r3)
{
    alias lo = r4;
    
    lo = ram_const(lo16(NRF_RADIO->START));
    r1 ^= r1;
    r0 = 1;
    IO32[hi, lo] = (r1, r0);
    r0 = (1 << TASK_RADIO_PHYEND);
    // TODO: Load here remaining parameters from main RAM
    wait_for_event();
    r1 = (1 << IPC_FLAG_ACK);
    r0 = IPC_REG;
    r1 &= r0;
    if (NZ) goto external(switch_to_ack);
    goto external(skip_wait);
    /*
    LD r4, #ram_const(lo16(NRF_RADIO->START));
    XOR r1, r1
    LI r0, 1
    OUT32 r4, r3 // r1:r0 is always data for OUT32
    LI r0, 1 << TASK_RADIO_PHYEND
    CALL wait_for_event
    NOP
    LI r1, 1 << IPC_FLAG_ACK
    INI r0, IPC_REG
    AND r1, r0
    BRNZ switch_to_ack
    NOP
    BR skip_wait
    NOP
    */
}

void switch_end_without_ack(alias hi = r3, alias ipc_reg = r0)
{
    r4 = IPC_REG_HI;
    if (!r4) goto external(disable_radio);
    goto external(prepare_delay_next_from_txidle); // It will fall through to the next function and remove this goto
}

void prepare_delay_next_from_txidle(alias time = r4)
{
    get_timer_time();
    time -= r0;
    r0 = DELAY_NEXT_PROCESSING_MARGIN;
    r1 = keep_tx_margin;
    time -= r0;
    if (time.s < r1.s) goto external(done_processing);
    r1 = tx_to_pll_margin;
    if (time.s < r1.s) goto external(prepare_next_with_pll);
    r1 = tx_to_pll_margin;
    if (time.s < r1.s) goto external(prepare_next_with_pll);
}

void switch_to_ack(alias hi = r3, alias ipc_reg = r0)
{

}

void wait_for_event(alias mask = r0, alias return_address = r7)
{
    JOB_CLR = r0;
loop:
    wait();
skip_wait:
    r1 = JOB_PENDING;
    r1 &= mask;
    if (Z) loop;
    goto external(return_address);
    /*
    OUTI r0, JOB_CLR
    loop:
    WAIT
    skip_wait:
    INI r1, JOB_PENDING
    AND r1, r0
    BRZ loop
    NOP
    BRI r7
    NOP
    */
}
