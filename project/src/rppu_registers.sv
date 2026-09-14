`timescale 1ns/1ps
`default_nettype none


module rppu_registers #(
    parameter int REGS_COUNT = 8,
    parameter int CPU_BITS = 32
) (
    input  logic        clk,

    input  logic [2:0]  a_addr,
    input  logic [2:0]  b_addr,
    // Read enable signals are currently reserved for future use.
    // verilator lint_off UNUSEDSIGNAL
    input  logic        a_re,
    input  logic        b_re,
    // verilator lint_on UNUSEDSIGNAL
    output logic [CPU_BITS-1:0] a,
    output logic [CPU_BITS-1:0] b,

    input  logic [2:0]  x_addr,
    input  logic [CPU_BITS-1:0] x,
    input  logic        x_we
);
    // Validate REGS_COUNT parameter.
    initial begin
        if ((REGS_COUNT < 4) || (REGS_COUNT > 8))
            $fatal(1, "REGS_COUNT must be between 4 and 8, got %0d", REGS_COUNT);
        if ((CPU_BITS != 16) && (CPU_BITS != 32))
            $fatal(1, "CPU_BITS must be 16 or 32, got %0d", CPU_BITS);
    end

    // Actual register storage.
    logic [CPU_BITS-1:0] registers [0:REGS_COUNT-1];

    // Asynchronous reads.
    always_comb begin
        // TODO: Maybe mux that repeats values for addresses below REGS_COUNT will generate simpler hardware.
        // e.g. 6 regs: 000:0, 001:1, 010:2, 011:3, 100:4, 101:5, 110:2, 111:3
        // which is equivalent of: 000:0, 001:1, x10:2, x11:3, 100:4, 101:5
        a = '0;
        b = '0;
        if (32'(a_addr) < REGS_COUNT)
            a = registers[a_addr];

        if (32'(b_addr) < REGS_COUNT)
            b = registers[b_addr];
    end

    // Synchronous write on the rising edge.
    always_ff @(posedge clk) begin
        // TODO: Similar optimization as in the read mux might be possible here.
        // e.g. 6 regs: 000:0, 001:1, x10:2, x11:3, 100:4, 101:5
        if (x_we && (32'(x_addr) < REGS_COUNT))
            registers[x_addr] <= x;
    end

endmodule


`default_nettype wire
