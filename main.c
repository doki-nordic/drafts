
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#define HASH_BITS 10
#define HASH_MAX ((1 << HASH_BITS) - 1)
#define HASH_CONST 31321
#define HASH_CONST_POW (HASH_CONST * HASH_CONST)
//#define MAX_COPY_LENGTH 258
//#define MAX_WINDOW_SIZE (32768 - MAX_COPY_LENGTH - 4)
#define MAX_WINDOW_SIZE (4 * 1024)
#define MAX_COPY_LENGTH 114

static uint32_t hash_update(uint32_t hash, uint8_t input, uint8_t output)
{
	return (hash - HASH_CONST_POW * (uint32_t)output) * HASH_CONST + (uint32_t)input;
}


uint8_t input[1024 * 1024];
uint32_t input_size;
uint32_t processed = 0;
uint16_t hash_table[HASH_MAX + 1];

FILE* out;

typedef struct hist_item
{
	int org;
	int count;
	int bits;
	int length;
	struct hist_item* next;
} hist_item;


hist_item value_length_hist[286];
hist_item dist_hist[30];
int extra_bits = 0;

void literal(uint8_t data) {
	value_length_hist[data].count++;
	if (data != '`') {
		fwrite(&data, 1, 1, out);
	} else {
		fprintf(out, "`%d-%d`", 0, 0);
	}
}

void copy(uint32_t offset, uint32_t length) {
	
	uint32_t code;
	
	fprintf(out, "`%d-%d`", offset, length);

	if (length < 11) {
		code = 257 + length - 3;
	} else if (length < 19) {
		code = 265 + (length - 11) / 2;
		extra_bits += 1;
	} else if (length < 35) {
		code = 269 + (length - 19) / 4;
		extra_bits += 2;
	} else if (length < 67) {
		code = 273 + (length - 35) / 8;
		extra_bits += 3;
	} else if (length < 131) {
		code = 277 + (length - 67) / 16;
		extra_bits += 4;
	} else if (length < 258) {
		code = 281 + (length - 131) / 32;
		extra_bits += 5;
	} else {
		code = 285;
	}
	value_length_hist[code].count++;

	if (offset < 5) {
		code = offset - 1;
	} else {
		uint32_t last_matching = 6;
		uint32_t bits = 1;
		code = 4;
		while (offset > last_matching)
		{
			if (code & 1) {
				bits++;
			}
			code++;
			last_matching += 1 << bits;
		}
		extra_bits += bits;
	}
	dist_hist[code].count++;

}

uint32_t match_length(uint8_t* a, uint8_t* b, uint32_t max_length) {
	uint32_t result;

	if (max_length > MAX_COPY_LENGTH) {
		max_length = MAX_COPY_LENGTH;
	}

	for (result = 3; result < max_length; result++) {
		if (a[result] != b[result]) {
			return result;
		}
	}

	return max_length;
}

void compress() {
	int i;
	uint32_t full_hash = 0;
	uint32_t hash;
	uint32_t before_process;
	uint32_t copy_length;
	uint8_t data;
	uint32_t position;

	value_length_hist[256].count = 1;

	memset(hash_table, 0, sizeof(hash_table));

	if (input_size > 3) {
		full_hash = (uint32_t)input[0] * HASH_CONST_POW +
			    (uint32_t)input[1] * HASH_CONST +
			    (uint32_t)input[2];
		hash = full_hash & HASH_MAX;
	}

	while (processed + 3 < input_size) {

		data = input[processed];
		position = (uint32_t)hash_table[hash] | (processed & 0xFFFF0000);

		if (position > processed) {
			position -= 0x10000;
		}

		before_process = processed;

		if (position < processed && position + MAX_WINDOW_SIZE >= processed &&
		    input[position] == data && input[position + 1] == input[processed + 1] &&
		    input[position + 2] == input[processed + 2]) {
			copy_length = match_length(&input[position], &input[processed], input_size - processed);
			copy(processed - position, copy_length);
			processed += copy_length;
			if (processed + 3 >= input_size) {
				break;
			}
		} else {
			literal(data);
			processed++;
		}

		while (before_process < processed) {
			hash_table[hash] = before_process;
			full_hash = hash_update(full_hash, input[before_process + 3], input[before_process]);
			hash = full_hash & HASH_MAX;
			before_process++;
		}
	}

	while (processed < input_size) {
		literal(input[processed]);
		processed++;
	}

	//literal(256); // end of block
}

hist_item* best_item(hist_item* items, int count) {
	hist_item* best = NULL;
	for (int i = 0; i < count; i++) {
		if (items[i].count > 0 && (best == NULL || items[i].count < best->count)) {
			best = &items[i];
		}
	}
	return best;
}

hist_item* inc_length(hist_item* item) {
	do {
		item->length++;
		if (item->next == NULL) {
			return item;
		}
		item = item->next;
	} while (1);
}

int cmp_int_desc(const void* a, const void* b) {
	return *(const int*)b - *(const int*)a;
}

