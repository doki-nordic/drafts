`timescale 1ns/1ps
`default_nettype none

module rppu_pc_control_tb #(
     parameter int CPU_BITS = 32
);

    localparam int PC_WIDTH = 9;

    localparam logic [1:0] PC_SOURCE_NORMAL = 2'd0;
    localparam logic [1:0] PC_SOURCE_JOB    = 2'd1;
    localparam logic [1:0] PC_SOURCE_REG    = 2'd2;

    logic                clk;
     logic [CPU_BITS-1:0] reg_value;
    logic [4:0]          job;
    logic [8:0]          imm_offset;
    logic                branch_taken;
    logic [1:0]          pc_source;
     logic                en;
     logic [PC_WIDTH-1:0] next_pc;
    logic [PC_WIDTH-1:0] pc;

    rppu_pc_control #(
          .PC_WIDTH(PC_WIDTH),
          .CPU_BITS(CPU_BITS)
    ) dut (
        .clk(clk),
        .reg_value(reg_value),
        .job(job),
        .imm_offset(imm_offset),
        .branch_taken(branch_taken),
        .pc_source(pc_source),
            .en(en),
            .next_pc(next_pc),
        .pc(pc)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        $dumpfile("build/rppu_pc_control.vcd");
        $dumpvars(0, rppu_pc_control_tb);

        reg_value   = '0;
        job         = '0;
        imm_offset  = '0;
        branch_taken = 1'b0;
        pc_source   = PC_SOURCE_JOB;
     en          = 1'b0;

     step("job source", PC_SOURCE_JOB, CPU_BITS'(32'hdead_beef), 5'd5,
             9'd100, 1'b1, 9'd10);
        step("normal increment", PC_SOURCE_NORMAL, '0, '0,
             '0, 1'b0, 9'd11);
        step("positive branch", PC_SOURCE_NORMAL, '0, '0,
             9'd5, 1'b1, 9'd16);
        step("negative branch", PC_SOURCE_NORMAL, '0, '0,
             9'h1fd, 1'b1, 9'd13);
     step("register source", PC_SOURCE_REG, CPU_BITS'(32'hdead_beef), '0,
             9'd100, 1'b1, 9'h0ef);
        step("maximum job index", PC_SOURCE_JOB, '0, 5'd31,
             '0, 1'b0, 9'd62);
        step("reserved source uses normal path", 2'd3, '0, '0,
             '0, 1'b0, 9'd63);
        step("register source truncates to PC width", PC_SOURCE_REG,
             '1, '0, '0, 1'b0, 9'h1ff);
        step("normal increment wraps", PC_SOURCE_NORMAL, '0, '0,
             '0, 1'b0, 9'd0);
        step("negative branch wraps", PC_SOURCE_NORMAL, '0, '0,
             9'h1ff, 1'b1, 9'h1ff);
     check_disabled_update();

        $display("");
        $display("=======================================");
        $display("rppu_pc_control_tb: ALL TESTS PASSED");
        $display("=======================================");
        $finish;
    end

    task automatic step(
        input string               test_name,
        input logic [1:0]          test_source,
     input logic [CPU_BITS-1:0] test_reg_value,
        input logic [4:0]          test_job,
        input logic [8:0]          test_offset,
        input logic                test_branch_taken,
        input logic [PC_WIDTH-1:0] expected_pc
    );
        @(negedge clk);
        pc_source    = test_source;
        reg_value    = test_reg_value;
        job          = test_job;
        imm_offset   = test_offset;
        branch_taken = test_branch_taken;
          en            = 1'b1;

          #1;
          if (next_pc !== expected_pc)
               $fatal(1, "FAIL: %s next_pc: got 0x%03h, expected 0x%03h",
                       test_name, next_pc, expected_pc);

        @(posedge clk);
        #1;
        if (pc !== expected_pc)
               $fatal(1, "FAIL: %s pc: got 0x%03h, expected 0x%03h",
                   test_name, pc, expected_pc);
          $display("PASS: %s next_pc/pc = 0x%03h", test_name, pc);
    endtask

     task automatic check_disabled_update;
          logic [PC_WIDTH-1:0] held_pc;

          held_pc = pc;
          @(negedge clk);
          pc_source    = PC_SOURCE_REG;
          reg_value    = CPU_BITS'(32'h0000_0123);
          job          = '0;
          imm_offset   = '0;
          branch_taken = 1'b0;
          en            = 1'b0;

          #1;
          if (next_pc !== 9'h123)
               $fatal(1, "FAIL: disabled next_pc: got 0x%03h, expected 0x123",
                       next_pc);

          @(posedge clk);
          #1;
          if (pc !== held_pc)
               $fatal(1, "FAIL: disabled update changed pc: got 0x%03h, expected 0x%03h",
                       pc, held_pc);
          $display("PASS: disabled update holds pc = 0x%03h", pc);
     endtask

endmodule

`default_nettype wire
