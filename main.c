
#include <malloc.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct
{
	const char *line;
	union {
		const char *key;
		struct
		{
			int count;
			int other;
		};
	};
} Line;

static Line *lines;
static int linesSize;
static int linesLength;
static int maxDigits = 1;
static int mul = 1;

static void prepareKey(Line *line)
{
	int len = 0;
	const char *ptr = line->line;
	bool isNum = false;
	int cur = 0;

	line->count = 0;
	line->other = 0;

	do
	{
		if (*ptr >= '0' && *ptr <= '9')
		{
			if (isNum)
			{
				cur++;
			}
			else
			{
				cur = 1;
				line->count++;
			}
			isNum = true;
		}
		else
		{
			line->other++;
			isNum = false;
		}
		if (cur > maxDigits)
		{
			maxDigits = cur;
		}
	} while (*ptr++);
}

static void copyNum(char **dst, const char **ptr)
{
	const char *src = *ptr;
	int append = maxDigits;
	int i;

	while (*src >= '0' && *src <= '9')
	{
		append--;
		src++;
	}

	for (i = 0; i < append; i++)
	{
		*(*dst)++ = '0';
	}

	while (**ptr >= '0' && **ptr <= '9')
	{
		*(*dst)++ = **ptr;
		(*ptr)++;
	}
}

static void createKey(Line *line)
{
	char *key = malloc(line->other + line->count * maxDigits + 100);
	int len = 0;
	const char *ptr = line->line;
	char *dst = key;
	bool isNum = false;
	int cur = 0;

	line->count = 0;
	line->other = 0;

	do
	{
		if (*ptr >= '0' && *ptr <= '9')
		{
			copyNum(&dst, &ptr);
			ptr--;
		}
		else
		{
			*dst++ = *ptr;
		}
	} while (*ptr++);

	line->key = key;
}

int lineCmp(const void *a, const void *b)
{
	const Line *aa = (const Line *)a;
	const Line *bb = (const Line *)b;
	return strcmp(aa->key, bb->key) * mul;
}

int main(int argc, const char *argv[])
{
	lines = malloc(sizeof(Line) * 1024);
	linesSize = 1024;
	linesLength = 0;
	char *line = NULL;
	size_t len = 0;
	ssize_t read;
	int i;
	int maxLines = ((1 << (8 * sizeof(int) - 2)) - 1) * 2;

	for (int i = 1; i < argc; i++)
	{
		if (strcmp(argv[i], "-r") == 0)
		{
			mul = -1;
		}
		else if (strcmp(argv[i], "-1") == 0)
		{
			maxLines = 1;
		}
	}

	while ((read = getline(&line, &len, stdin)) != -1)
	{
		if (linesLength >= linesSize)
		{
			linesSize *= 2;
			lines = realloc(lines, sizeof(Line) * linesSize);
		}
		lines[linesLength].line = strdup(line);
		prepareKey(&lines[linesLength]);
		//printf("%s %d %d %d\n", line, lines[linesLength].count, lines[linesLength].other, maxDigits);
		linesLength++;
	}

	for (i = 0; i < linesLength; i++)
	{
		createKey(&lines[i]);
		//printf("%s%s\n", lines[i].line, lines[i].key);
	}

	qsort(lines, linesLength, sizeof(Line), lineCmp);

	for (i = 0; i < linesLength && i < maxLines; i++)
	{
		printf("%s", lines[i].line);
	}
}
