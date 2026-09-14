`timescale 1ns/1ps
`default_nettype none

module rppu_alu_tb #(
    parameter bit ENABLE_MUL = 1'b1,
    parameter int CPU_BITS = 32
);

    `include "rppu_alu_flags.svh"
    `include "rppu_alu_ops.svh"

    logic        clk;
    logic [CPU_BITS-1:0] a;
    logic [CPU_BITS-1:0] b;
    logic [3:0]  op;
    logic        en;
    logic [CPU_BITS-1:0] r;
    logic        ready;
    logic [2:0]  flags;

    rppu_alu #(
        .ENABLE_MUL(ENABLE_MUL),
        .CPU_BITS(CPU_BITS)
    ) dut (
        .clk(clk),
        .a(a),
        .b(b),
        .op(op),
        .en(en),
        .r(r),
        .ready(ready),
        .flags(flags)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        $dumpfile("build/rppu_alu.vcd");
        $dumpvars(0, rppu_alu_tb);

        a  = '0;
        b  = '0;
        op = ALU_OP_ADD;
        en = 1'b0;

        execute("add", ALU_OP_ADD, CPU_BITS'(20), CPU_BITS'(22), CPU_BITS'(42), 3'b000);
        execute("add carry", ALU_OP_ADD, '1, CPU_BITS'(1), '0, 3'b011);
        execute("add with carry", ALU_OP_ADDC, CPU_BITS'(1), CPU_BITS'(2), CPU_BITS'(4), 3'b000);

        execute("subtract without borrow", ALU_OP_SUB, CPU_BITS'(5), CPU_BITS'(3), CPU_BITS'(2), 3'b001);
        execute("subtract with carry", ALU_OP_SUBC, CPU_BITS'(5), CPU_BITS'(3), CPU_BITS'(2), 3'b001);
        execute("subtract with borrow", ALU_OP_SUB, CPU_BITS'(1), CPU_BITS'(2),
            '1, 3'b100);
        execute("subtract with carry-in clear", ALU_OP_SUBC, CPU_BITS'(5), CPU_BITS'(3),
            CPU_BITS'(1), 3'b001);

        execute("and", ALU_OP_AND, CPU_BITS'(32'hf0f0_55aa), CPU_BITS'(32'h0ff0_0f0f),
            CPU_BITS'(32'h00f0_050a), 3'b001);
        execute("or", ALU_OP_OR, CPU_BITS'(32'hf000_5000), CPU_BITS'(32'h0f00_00aa),
            CPU_BITS'(32'hff00_50aa), CPU_BITS == 16 ? 3'b001 : 3'b101);
        execute("xor", ALU_OP_XOR, CPU_BITS'(32'haaaa_5555), CPU_BITS'(32'hffff_0000),
            CPU_BITS'(32'h5555_5555), 3'b001);

        if (ENABLE_MUL)
            execute("multiply low word", ALU_OP_MUL, CPU_BITS'(16'h0100), CPU_BITS'(16'h0101),
                CPU_BITS == 16 ? CPU_BITS'(16'h0100) : CPU_BITS'(32'h0001_0100), 3'b001);
        else
            execute("disabled multiply holds result", ALU_OP_MUL,
                CPU_BITS'(16'h0100), CPU_BITS'(16'h0101), CPU_BITS'(32'h5555_5555), 3'b001);

        execute("not", ALU_OP_NOT, '0, CPU_BITS'(32'h0f0f_00ff),
            CPU_BITS'(32'hf0f0_ff00), 3'b101);
        execute("negate", ALU_OP_NEG, '0, CPU_BITS'(1),
            '1, 3'b101);
        execute("sign extend 8-bit", ALU_OP_SIGNEX8, '0, CPU_BITS'(8'h80),
            CPU_BITS'(32'hffff_ff80), 3'b101);
        execute("sign extend 16-bit", ALU_OP_SIGNEX16, '0, CPU_BITS'(16'h8001),
            CPU_BITS'(32'hffff_8001), 3'b101);

        execute("compare aliases subtract", ALU_OP_CMP, CPU_BITS'(9), CPU_BITS'(4),
            CPU_BITS'(5), 3'b001);
        execute("compare with carry aliases sbc", ALU_OP_CMPC, CPU_BITS'(9), CPU_BITS'(4),
            CPU_BITS'(5), 3'b001);

        check_hold_when_disabled();

        $display("");
        $display("================================");
        $display("rppu_alu_tb: ALL TESTS PASSED");
        $display("================================");

        #10;
        $finish;
    end

    task automatic execute(
        input string       test_name,
        input logic [3:0]  test_op,
        input logic [CPU_BITS-1:0] test_a,
        input logic [CPU_BITS-1:0] test_b,
        input logic [CPU_BITS-1:0] expected_r,
        input logic [2:0]  expected_flags
    );
        @(negedge clk);
        op = test_op;
        a  = test_a;
        b  = test_b;
        en = 1'b1;

        @(posedge clk);
        #1;
        check_equal(test_name, r, expected_r);
        check_bit({test_name, " ready"}, ready, 1'b1);
        check_bit({test_name, " carry"}, flags[ALU_FLAG_CARRY],
                  expected_flags[ALU_FLAG_CARRY]);
        check_bit({test_name, " zero"}, flags[ALU_FLAG_ZERO],
                  expected_flags[ALU_FLAG_ZERO]);
        check_bit({test_name, " negative"}, flags[ALU_FLAG_NEGATIVE],
                  expected_flags[ALU_FLAG_NEGATIVE]);
    endtask

    task automatic check_hold_when_disabled;
        logic [CPU_BITS-1:0] held_r;
        logic [2:0]  held_flags;

        held_r     = r;
        held_flags = flags;
        @(negedge clk);
        a  = CPU_BITS'(32'hdead_beef);
        b  = CPU_BITS'(32'h1234_5678);
        op = ALU_OP_ADD;
        en = 1'b0;

        @(posedge clk);
        #1;
        check_equal("disabled operation holds result", r, held_r);
        if (flags !== held_flags)
            $fatal(1, "FAIL: disabled operation changed flags");
        check_bit("disabled operation keeps ready set", ready, 1'b1);
    endtask

    task automatic check_equal(
        input string       test_name,
        input logic [CPU_BITS-1:0] actual,
        input logic [CPU_BITS-1:0] expected
    );
        if (actual !== expected)
            $fatal(1, "FAIL: %s: got 0x%0h, expected 0x%0h",
                   test_name, actual, expected);
        $display("PASS: %s = 0x%0h", test_name, actual);
    endtask

    task automatic check_bit(
        input string test_name,
        input logic  actual,
        input logic  expected
    );
        if (actual !== expected)
            $fatal(1, "FAIL: %s: got %b, expected %b",
                   test_name, actual, expected);
    endtask

endmodule

`default_nettype wire
