const { spawn } = require('child_process');
const { TextDecoder } = require('util');
const fs = require('fs');

let changingState = false;
let outputBuffer = '';

let totalTime = 0;
let lastUpdate = Date.now();
let countingState = true;
let startup = true;
let ignoreLock = false;

function log(counting, text, optional) {
	let fd;
	let fileWriteStart;
	let newLineCode = '\n'.charCodeAt(0);

	function openAndGetLastLine() {
		fd = fs.openSync(file, 'r+');
		let fileSize = fs.fstatSync(fd).size;
		let arrBuf = new ArrayBuffer(256);
		let arr = new Uint8Array(arrBuf);
		let part = Math.min(fileSize, 256);
		fs.readSync(fd, arr, 0, part, fileSize - part);
		let pos = arr.lastIndexOf(newLineCode);
		if (pos == part - 1) {
			fileWriteStart = fileSize;
			arr[part - 1] = 0;
			pos = arr.lastIndexOf(newLineCode);
		} else {
			fileWriteStart = fileSize - part + pos + 1;
		}
		if (pos < 0) {
			fileWriteStart = fileSize;
			pos = part;
		} else {
			pos = pos + 1;
		}
		let line = (new TextDecoder()).decode(new DataView(arrBuf, pos)).trim();
		return line;
	}

	function pad2(x) {
		let p = '00' + x;
		return p.substring(p.length - 2);
	}

	date = new Date();
	let day = `${date.getFullYear()}-${pad2(date.getMonth())}-${pad2(date.getDate())}`;
	let time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
	let file = `logs/${day}.log`;
	if (!fs.existsSync(file)) {
		fs.writeFileSync(file, '');
		log(true, "Start a day");
	}

	let lastLine = openAndGetLastLine();

	if (startup) {
		startup = false;
		let m = lastLine.match(/[0-9]{2}:[0-9]{2}:[0-9]{2}\s+([0-9]{2}):([0-9]{2}):([0-9]{2})/);
		if (m) {
			totalTime = 1000 * (parseInt(m[3]) + 60 * (parseInt(m[2]) + 60 * parseInt(m[1])));
		} else {
			totalTime = 0;
		}
		countingState = false;
		counting = true;
	}

	if (countingState) {
		totalTime += (date.getTime() - lastUpdate);
	}
	lastUpdate = date.getTime();
	if (counting === null) counting = countingState;
	countingState = counting;

	let h = Math.round(totalTime / 1000);
	let lh = h - 7.5 * 60 * 60;

	let s = pad2(h % 60);
	h = Math.floor(h / 60);
	let m = pad2(h % 60);
	h = pad2(Math.floor(h / 60));

	let sign = lh > 0 ? '+' : '-';
	lh = Math.abs(lh);
	let ls = pad2(lh % 60);
	lh = Math.floor(lh / 60);
	let lm = pad2(lh % 60);
	lh = pad2(Math.floor(lh / 60));

	let outputLine = `${time}    ${h}:${m}:${s}    ${countingState ? 'Y' : 'N'}    ${text}${optional ? '' : '\n'}`;
	let consoleLine = `\r${time}    ${h}:${m}:${s}    ${sign}${lh}:${lm}:${ls}    ${countingState ? 'Y' : 'N'}    ${optional ? '' : text}${optional ? '' : '\n'}                      `;

	process.stdout.write(consoleLine);

	let buf = Buffer.from(outputLine, 'UTF-8');
	fs.writeSync(fd, buf, 0, buf.length, fileWriteStart);
	fs.ftruncateSync(fd, fileWriteStart + buf.length);
	fs.closeSync(fd);
}


const monitor = spawn('dbus-monitor', [`--session`, `type='signal',interface='org.gnome.ScreenSaver'`]);


monitor.stdout.on('data', (data) => {
	outputBuffer += data.toString();
	let pos = outputBuffer.indexOf('\n');
	while (pos >= 0) {
		let m;
		let line = outputBuffer.substr(0, pos);
		outputBuffer = outputBuffer.substr(pos + 1);
		if (line.match(/member=ActiveChanged/)) {
			changingState = true;
		} else if (changingState && (m = line.match(/boolean\s+(true|false)/i))) {
			let value = (m[1].toLowerCase() == 'true');
			if (ignoreLock) {
				log(null, `Ignored Lock Screen ${value ? 'On' : 'Off'}`);
			} else {
				log(!value, `Lock Screen ${value ? 'On' : 'Off'}`);
			}
			changingState = false;
		} else {
			changingState = false;
		}
		pos = outputBuffer.indexOf('\n');
	}
});

monitor.stderr.on('data', (data) => {
});

monitor.on('close', (code) => {
	console.log(`child process exited with code ${code}`);
});


log(null, `Keep alive`, true);

setInterval(() => {
	log(null, `Keep alive`, true);
}, 10 * 1000);



var stdin = process.stdin;

// without this, we would only get streams once enter is pressed
stdin.setRawMode(true);

// resume stdin in the parent process (node app won't quit all by itself
// unless an error or process.exit() happens)
stdin.resume();

// i don't want binary, do you?
stdin.setEncoding('utf8');

// on any data into stdin
stdin.on('data', function (key) {
	// ctrl-c ( end of text )
	if (key === '\u0003') {
		process.exit();
	}
	if (key == ' ') {
		ignoreLock = !ignoreLock;
		log(null, ignoreLock ? `Ignoring Screen Locks: On` : `Ignoring Screen Locks: Off`, false);
	}
});