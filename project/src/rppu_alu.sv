`timescale 1ns/1ps
`default_nettype none


module rppu_alu #(
    parameter bit ENABLE_MUL = 1'b1,
    parameter int CPU_BITS = 32
) (
    input  logic        clk,
    input  logic [CPU_BITS-1:0] a,
    input  logic [CPU_BITS-1:0] b,
    input  logic [3:0]  op,
    input  logic        en,
    output logic [CPU_BITS-1:0] r,
    output logic        ready,
    output logic [2:0]  flags
);

    `include "rppu_alu_flags.svh"
    `include "rppu_alu_ops.svh"

    logic [CPU_BITS-1:0] next_r;
    logic [2:0]  next_flags;
    logic [CPU_BITS:0] arithmetic_result;
    logic [CPU_BITS-1:0] multiply_result;

    initial begin
        if ((CPU_BITS != 16) && (CPU_BITS != 32))
            $fatal(1, "CPU_BITS must be 16 or 32, got %0d", CPU_BITS);
    end

    generate
        if (ENABLE_MUL) begin : gen_mul
            always_comb multiply_result = a * b;
        end
        else begin : gen_no_mul
            always_comb multiply_result = r;
        end
    endgenerate

    always_comb begin
        ready             = 1'b1;
        next_r            = r;
        next_flags        = flags;
        arithmetic_result = '0;

        case (op)
            ALU_OP_SUB, ALU_OP_CMP: begin
                arithmetic_result      = {1'b0, a} - {1'b0, b};
                next_r                 = arithmetic_result[CPU_BITS-1:0];
                next_flags[ALU_FLAG_CARRY] = ~arithmetic_result[CPU_BITS];
                next_flags[ALU_FLAG_ZERO]  = (next_r == '0);
            end
            ALU_OP_SUBC, ALU_OP_CMPC: begin
                arithmetic_result      = {1'b0, a} - {1'b0, b}
                                         - {{CPU_BITS{1'b0}}, ~flags[ALU_FLAG_CARRY]};
                next_r                 = arithmetic_result[CPU_BITS-1:0];
                next_flags[ALU_FLAG_CARRY] = ~arithmetic_result[CPU_BITS];
                next_flags[ALU_FLAG_ZERO]  = (next_r == '0) & flags[ALU_FLAG_ZERO];
            end
            ALU_OP_ADD: begin
                arithmetic_result      = {1'b0, a} + {1'b0, b};
                next_r                 = arithmetic_result[CPU_BITS-1:0];
                next_flags[ALU_FLAG_CARRY] = arithmetic_result[CPU_BITS];
                next_flags[ALU_FLAG_ZERO]  = (next_r == '0);
            end
            ALU_OP_ADDC: begin
                arithmetic_result      = {1'b0, a} + {1'b0, b}
                                         + {{CPU_BITS{1'b0}}, flags[ALU_FLAG_CARRY]};
                next_r                 = arithmetic_result[CPU_BITS-1:0];
                next_flags[ALU_FLAG_CARRY] = arithmetic_result[CPU_BITS];
                next_flags[ALU_FLAG_ZERO]  = (next_r == '0) & flags[ALU_FLAG_ZERO];
            end
            ALU_OP_AND: begin
                next_r = a & b;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_OR:  begin
                next_r = a | b;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_XOR: begin
                next_r = a ^ b;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_MUL: begin
                next_r = multiply_result;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_NOT: begin
                next_r = ~b;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_NEG: begin
                next_r = -b;
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_SIGNEX8: begin
                next_r = {{(CPU_BITS-8){b[7]}}, b[7:0]};
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            ALU_OP_SIGNEX16: begin
                next_r = {{(CPU_BITS-16){b[15]}}, b[15:0]};
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
            default: begin
                next_flags[ALU_FLAG_ZERO] = (next_r == '0);
            end
        endcase
        next_flags[ALU_FLAG_NEGATIVE] = next_r[CPU_BITS-1];
    end

    always_ff @(posedge clk) begin
        if (en) begin
            r     <= next_r;
            flags <= next_flags;
        end
    end

endmodule

`default_nettype wire
