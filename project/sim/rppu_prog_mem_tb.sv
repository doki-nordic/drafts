`timescale 1ns/1ps
`default_nettype none

module rppu_prog_mem_tb;

    localparam int PC_WIDTH = 9;

    logic                clk;
    logic [PC_WIDTH-1:0] addr;
    logic                re;
    logic [15:0]         data;
    logic [PC_WIDTH-1:0] wr_addr;
    logic                we;
    logic [15:0]         wr_data;

    rppu_prog_mem #(
        .PC_WIDTH(PC_WIDTH)
    ) dut (
        .clk(clk),
        .addr(addr),
        .re(re),
        .data(data),
        .wr_addr(wr_addr),
        .we(we),
        .wr_data(wr_data)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        $dumpfile("build/rppu_prog_mem.vcd");
        $dumpvars(0, rppu_prog_mem_tb);

        addr    = '0;
        re      = 1'b0;
        wr_addr = '0;
        we      = 1'b0;
        wr_data = '0;

        write_word(9'd0, 16'h1234);
        write_word(9'h1ff, 16'hbeef);
        read_word("read first address", 9'd0, 16'h1234);
        check_read_disabled_holds_data();
        read_word("read last address", 9'h1ff, 16'hbeef);

        write_word(9'd17, 16'haaaa);
        collide_read_write(9'd17, 16'haaaa, 16'h5555);
        continue_read_while_write_pending();
        commit_pending_write();
        read_word("read deferred write", 9'd17, 16'h5555);

        write_word(9'd18, 16'h0f0f);
        enqueue_write(9'd18, 16'hf0f0);
        read_word("write is pending after enqueue", 9'd18, 16'h0f0f);
        commit_pending_write();
        read_word("read committed queued write", 9'd18, 16'hf0f0);

        $display("");
        $display("====================================");
        $display("rppu_prog_mem_tb: ALL TESTS PASSED");
        $display("====================================");
        $finish;
    end

    task automatic write_word(
        input logic [PC_WIDTH-1:0] test_addr,
        input logic [15:0]         test_data
    );
        enqueue_write(test_addr, test_data);

        @(negedge clk);
        re = 1'b0;

        @(posedge clk);
        #1;
    endtask

    task automatic enqueue_write(
        input logic [PC_WIDTH-1:0] test_addr,
        input logic [15:0]         test_data
    );
        @(negedge clk);
        re      = 1'b0;
        we      = 1'b1;
        wr_addr = test_addr;
        wr_data = test_data;

        @(posedge clk);
        #1;
        we = 1'b0;
    endtask

    task automatic read_word(
        input string               test_name,
        input logic [PC_WIDTH-1:0] test_addr,
        input logic [15:0]         expected_data
    );
        @(negedge clk);
        addr = test_addr;
        re   = 1'b1;
        we   = 1'b0;

        @(posedge clk);
        #1;
        check_equal(test_name, data, expected_data);
    endtask

    task automatic check_read_disabled_holds_data;
        logic [15:0] held_data;

        held_data = data;
        @(negedge clk);
        re   = 1'b0;
        addr = 9'h1ff;

        @(posedge clk);
        #1;
        check_equal("disabled read holds data", data, held_data);
    endtask

    task automatic collide_read_write(
        input logic [PC_WIDTH-1:0] test_addr,
        input logic [15:0]         expected_read_data,
        input logic [15:0]         deferred_data
    );
        @(negedge clk);
        addr    = test_addr;
        re      = 1'b1;
        wr_addr = test_addr;
        wr_data = deferred_data;
        we      = 1'b1;

        @(posedge clk);
        #1;
        check_equal("collision gives read priority", data, expected_read_data);
        we = 1'b0;
    endtask

    task automatic continue_read_while_write_pending;
        @(negedge clk);
        addr = 9'd0;
        re   = 1'b1;

        @(posedge clk);
        #1;
        check_equal("pending write waits during read", data, 16'h1234);
    endtask

    task automatic commit_pending_write;
        logic [15:0] held_data;

        held_data = data;
        @(negedge clk);
        re = 1'b0;

        @(posedge clk);
        #1;
        check_equal("pending-write cycle holds read data", data, held_data);
    endtask

    task automatic check_equal(
        input string       test_name,
        input logic [15:0] actual,
        input logic [15:0] expected
    );
        if (actual !== expected)
            $fatal(1, "FAIL: %s: got 0x%04h, expected 0x%04h",
                   test_name, actual, expected);
        $display("PASS: %s = 0x%04h", test_name, actual);
    endtask

endmodule

`default_nettype wire
