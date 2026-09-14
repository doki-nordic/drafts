TOP       := rppu_registers_tb
BUILD_DIR := build

VERILATOR := verilator
GTKWAVE   := gtkwave

SV_SOURCES := \
	src/rppu_registers.sv \
	sim/rppu_registers_tb.sv

VCD := $(BUILD_DIR)/rppu_registers.vcd
SIM := $(BUILD_DIR)/V$(TOP)
SIM_16 := $(BUILD_DIR)/V$(TOP)_16

ALU_TOP     := rppu_alu_tb
ALU_SOURCES := src/rppu_alu.sv sim/rppu_alu_tb.sv
ALU_HEADERS := src/rppu_alu_flags.svh src/rppu_alu_ops.svh
ALU_SIM     := $(BUILD_DIR)/V$(ALU_TOP)
ALU_NO_MUL_SIM := $(BUILD_DIR)/V$(ALU_TOP)_no_mul
ALU_16_SIM := $(BUILD_DIR)/V$(ALU_TOP)_16
ALU_16_NO_MUL_SIM := $(BUILD_DIR)/V$(ALU_TOP)_16_no_mul

COND_TOP     := rppu_cond_dec_tb
COND_SOURCES := src/rppu_cond_dec.sv sim/rppu_cond_dec_tb.sv
COND_HEADERS := src/rppu_alu_flags.svh
COND_SIM     := $(BUILD_DIR)/V$(COND_TOP)

PC_TOP     := rppu_pc_control_tb
PC_SOURCES := src/rppu_pc_control.sv sim/rppu_pc_control_tb.sv
PC_SIM     := $(BUILD_DIR)/V$(PC_TOP)
PC_16_SIM  := $(BUILD_DIR)/V$(PC_TOP)_16

MEM_TOP     := rppu_prog_mem_tb
MEM_SOURCES := src/rppu_prog_mem.sv sim/rppu_prog_mem_tb.sv
MEM_SIM     := $(BUILD_DIR)/V$(MEM_TOP)

.PHONY: all run run-alu run-cond run-pc run-mem clean

all: $(SIM)

$(SIM): $(SV_SOURCES) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		--Mdir $(BUILD_DIR)/obj_dir \
		-o ../V$(TOP) \
		--top-module $(TOP) \
		-Wall \
		-Wno-fatal \
		$(SV_SOURCES)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)


run: run-regs run-alu run-cond run-pc run-mem
	echo "Done"

$(SIM_16): $(SV_SOURCES) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		--Mdir $(BUILD_DIR)/obj_dir_regs_16 \
		-o ../V$(TOP)_16 \
		--top-module $(TOP) \
		-GCPU_BITS=16 \
		-Wall \
		-Wno-fatal \
		$(SV_SOURCES)

run-regs: all $(SIM_16)
	./$(SIM)
	./$(SIM_16)
	# $(GTKWAVE) $(VCD)

$(ALU_SIM): $(ALU_SOURCES) $(ALU_HEADERS) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		-Isrc \
		--Mdir $(BUILD_DIR)/obj_dir_alu \
		-o ../V$(ALU_TOP) \
		--top-module $(ALU_TOP) \
		-Wall \
		-Wno-fatal \
		$(ALU_SOURCES)

$(ALU_NO_MUL_SIM): $(ALU_SOURCES) $(ALU_HEADERS) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		-Isrc \
		--Mdir $(BUILD_DIR)/obj_dir_alu_no_mul \
		-o ../V$(ALU_TOP)_no_mul \
		--top-module $(ALU_TOP) \
		-GENABLE_MUL=0 \
		-Wall \
		-Wno-fatal \
		$(ALU_SOURCES)

$(ALU_16_SIM): $(ALU_SOURCES) $(ALU_HEADERS) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		-Isrc \
		--Mdir $(BUILD_DIR)/obj_dir_alu_16 \
		-o ../V$(ALU_TOP)_16 \
		--top-module $(ALU_TOP) \
		-GCPU_BITS=16 \
		-Wall \
		-Wno-fatal \
		$(ALU_SOURCES)

$(ALU_16_NO_MUL_SIM): $(ALU_SOURCES) $(ALU_HEADERS) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		-Isrc \
		--Mdir $(BUILD_DIR)/obj_dir_alu_16_no_mul \
		-o ../V$(ALU_TOP)_16_no_mul \
		--top-module $(ALU_TOP) \
		-GCPU_BITS=16 \
		-GENABLE_MUL=0 \
		-Wall \
		-Wno-fatal \
		$(ALU_SOURCES)

run-alu: $(ALU_SIM) $(ALU_NO_MUL_SIM) $(ALU_16_SIM) $(ALU_16_NO_MUL_SIM)
	./$(ALU_SIM)
	./$(ALU_NO_MUL_SIM)
	./$(ALU_16_SIM)
	./$(ALU_16_NO_MUL_SIM)

$(COND_SIM): $(COND_SOURCES) $(COND_HEADERS) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		-Isrc \
		--Mdir $(BUILD_DIR)/obj_dir_cond \
		-o ../V$(COND_TOP) \
		--top-module $(COND_TOP) \
		-Wall \
		-Wno-fatal \
		$(COND_SOURCES)

run-cond: $(COND_SIM)
	./$(COND_SIM)

$(PC_SIM): $(PC_SOURCES) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		--Mdir $(BUILD_DIR)/obj_dir_pc \
		-o ../V$(PC_TOP) \
		--top-module $(PC_TOP) \
		-Wall \
		-Wno-fatal \
		$(PC_SOURCES)

$(PC_16_SIM): $(PC_SOURCES) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		--Mdir $(BUILD_DIR)/obj_dir_pc_16 \
		-o ../V$(PC_TOP)_16 \
		--top-module $(PC_TOP) \
		-GCPU_BITS=16 \
		-Wall \
		-Wno-fatal \
		$(PC_SOURCES)

run-pc: $(PC_SIM) $(PC_16_SIM)
	./$(PC_SIM)
	./$(PC_16_SIM)

$(MEM_SIM): $(MEM_SOURCES) | $(BUILD_DIR)
	$(VERILATOR) \
		--binary \
		--timing \
		--trace \
		--Mdir $(BUILD_DIR)/obj_dir_mem \
		-o ../V$(MEM_TOP) \
		--top-module $(MEM_TOP) \
		-Wall \
		-Wno-fatal \
		$(MEM_SOURCES)

run-mem: $(MEM_SIM)
	./$(MEM_SIM)

clean:
	rm -rf $(BUILD_DIR)
