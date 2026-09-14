`timescale 1ns/1ps
`default_nettype none

module rppu_cond_dec_tb;

    `include "rppu_alu_flags.svh"

    logic [2:0] flags;
    logic [2:0] condition;
    logic       condition_met;

    rppu_cond_dec dut (
        .flags(flags),
        .condition(condition),
        .condition_met(condition_met)
    );

    initial begin
        for (int flag_value = 0; flag_value < 8; flag_value++) begin
            for (int condition_value = 0; condition_value < 8; condition_value++) begin
                flags     = flag_value[2:0];
                condition = condition_value[2:0];
                #1;

                if (condition_met !== expected_condition(flags, condition)) begin
                    $fatal(1,
                        "FAIL: flags=%03b condition=%03b: got %b, expected %b",
                        flags, condition, condition_met,
                        expected_condition(flags, condition));
                end
            end
        end

        $display("");
        $display("=====================================");
        $display("rppu_cond_dec_tb: ALL TESTS PASSED");
        $display("=====================================");
        $finish;
    end

    function automatic logic expected_condition(
        input logic [2:0] test_flags,
        input logic [2:0] test_condition
    );
        logic expected;

        expected = test_condition[0];
        case (test_condition[2:1])
            ALU_FLAG_ZERO:
                return test_flags[ALU_FLAG_ZERO] == expected;
            ALU_FLAG_NEGATIVE:
                return test_flags[ALU_FLAG_NEGATIVE] == expected;
            ALU_FLAG_INVALID:
                return 1'b0 == expected;
            default:
                return test_flags[ALU_FLAG_CARRY] == expected;
        endcase
    endfunction

endmodule

`default_nettype wire
