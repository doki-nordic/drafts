`timescale 1ns/1ps
`default_nettype none


module rppu_cond_dec (
    input  logic [2:0]  flags,
    input  logic [2:0]  condition,
    output logic        condition_met
);

    `include "rppu_alu_flags.svh"

    logic       expected;
    logic [1:0] flag_index;

    always_comb expected = condition[0];
    always_comb flag_index = condition[2:1];

    always_comb begin
        case (flag_index)
            ALU_FLAG_CARRY: begin
                condition_met = (flags[ALU_FLAG_CARRY] == expected);
            end
            ALU_FLAG_ZERO: begin
                condition_met = (flags[ALU_FLAG_ZERO] == expected);
            end
            ALU_FLAG_NEGATIVE: begin
                condition_met = (flags[ALU_FLAG_NEGATIVE] == expected);
            end
            ALU_FLAG_INVALID: begin
                condition_met = (1'd0 == expected);
            end
        endcase
    end

endmodule

`default_nettype wire
