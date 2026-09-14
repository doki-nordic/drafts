`timescale 1ns/1ps
`default_nettype none

module rppu_registers_tb #(
    parameter int CPU_BITS = 32
);

    localparam int REGS_COUNT = 8;

    logic        clk;

    logic [2:0]  a_addr;
    logic [2:0]  b_addr;
    logic        a_re;
    logic        b_re;
    logic [CPU_BITS-1:0] a;
    logic [CPU_BITS-1:0] b;

    logic [2:0]  x_addr;
    logic [CPU_BITS-1:0] x;
    logic        x_we;

    rppu_registers #(
        .REGS_COUNT(REGS_COUNT),
        .CPU_BITS(CPU_BITS)
    ) dut (
        .clk(clk),

        .a_addr(a_addr),
        .b_addr(b_addr),
        .a_re(a_re),
        .b_re(b_re),
        .a(a),
        .b(b),

        .x_addr(x_addr),
        .x(x),
        .x_we(x_we)
    );

    // 100 MHz clock.
    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        $dumpfile("build/rppu_registers.vcd");
        $dumpvars(0, rppu_registers_tb);

        a_addr = '0;
        b_addr = '0;
        a_re   = 1'b1;
        b_re   = 1'b1;
        x_addr = '0;
        x      = '0;
        x_we   = 1'b0;

        // Write register 1.
        x_addr = 3'd1;
        x      = CPU_BITS'(32'h1234_5678);
        x_we   = 1'b1;
        @(posedge clk);
        #1;
        x_we = 1'b0;

        // Read register 1 immediately, without another clock.
        a_addr = 3'd1;
        #1;
        check_equal("read r1 through port A", a, CPU_BITS'(32'h1234_5678));

        // Write register 5.
        x_addr = 3'd5;
        x      = CPU_BITS'(32'hCAFE_BABE);
        x_we   = 1'b1;
        @(posedge clk);
        #1;
        x_we = 1'b0;

        // Read two registers simultaneously.
        a_addr = 3'd1;
        b_addr = 3'd5;
        #1;
        check_equal("read r1 through port A", a, CPU_BITS'(32'h1234_5678));
        check_equal("read r5 through port B", b, CPU_BITS'(32'hCAFE_BABE));

        // Demonstrate that a_re/b_re currently do not affect reads.
        a_re = 1'b0;
        b_re = 1'b0;
        #1;
        check_equal("read still works with a_re low (reserved)", a, CPU_BITS'(32'h1234_5678));
        check_equal("read still works with b_re low (reserved)", b, CPU_BITS'(32'hCAFE_BABE));

        // Verify that a disabled write does not change a register.
        x_addr = 3'd1;
        x      = CPU_BITS'(32'hDEAD_BEEF);
        x_we   = 1'b0;
        @(posedge clk);
        #1;

        a_addr = 3'd1;
        #1;
        check_equal("disabled write leaves r1 unchanged", a, CPU_BITS'(32'h1234_5678));

        $display("");
        $display("========================================");
        $display("rppu_registers_tb: ALL TESTS PASSED");
        $display("========================================");

        #10;
        $finish;
    end

    task automatic check_equal(
        input string       test_name,
        input logic [CPU_BITS-1:0] actual,
        input logic [CPU_BITS-1:0] expected
    );
        if (actual !== expected) begin
            $error("FAIL: %s: got 0x%0h, expected 0x%0h",
                   test_name, actual, expected);
            $fatal;
        end
        else begin
            $display("PASS: %s = 0x%0h", test_name, actual);
        end
    endtask

endmodule

`default_nettype wire
