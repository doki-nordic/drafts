/*
 * The following tests are base on preprocessor tests from clang.
 * They are not exact copy, they are adjusted to this project.
 *
 * https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor
 */

// https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor/SOURCE_DATE_EPOCH.c

// ===================== timestamp
// expect: const char date[] = "Jan  1 1970";
// expect: const char time[] = "00:00:00";
// expect: const char timestamp[] = "Thu Jan  1 00:00:00 1970";
const char date[] = __DATE__; // date and time are fixed in this preprocessor
const char time[] = __TIME__;
const char timestamp[] = __TIMESTAMP__;

// https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor/annotate_in_macro_arg.c

// =====================
#define M1()

// --------------------- unterminated macro args
// expect error: ???
M1(

// --------------------- no value in if
// expect error: ???
#if M1()
#endif

// https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor/macro_arg_directive.c

// ===================== define in args
// expect: enum { n = 5 }
#define a(x) enum { x }
a(n =
#undef a
#define a 5
  a);

// ===================== pragma in args
// expect:
#define M(A)
M(
#pragma pack(pop) // no error, this preprocessor ignores #pragma
)

// https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor/macro_arg_empty.c

// ===================== macro arg empty
// expect: [] [ ] [ ] [ ] [ ] [ ] [] [ ] [ ]
#define FOO(x) x
#define BAR(x) x x
#define BAZ(x) [x] [ x] [x ]
[FOO()] [ FOO()] [FOO() ] [BAR()] [ BAR()] [BAR() ] BAZ()

// https://github.com/llvm/llvm-project/blob/ac9d34a2eed4c4d58edf25b92e397faa76170d00/clang/test/Preprocessor/macro_arg_keyword.c

// ===================== macro arg keyword
// expect: xxx-xxx
#define foo(return) return-return
foo(xxx)
