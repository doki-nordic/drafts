`timescale 1ns/1ps
`default_nettype none


module rppu_pc_control #(
    parameter int PC_WIDTH = 9,
    parameter int CPU_BITS = 32
) (
    input  logic                clk,
    // Only the low PC_WIDTH bits are used as the register-sourced address.
    // verilator lint_off UNUSEDSIGNAL
    input  logic [CPU_BITS-1:0] reg_value,
    // verilator lint_on UNUSEDSIGNAL
    input  logic [4:0]          job,
    input  logic [8:0]          imm_offset,
    input  logic                branch_taken,
    input  logic [1:0]          pc_source,
    input  logic                en,
    output logic [PC_WIDTH-1:0] next_pc,
    output logic [PC_WIDTH-1:0] pc
);

    localparam logic [1:0] PC_SOURCE_NORMAL = 2'd0;
    localparam logic [1:0] PC_SOURCE_JOB    = 2'd1;
    localparam logic [1:0] PC_SOURCE_REG    = 2'd2;

    logic [PC_WIDTH-1:0] normal_pc;
    logic [PC_WIDTH-1:0] branch_offset;

    initial begin
        if ((CPU_BITS != 16) && (CPU_BITS != 32))
            $fatal(1, "CPU_BITS must be 16 or 32, got %0d", CPU_BITS);
    end

    always_comb begin
        branch_offset = PC_WIDTH'($signed(imm_offset));
        normal_pc = pc + (branch_taken ? branch_offset : PC_WIDTH'(1));
        case (pc_source)
            PC_SOURCE_NORMAL: begin
                next_pc = normal_pc;
            end
            PC_SOURCE_JOB: begin
                next_pc = PC_WIDTH'({job, 1'b0});
            end
            PC_SOURCE_REG: begin
                next_pc = PC_WIDTH'(reg_value);
            end
            default: begin
                next_pc = normal_pc;
            end
        endcase
    end

    always_ff @(posedge clk) begin
        if (en) begin
            pc <= next_pc;
        end
    end

endmodule

`default_nettype wire
