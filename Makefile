

all: icmsg_test

run: all
	./icmsg_test

icmsg_test: *.cpp *.h Makefile
	g++ -m32 -I. main.cpp -Os -o icmsg_test