int cmp_hist_item_asc(const void* a, const void* b) {
	return (int)((const hist_item*)a)->count - (int)((const hist_item*)b)->count;
}

int cmp_hist_item_deflate(const void* aa, const void* bb) {
	const hist_item* a = (const hist_item*)aa;
	const hist_item* b = (const hist_item*)bb;
	if (a->length == b->length) {
		return a->org - b->org;
	} else {
		return a->length - b->length;
	}
}

void set_code_length(char *str, int length) {
	int i;
	for (i = strlen(str); i < length; i++) {
		strcat(str, "0");
	}
}

void inc_code(char *str) {
	int i = strlen(str) - 1;
	while (i >= 0) {
		if (str[i] == '0') {
			str[i] = '1';
			break;
		} else {
			str[i] = '0';
			i--;
		}
	}
}

int huffman_stats(hist_item* items, int count) {
	int i;
	do {
		hist_item* item1 = best_item(items, count);
		int tmp = item1->count;
		item1->count = 0;
		hist_item* item2 = best_item(items, count);
		item1->count = tmp;
		if (item2 == NULL) {
			//extra_bits += item1->bits;
			break;
		}
		//printf("0x%02X <= 0x%02X\n", (int)(item1 - items), (int)(item2 - items));
		hist_item* last = inc_length(item1);
		inc_length(item2);
		last->next = item2;
		item1->count = item1->count + item2->count;
		item1->bits = item1->bits + item2->bits + item1->count;
		item2->count = 0;
		item2->bits = 0;
	} while (1);

	int lengths[300];
	hist_item ordered[300];
	
	for (i = 0; i < count; i++) {
		lengths[i] = items[i].length;
		ordered[i].org = i;
		ordered[i].count = items[i].org;
	}
	qsort(lengths, count, sizeof(lengths[0]), cmp_int_desc);
	qsort(ordered, count, sizeof(ordered[0]), cmp_hist_item_asc);
	for (i = 0; i < count; i++) {
		printf("%d\n", lengths[i]);
	}
	printf("---\n");
	while (lengths[0] > 15) {
		int first = lengths[0];
		i = 2;
		while (lengths[i] == first)
		{
			i++;
		}
		lengths[i - 2]--;
		lengths[i - 1]--;
		while (lengths[i] == first - 1) {
			i++;
		}
		lengths[i]++;
		lengths[i - 1] = lengths[i];
	}
	for (i = 0; i < count; i++) {
		ordered[i].length = lengths[i];
		printf("%2d    %6d\n", lengths[i], ordered[i].count);
	}
	printf("---\n");
	qsort(ordered, count, sizeof(ordered[0]), cmp_hist_item_deflate);
	char code[64] = "";
	for (i = 0; i < count; i++) {
		set_code_length(code, ordered[i].length);
		printf("%2d    %6d      0x%03X     %s\n", ordered[i].length, ordered[i].count, ordered[i].org, code);
		inc_code(code);
		extra_bits += ordered[i].length * ordered[i].count;
	}
	printf("====================================\n");
}

int main() {
	int i;
	FILE* f = fopen("app_update.bin", "rb");
	//FILE* f = fopen("main.c", "rb");
	input_size = fread(input, 1, sizeof(input), f);
	fclose(f);
	printf("Input size: %d\n", input_size);
	out = fopen("out.txt", "wb");
	compress();
	fclose(out);
	for (i = 0; i < sizeof(value_length_hist) / sizeof(value_length_hist[0]); i++) {
		value_length_hist[i].org = value_length_hist[i].count;
	}
	for (i = 0; i < sizeof(dist_hist) / sizeof(dist_hist[0]); i++) {
		dist_hist[i].org = dist_hist[i].count;
	}
	huffman_stats(value_length_hist, 280);
	huffman_stats(dist_hist, 24);
	for (i = 0; i < sizeof(value_length_hist) / sizeof(value_length_hist[0]); i++) {
		//printf("0x%02X  %5d      %5d %s\n", i, value_length_hist[i].org, value_length_hist[i].length, value_length_hist[i].length >= 15 ? "!!!" : "");
	}
	for (i = 0; i < sizeof(dist_hist) / sizeof(dist_hist[0]); i++) {
		//printf("0x%02X  %5d      %5d %s\n", i, dist_hist[i].org, dist_hist[i].length, value_length_hist[i].length >= 15 ? "!!!" : "");
	}
	int size = (extra_bits + 7) / 8;
	printf("%d (%0.2fKB)\n", size, (double)size / 1024.0);
	printf("%0.1f%%\n", (double)(input_size - size) / (double)input_size * 100.0);
	return 0;
}

/*
Assumed compression ratio   67%-71%  72%-77%
Compression gain            33%-29%  28%-23%
Page size                         4        4
Total size                      256      256
Bootloader size                  32       32
Available size                  224      224
Compressed image                 92       96
Application image               128      124

Compare with no-compression:
 Application image              108      108
 Application image gain          20       16
 Application image gain %       19%      15%

app_update.bin:  293855 => 202810 (31.0%)
*/
