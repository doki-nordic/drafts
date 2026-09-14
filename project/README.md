# RPPU CPU project

Initial SystemVerilog/Verilator project for custom CPU development.

The CPU datapath width is configured with the `CPU_BITS` parameter. Supported
values are 16 and 32, with 32 as the default. The ALU, register file, and PC
register-source input use this parameter. Instruction width remains 16 bits,
and PC/address width remains independently controlled by `PC_WIDTH`.

## Structure

```text
rppu_cpu/
├── src/                 # Synthesizable RTL modules
│   ├── rppu_alu.sv
│   ├── rppu_alu_flags.svh
│   ├── rppu_alu_ops.svh
│   ├── rppu_cond_dec.sv
│   ├── rppu_pc_control.sv
│   ├── rppu_prog_mem.sv
│   └── rppu_registers.sv
├── sim/                 # Testbenches and simulation-only code
│   ├── rppu_alu_tb.sv
│   ├── rppu_cond_dec_tb.sv
│   ├── rppu_pc_control_tb.sv
│   ├── rppu_prog_mem_tb.sv
│   └── rppu_registers_tb.sv
├── build/               # Generated files (ignored/cleaned)
├── Makefile
└── README.md
```

## Install tools on Ubuntu

```bash
sudo apt update
sudo apt install verilator gtkwave make
```

## Build

```bash
make
```

## Run simulation and open waveform

```bash
make run
```

The full simulation runs both 16-bit and 32-bit configurations for every
module that depends on `CPU_BITS`.

Run the ALU simulation separately:

```bash
make run-alu
```

Run the condition decoder simulation:

```bash
make run-cond
```

Run the program memory simulation:

```bash
make run-mem
```

## Clean generated files

```bash
make clean
```

## Register file

`rppu_registers` provides:

- 2 independent asynchronous read ports (`a`, `b`)
- 1 synchronous write port (`x`)
- `CPU_BITS`-wide registers
- configurable `REGS_COUNT` from 4 to 8
- fixed 3-bit addresses even when fewer than 8 registers are used
- out-of-range reads return zero
- out-of-range writes are ignored
- `a_re` and `b_re` are reserved for a future power-aware implementation

## ALU

`rppu_alu_ops.svh` contains the shared opcode constants used by the ALU,
testbench, and future instruction decoder.

`rppu_alu` accepts one enabled operation per clock cycle. The result and flags
are registered on the next rising edge. When `en` is low, `r` and
`flags` retain their values. `ready` is always high because every implemented
operation currently completes in one clock cycle.

The implemented operations are add, add with carry, subtract, subtract with
carry, AND, OR, XOR, multiply, compare, compare with carry, NOT, negate, and
8-bit and 16-bit sign extension. Compare operations are aliases of their
corresponding subtract operations. Multiply currently returns the low 32 bits
of the product. Set the `ENABLE_MUL` parameter to `0` to omit multiplier logic;
in that configuration, the multiply opcode holds the existing result like an
unsupported operation.

`flags` is three bits wide: carry at bit 0, zero at bit 1, and negative at bit
2. For subtraction, a set carry means no unsigned borrow; subtract with carry
therefore subtracts an extra one when the incoming carry is clear.

## Condition decoder

`rppu_cond_dec` evaluates an instruction condition against the ALU flags.
Condition bit 0 is the expected flag value and bits 2:1 select carry, zero, or
negative. The reserved selector value also selects carry.

## Program memory

`rppu_prog_mem` stores $2^{PC_WIDTH}$ 16-bit instructions. CPU reads are
synchronous, and `data` holds its previous value while `re` is low. The external
programmer writes synchronously through a separate write-only port. Every write
is first captured in a one-entry pending register and is committed on a later
cycle in which `re` is low. A read therefore has priority over memory writes.
A new programmer write while another write remains pending is invalid usage.
