`timescale 1ns/1ps
`default_nettype none

module rppu_prog_mem #(
    parameter int PC_WIDTH = 9
) (
    input  logic                clk,

    input  logic [PC_WIDTH-1:0] addr,
    input  logic                re,
    output logic [15:0]         data,

    input  logic [PC_WIDTH-1:0] wr_addr,
    input  logic                we,
    input  logic [15:0]         wr_data
);
    localparam int INSTRUCTION_COUNT = 2 ** PC_WIDTH;

    logic [15:0] memory [0:INSTRUCTION_COUNT-1];

    logic                pending_write = 1'b0;
    logic [PC_WIDTH-1:0] pending_wr_addr;
    logic [15:0]         pending_wr_data;

    always_ff @(posedge clk) begin
        if (re) begin
            data <= memory[addr];
        end
        else if (pending_write) begin
            memory[pending_wr_addr] <= pending_wr_data;
            pending_write           <= 1'b0;
        end
        if (we) begin
            pending_write   <= 1'b1;
            pending_wr_addr <= wr_addr;
            pending_wr_data <= wr_data;
        end
    end

endmodule

`default_nettype wire
