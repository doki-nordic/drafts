
# Instruction Set Summary

| Instruction | Operands | Description | Details |
|-------------|-------------|-------------|---------|
|  |  | **Arithmetic and Logic Instructions** |
| ADD | rD, rS | Addition | [ALU binary operations](#alu-binary-operations)
| ADDC | rD, rS | Addition with carry | [ALU binary operations](#alu-binary-operations)
| SUB | rD, rS | Subtraction | [ALU binary operations](#alu-binary-operations)
| SUBC | rD, rS | Subtraction with carry | [ALU binary operations](#alu-binary-operations)
| AND | rD, rS | Bitwise AND | [ALU binary operations](#alu-binary-operations)
| OR | rD, rS | Bitwise OR | [ALU binary operations](#alu-binary-operations)
| XOR | rD, rS | Bitwise XOR | [ALU binary operations](#alu-binary-operations)
| MUL | rD, rS | Multiplication | [ALU binary operations](#alu-binary-operations)
| CMP | rD, rS | Compare | [ALU binary operations](#alu-binary-operations)
| CMPC | rD, rS | Compare with carry | [ALU binary operations](#alu-binary-operations)
| NOT | rD, rS | Bitwise NOT | [ALU unary operations](#alu-unary-operations)
| NEG | rD, rS | Negation | [ALU unary operations](#alu-unary-operations)
| SEXT8 | rD, rS | Sign extend 8-bit to CPU bit width | [ALU unary operations](#alu-unary-operations)
| SEXT16 `32` | rD, rS | Sign extend 16-bit to CPU bit width | [ALU unary operations](#alu-unary-operations)
| SIGN | rD, rS | Get value sign | [ALU unary operations](#alu-unary-operations)
|  |  | **Data Movement Instructions** |
| MOV | rD, rS | Move data | [Data movement operations](#data-movement-operations)
| LI | rD, value | Load immediate 8-bit value | [Data movement operations](#data-movement-operations)
|  |  | **Shift Instructions** |
| SHL | rD, rS | Shift left | [Shift operations](#shift-operations)
| SHR | rD, rS | Shift right | [Shift operations](#shift-operations)
| SHRS | rD, rS | Shift right signed value | [Shift operations](#shift-operations)
| ROL | rD, rS | Rotate left | [Shift operations](#shift-operations)
|  |  | **Branch Instructions** |
| CALL | label | Unconditional call a subroutine | [Branch operations](#branch-operations)
| BR | label | Unconditional branch | [Branch operations](#branch-operations)
| CALLI | rD | Unconditional call a subroutine indirect | [Branch operations](#branch-operations)
| BRI | rD | Unconditional branch indirect | [Branch operations](#branch-operations)
| BRNZ | label | Branch if not zero | [Branch operations](#branch-operations)
| BRNE | label | Branch if not equal | [Branch operations](#branch-operations)
| BRZ | label | Branch if zero | [Branch operations](#branch-operations)
| BREQ | label | Branch if equal | [Branch operations](#branch-operations)
| BRUGE | label | Branch if unsigned greater or equal | [Branch operations](#branch-operations)
| BRNC | label | Branch if no carry | [Branch operations](#branch-operations)
| BRULT | label | Branch if unsigned less than | [Branch operations](#branch-operations)
| BRC | label | Branch if carry | [Branch operations](#branch-operations)
| BRSGE | label | Branch if signed greater or equal | [Branch operations](#branch-operations)
| BRNN | label | Branch if not negative | [Branch operations](#branch-operations)
| BRSLT | label | Branch if signed less than | [Branch operations](#branch-operations)
| BRN | label | Branch if negative | [Branch operations](#branch-operations)
|  |  | **Data Memory Instructions** |
| LD8 | rD, addr | Load from memory unsigned 8-bit value | [Data memory operations](#data-memory-operations)
| LDS8 | rD, addr | Load from memory signed 8-bit value | [Data memory operations](#data-memory-operations)
| LD16 | rD, addr | Load from memory unsigned 16-bit value | [Data memory operations](#data-memory-operations)
| LDS16 | rD, addr | Load from memory signed 16-bit value | [Data memory operations](#data-memory-operations)
| LD32 `32` | rD, addr | Load from memory unsigned 32-bit value | [Data memory operations](#data-memory-operations)
| ST8 | rD, addr | Store to memory unsigned 8-bit value | [Data memory operations](#data-memory-operations)
| ST16 | rD, addr | Store to memory unsigned 16-bit value | [Data memory operations](#data-memory-operations)
| ST32 `32` | rD, addr | Store to memory unsigned 32-bit value | [Data memory operations](#data-memory-operations)
| LDI8 | rD, rS + addr | Load from memory unsigned 8-bit value | [Data memory operations](#data-memory-operations)
| LDIS8 | rD, rS + addr | Load from memory signed 8-bit value | [Data memory operations](#data-memory-operations)
| LDI16 | rD, rS + addr | Load from memory unsigned 16-bit value | [Data memory operations](#data-memory-operations)
| LDIS16 | rD, rS + addr | Load from memory signed 16-bit value | [Data memory operations](#data-memory-operations)
| LDI32 `32` | rD, rS + addr | Load from memory unsigned 32-bit value | [Data memory operations](#data-memory-operations)
| STI8 | rD, rS + addr | Store to memory unsigned 8-bit value | [Data memory operations](#data-memory-operations)
| STI16 | rD, rS + addr | Store to memory unsigned 16-bit value | [Data memory operations](#data-memory-operations)
| STI32 `32` | rD, rS + addr | Store to memory unsigned 32-bit value | [Data memory operations](#data-memory-operations)
|  |  | **External IO Instructions** |
| OUT8 | r0, rS:rD + offset `16` <br/> rD, rS + offset `32` | Store to IO 8-bit register | [IO operations](#io-operations)
| OUT16 | r0, rS:rD + offset `16` <br/> rD, rS + offset `32` | Store to IO 16-bit register | [IO operations](#io-operations)
| OUT32 | r1:r0, rS:rD + offset `16` <br/> rD, rS + offset `32` | Store to IO 32-bit register | [IO operations](#io-operations)
| IN8 | rD, rS:rD + offset `16` <br/> rD, rS + offset `32` | Load from IO 8-bit register | [IO operations](#io-operations)
| IN16 | rD, rS:rD + offset `16` <br/> rD, rS + offset `32` | Load from IO 16-bit register | [IO operations](#io-operations)
| IN32 | rD, rS:rD + offset `16` <br/> rD, rS + offset `32` | Load from IO 32-bit register | [IO operations](#io-operations)
| INADDR8 | rS:rD + offset `16` <br/> rS + offset `32` | Prepare fetch from IO 8-bit register | [IO operations](#io-operations)
| INADDR16 | rS:rD + offset `16` <br/> rS + offset `32` | Prepare fetch from IO 16-bit register | [IO operations](#io-operations)
| INADDR32 | rS:rD + offset `16` <br/> rS + offset `32` | Prepare fetch from IO 32-bit register | [IO operations](#io-operations)
| INDATA | rD | Load from fetched register | [IO operations](#io-operations)
| INDATAHI `16` | rD | Load higher bits from fetched 32-bit register | [IO operations](#io-operations)
| IOFENCE |  | IO fence operation | [IO operations](#io-operations)
|  |  | **Internal IO Instructions** |
| INI | rD, address | Load from internal IO register | [IO operations](#io-operations)
| OUTI | rD, address | Store to internal IO register | [IO operations](#io-operations)
|  |  | **Tasks and Events Instructions** |
| EXIT |  | Exit job | [Job operations](#job-operations)
| WAIT |  | Wait for job event | [Job operations](#job-operations)
| YIELD |  | Yield job execution | [Job operations](#job-operations)
| TRIGGER | index | Trigger event | [Trigger](#trigger)
|  |  | **Miscellaneous Instructions** |
| NOP |  | No operation | [Job operations](#job-operations)

* `16` - 16-bit CPU architecture only
* `32` - 32-bit CPU architecture only

**TODO:** Consider IN8/16/32 destination register to be r0 for consistency with OUT instructions.
          Con: it requires more wiring and may not actually give a significant benefit.
          Pro: Consistent with OUT instructions.
          After initial consideration: Don't implement.

**TODO:** Consider removing INI/OUTI instructions by moving those registers to internal memory space.
          Pro: Smaller instruction decoder.
          Con: Additional latency in INI to write to destination register.
          Con: Longer data path for LD/ST operations.
          After initial consideration: Do experiments and decide based on the results.

**TODO:** Consider second variant for MOV, LI, INI instructions that delays writing to the destination
          register to be consistent with other instructions. It would reduce number of NOPs when
          those two types of instructions are used in sequence.
          Con: It may complicate the instruction decoder/pipeline.
          Pro: It could reduce the number of NOPs required in certain instruction sequences.
          After initial consideration: Don't implement.

**TODO:** Alternative for above todo: Allow to write two registers in one cycle - one from the
          current instruction and one from the previous instruction (current instruction has priority).
          Con: It may complicate the register file write-back logic.
          Pro: It could allow more efficient use of instruction slots (less NOPs required).
          After initial consideration: Do experiments and decide based on the results.

**TODO:** Consider removing LDS8/LDIS8 instruction that can be done with LD and SIGN8 pair.
          Pro: Smaller instruction decoder.
          Con: Slightly more instructions required. Additionally, LD result is delayed, so SIGN8
          cannot be issued immediately.
          After initial consideration: Yes, do it.

**TODO:** Consider adding DELAY instruction to stall CPU for a specified number of cycles.
          Pro: Can be useful for short time delays.
          Con: Bigger design complexity.
          After initial consideration: Do experiments and decide based on the results.

# Instruction Set

## ADD

### Syntax

```
ADD rD, rS
```

### Description

The `ADD` instruction adds the value of the source register `rS` to the destination register `rD` and stores the result in `rD`.

### C-like Syntax

```cpp
// Single instruction
rD += rS;
rD = rD + rS;
rD = rS + rD;
// Explicit carry version
(carry, rD) = rD + rS;
```

Example:

```cpp
// 48-bit addition
(carry, r0) = r0 + r3;
(carry, r1) = r1 + r4 + carry;
r2 = r2 + r5 + carry;
```

### Encoding

```
|   .   .   .   .   .   .   .   .   .   |   .   .   |   .   .   | 
| 0   0   0   0   0   1   0   0   0   0 |    rS     |    rD     |
|   '   '   '   '   '   '   '   '   '   |   '   '   |   '   '   | 
```


## BR\[cc\]

### Syntax

```
BR[cc] label
```

### Description

The `BR[cc]` instruction performs a conditional branch to the specified `label` based on the condition code `cc`. If the condition is met, the program counter is updated to the address of the `label`; otherwise, execution continues sequentially.

Single instruction after the `BR[cc]` will be executed regardless of whether the branch is taken or not.
Put there a `NOP` or rearrange your instructions to avoid unintended execution of the instruction immediately following the branch.

The condition input is taken from current ALU flags, so ensure that the relevant flags are correctly set before executing the `BR[cc]` instruction. For example, execute `CMP` or `OR` instruction beforehand to set the appropriate flags.

Single condition may have different meanings depending on the context, so multiple condition codes represents the same condition. For example, to compare two registers for equality with `CMP r0, r1`, use `EQ` which represents `Z = 1`, to check if register is zero with `OR r0, r0`, use `Z` code that represents `Z = 1` as well.

Condition codes (`cc`):

| Condition | Code variants | Encoding |
|------|--------------------|----|
| Z = 0   |  `NZ` - not zero, `NE` - not equal   | 000 |
| Z = 1   |  `Z` - zero, `EQ` - equal   | 001 |
| C = 0   |  `UGE` - unsigned greater or equal, `NC` - no carry   | 010 |
| C = 1   |  `ULT` - unsigned less than, `C` - carry   | 011 |
| N = 0   |   `SGE` - signed greater or equal, `NN` - not negative   | 100 |
| N = 1   |   `SLT` - signed less than, `N` - negative   | 101 |

### C-like Syntax

```cpp
// Conditional branch
if (cc) goto label;
// Conditional branch combined with CMP instruction
if (rD.s <= rS.s) goto label;
// Conditional branch combined with OR instruction (also negation is valid)
if (rD == 0) goto label;
if (!rD) goto label;
if (rD.s < 0) goto label;
```

The above code will always generate `BRcc` and `NOP`. If you want to avoid the `NOP`, use `combine` block:

```cpp
// Conditional branch combined with another instruction
combine { if (cc) goto label; instr; }
```

Remember that `cc` in `combine` block uses ALU flags from before the `combine` block.


Example:

```cpp
r1 <=> r2;
if (eq) goto label;
```

### Encoding

```
|   .   .   .   |   .   .   |   .   .   .   .   .   .   .   .   | 
| 0   0   1   0 |    cc     |              offset               |
|   .   .   .   |   .   .   |   .   .   .   .   .   .   .   .   | 
```

Where `offset` is relative to the current program counter (PC) and specifies the distance to the target `label` as signed value.

## IO Operations

## ALU binary operations

| Instruction | Operations | `C` | `Z` | `N`  | Opcode |
|-------------|-------------|-------------|-------------|-------------|---------|
| SUB  | `R = rD - rS`, `rD = R`      | R[M + 1] | R[0:M] == 0 | R[M] | 0000
| SUBC | `R = rD - rS - C`, `rD = R`  | R[M + 1] | (R[0:M] == 0) && Z | R[M] | 0001
| ADD  | `R = rD + rS`, `rD = R`      | R[M + 1] | R[0:M] == 0 | R[M] | 0010
| ADDC | `R = rD + rS + C`, `rD = R`  | R[M + 1] | (R[0:M] == 0) && Z | R[M] | 0011
| AND  | `R = rD & rS`, `rD = R`      | - | R == 0 | R[M] | 0100
| OR   | `R = rD \| rS`, `rD = R`      | - | R == 0 | R[M] | 0101
| XOR  | `R = rD ^ rS`, `rD = R`      | - | R == 0 | R[M] | 0110
| MUL  | `R = rD * rS`, `rD = R` | - | R == 0 | R[M] | 0111
| CMP  | `R = rD - rS`              | R[M + 1]      | R[0:M] == 0 | R[M] | 1000
| CMPC | `R = rD - rS - C`          | R[M + 1] | (R[0:M] == 0) && Z | R[M] | 1001

* `M = 31` for 32-bit CPU
* `M = 15` for 16-bit CPU


### Encoding

```
|15  14  13  12  11  10 | 9   8   7   6 | 5   4   3 | 2   1   0 |
|   '   '   '   '   '   |   '   '   '   |   '   '   |   '   '   | 
| 0   0   0   0   0   1 |    Opcode     |    rS     |    rD     |
```

## ALU unary operations

| Instruction | Operations | `C` | `Z` | `N`  | Opcode |
|-------------|-------------|-------------|-------------|-------------|---------|
| NOT  | `R = ~rS`, `rD = R`      | - | R == 0 | R[M] | 1010
| NEG  | `R = 0 - rS`, `rD = R`  | R[M] | R[0:M] == 0 | R[M] | 1011
| SIGN8 | `R[0:7] = rS[0:7]`, `R[8:M] = repeat rS[7]`, `rD = R`   | - | R == 0 | R[M] | 1100
| SIGN16 (16-bit CPU) | `R = repeat rS[15]`, `rD = R`   | - | R == 0 | R[M] | 1101
| SIGN16 (32-bit CPU) | `R[0:15] = rS[0:15]`, `R[16:M] = repeat rS[15]`, `rD = R`   | - | R == 0 | R[M] | 1101

* `M = 31` for 32-bit CPU
* `M = 15` for 16-bit CPU



### Encoding

```
|15  14  13  12  11  10 | 9   8   7   6 | 5   4   3 | 2   1   0 |
|   '   '   '   '   '   |   '   '   '   |   '   '   |   '   '   | 
| 0   0   0   0   0   1 |    Opcode     |    rS     |    rD     |
```
