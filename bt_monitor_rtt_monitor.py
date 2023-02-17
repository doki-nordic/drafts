#!/usr/bin/env python3

import binascii
from pathlib import Path
import platform
import argparse
import math
import os
import random
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import traceback
from textwrap import dedent
from time import sleep
from types import SimpleNamespace

# python -m venv _bt_monitor_rtt_venv
# pip install pywin32

is_windows = platform.system().lower() == 'windows'

class PipeInterface:
    def create(self) -> str: pass
    def get_name(self) -> str: pass
    def open(self, write: bool, name: str = None) -> None: pass
    def close(self) -> None: pass
    def read1(self, size: int) -> 'bytes|None': pass
    def write(self, data: 'bytes|bytearray') -> None: pass

def createPipeWinClass():
    # Put imports in a function to avoid missing modules on non-Windows platforms
    import win32pipe, win32file, pywintypes

    class PipeWin(PipeInterface):
        def __init__(self) -> None:
            self.name = None
            self.server = False
            self.handle = None
            self.thread = None

        def create(self, write: bool) -> str:
            self.name = r'\\.\pipe\rtt_hci_' + binascii.hexlify(random.randbytes(16)).decode()
            self.server = True
            self.handle = win32pipe.CreateNamedPipe(
                self.name,
                win32pipe.PIPE_ACCESS_OUTBOUND if write else win32pipe.PIPE_ACCESS_INBOUND,
                win32pipe.PIPE_TYPE_BYTE | win32pipe.PIPE_READMODE_BYTE | win32pipe.PIPE_WAIT,
                1, 65536, 65536, 0, None)
            if self.handle == win32file.INVALID_HANDLE_VALUE:
                self.handle = None
                self.server = False
                self.name = None
                raise IOError(f'Cannot create named pipe on "{self.name}"')
            return self.name

        def get_name(self):
            return self.name

        def open(self, write: bool, name: str = None) -> None:
            if (name is None) and (self.name is None):
                raise ValueError()
            self.name = self.name or name
            if self.server:
                state = 0
                def timeout():
                    nonlocal state
                    sleep(3)
                    if state == 0:
                        state = 2
                        if log: log('Timeout while waiting for pipe client')
                        temp_handle = win32file.CreateFile(
                            self.name,
                            win32file.GENERIC_READ if write else win32file.GENERIC_WRITE,
                            0, None, win32file.OPEN_EXISTING, 0, None)
                        win32file.CloseHandle(self.handle)
                        win32file.CloseHandle(temp_handle)
                threading.Thread(target=timeout, daemon=True).start()
                if log: log('Waiting for client of named pipe')
                win32pipe.ConnectNamedPipe(self.handle, None)
                if log: log('Done')
                if state == 2:
                    raise TimeoutError()
                else:
                    state = 1
            elif self.handle is not None:
                raise ValueError()
            else:
                self.handle = win32file.CreateFile(
                    self.name,
                    win32file.GENERIC_WRITE if write else win32file.GENERIC_READ,
                    0, None, win32file.OPEN_EXISTING, 0, None)
                if self.handle == win32file.INVALID_HANDLE_VALUE:
                    self.handle = None
                    raise IOError(f'Cannot open named pipe "{self.name}"')
            if write:
                def check_writeable():
                    while True:
                        sleep(0.5)
                        handle = self.handle
                        if handle is None:
                            return
                        try:
                            win32file.WriteFile(handle, b'')
                        except:
                            import win32console
                            win32console.GenerateConsoleCtrlEvent(win32console.CTRL_BREAK_EVENT, os.getpid())
                            if log: log('Write File error!')
                            return
                self.thread = threading.Thread(target=check_writeable)
                self.thread.start()

        def is_closed(self) -> bool:
            return self.handle is None

        def read1(self, size: int) -> 'bytes|None':
            rc, data = win32file.ReadFile(self.handle, size)
            if rc != 0:
                raise BrokenPipeError(f'Cannot read from pipe "{self.name}"')
            return data
                
        def write(self, data: 'bytes|bytearray') -> None:
            if isinstance(data, bytearray):
                data = bytes(data)
            offset = 0
            while offset < len(data):
                rc, written = win32file.WriteFile(self.handle, data if offset == 0 else data[offset:])
                if rc != 0:
                    raise BrokenPipeError(f'Cannot write to pipe "{self.name}"')
                offset += written

        def flush(self) -> None:
            pass

        def close(self) -> None:
            if self.handle is not None:
                win32file.CloseHandle(self.handle)
                self.handle = None
            self.name = None
            self.server = False
            self.handle = None
            if (self.thread is not None) and self.thread.is_alive():
                self.thread.join()

    return PipeWin
        

class Pipe(PipeInterface):
    def __init__(self) -> None:
        self.name = None
        self.delete_on_close = False
        self.fd = None

    def create(self, write: bool) -> str:
        self.name = tempfile.mktemp(prefix='rtt-hci-fifo-')
        os.mkfifo(self.name)
        self.delete_on_close = True
        return self.name

    def get_name(self) -> str:
        return self.name

    def open(self, write: bool, name: str = None) -> None:
        if ((name is None) and (self.name is None)) or (self.fd is not None):
            raise ValueError()
        self.name = self.name or name
        self.fd = open(self.name, 'wb' if write else 'rb')

    def is_closed(self) -> bool:
        return (self.fd is None) or (self.fd.closed)

    def close(self) -> None:
        try:
            if (self.fd is not None) and (not self.fd.closed):
                self.fd.close()
        finally:
            if self.delete_on_close:
                try:
                    os.unlink(self.name)
                except:
                    pass
            self.name = None
            self.delete_on_close = False
            self.fd = None

    def read1(self, size: int) -> 'bytes|None':
        self.fd.read1(size)

    def write(self, data: 'bytes|bytearray') -> None:
        self.fd.write(data)
    
    def flush(self) -> None:
        self.fd.flush()

if is_windows:
    try:
        Pipe = createPipeWinClass()
    except:
        pass # TODO: something different


MAX_PACKET_DATA_LENGTH = 300 # TODO: Check specification

ADAPTER_ID = 0


BT_LOG_ERR = 3
BT_LOG_WARN = 4
BT_LOG_INFO = 6
BT_LOG_DBG = 7

BT_MONITOR_NEW_INDEX = 0
#BT_MONITOR_DEL_INDEX = 1
BT_MONITOR_COMMAND_PKT = 2
BT_MONITOR_EVENT_PKT = 3
BT_MONITOR_ACL_TX_PKT = 4
BT_MONITOR_ACL_RX_PKT = 5
BT_MONITOR_SCO_TX_PKT = 6
BT_MONITOR_SCO_RX_PKT = 7
BT_MONITOR_OPEN_INDEX = 8
BT_MONITOR_CLOSE_INDEX = 9
#BT_MONITOR_INDEX_INFO = 10
BT_MONITOR_VENDOR_DIAG = 11
BT_MONITOR_SYSTEM_NOTE = 12
BT_MONITOR_USER_LOGGING = 13
BT_MONITOR_ISO_TX_PKT = 18
BT_MONITOR_ISO_RX_PKT = 19
BT_MONITOR_NOP = 255

HCI_H4_CMD = 0x01
HCI_H4_ACL = 0x02
HCI_H4_SCO = 0x03
HCI_H4_EVT = 0x04
HCI_H4_ISO = 0x05

OPCODE_TO_HCI_H4 = {
    BT_MONITOR_COMMAND_PKT: (HCI_H4_CMD, 0),
    BT_MONITOR_EVENT_PKT: (HCI_H4_EVT, 1),
    BT_MONITOR_ACL_TX_PKT: (HCI_H4_ACL, 0),
    BT_MONITOR_ACL_RX_PKT: (HCI_H4_ACL, 1),
    BT_MONITOR_ISO_TX_PKT: (HCI_H4_ISO, 0),
    BT_MONITOR_ISO_RX_PKT: (HCI_H4_ISO, 1),
    BT_MONITOR_SCO_TX_PKT: (HCI_H4_SCO, 0),
    BT_MONITOR_SCO_RX_PKT: (HCI_H4_SCO, 1),
}

BT_MONITOR_MAX_OPCODE = 20

BT_MONITOR_EXT_HDR_MAX = 24

BT_MONITOR_COMMAND_DROPS = 1
BT_MONITOR_EVENT_DROPS = 2
BT_MONITOR_ACL_RX_DROPS = 3
BT_MONITOR_ACL_TX_DROPS = 4
BT_MONITOR_SCO_RX_DROPS = 5
BT_MONITOR_SCO_TX_DROPS = 6
BT_MONITOR_OTHER_DROPS = 7

DROP_NAME = {
    BT_MONITOR_COMMAND_DROPS: 'COMMAND',
    BT_MONITOR_EVENT_DROPS: 'EVENT',
    BT_MONITOR_ACL_RX_DROPS: 'ACL_RX',
    BT_MONITOR_ACL_TX_DROPS: 'ACL_TX',
    BT_MONITOR_SCO_RX_DROPS: 'SCO_RX',
    BT_MONITOR_SCO_TX_DROPS: 'SCO_TX',
    BT_MONITOR_OTHER_DROPS: 'OTHER',
}

BT_MONITOR_TS32 = 8

BT_MONITOR_DROPS_MIN = 1
BT_MONITOR_DROPS_MAX = 7

MONITOR_TS_FREQ = 10000

# Convinience class for arguments autocompletion
class Args(SimpleNamespace):
    extcap_interfaces: bool
    extcap_dlts: bool
    extcap_config: bool
    capture: bool
    device: str
    iface: str
    speed: str
    channel: str
    snr: str
    addr: str
    logger: str
    debug: str
    fifo: str
    pip_install: str
    def __init__(self, src):
        super(Args, self).__init__(**src.__dict__)


# Arguments parsing
parser = argparse.ArgumentParser(allow_abbrev=False)
# Main commands
parser.add_argument('--extcap-interfaces', action='store_true')
parser.add_argument('--extcap-dlts', action='store_true')
parser.add_argument('--extcap-config', action='store_true')
parser.add_argument('--capture', action='store_true')
# Configuration
parser.add_argument('--device')
parser.add_argument('--iface', default='SWD')
parser.add_argument('--speed', default='4000')
parser.add_argument('--channel', default='1')
parser.add_argument('--snr')
parser.add_argument('--addr')
parser.add_argument('--logger')
parser.add_argument('--debug')
# Capture options
parser.add_argument('--fifo')
# Windows-only flag
parser.add_argument('--pip-install', action='store_true')


args = Args(parser.parse_known_args()[0])


# Debug logging
if args.debug:
    debug_file = open(args.debug, 'w')
    def log(*pargs, **kwargs):
        print(*pargs, **kwargs, file=debug_file)
        debug_file.flush()
else:
    log = False

if log: log('Raw arguments:', sys.argv)
if log: log('Parsed arguments:', args.__dict__)


# Exception indicating termination signal from Wireshark
class SignalTerminated(Exception):
    pass


ignore_signals = False

# Add handler for termination signal from Wireshark
def setup_signal_handler():
    global ignore_signals
    def signal_handler(_, __):
        if not ignore_signals:
            raise SignalTerminated()
    if is_windows:
        signal.signal(signal.SIGBREAK, signal_handler)
    else:
        signal.signal(signal.SIGTERM, signal_handler)


# Global variables that have to be cleaned up even when exception occurs
input_pipe: Pipe = None
output_pipe: Pipe = None
rtt_process = None

class CorruptedException(Exception):
    pass

class Packet:
    opcode: int
    timestamp: float
    drops: 'list[int] | None'
    payload: bytearray
    def __init__(self, opcode, timestamp, drops, payload) -> None:
        self.opcode = opcode
        self.timestamp = timestamp
        self.drops = drops
        self.payload = payload


class InvalidPacket:
    start_offset: int
    end_offset: int
    def __init__(self, start_offset) -> None:
        self.start_offset = start_offset
        self.end_offset = start_offset

class BtmonParser:

    '''
    Parser for btmon compatible capture format.
    It is error tolerant - after corrupted input it is able recover and parse
    valid packets afterwards. The corrupted part of input is returned as InvalidPacket.
    '''

    buffer: bytearray
    total_offset: int
    packets: 'list[Packet|InvalidPacket]'
    resync: bool

    def __init__(self):
        self.buffer = bytearray()
        self.total_offset = 0
        self.packets = []
        self.resync = False

    def parse(self, data: bytes):
        self.buffer += data
        offset = 0
        while len(self.buffer) - offset >= 6:
            if self.resync:
                hdr = self.parse_header(offset)
                if hdr is None:
                    size = 1
                    offset += 1
                    continue
                else:
                    if log: log(f'Sync at {self.total_offset + offset} bytes')
                    if (len(self.packets) > 0) and isinstance(self.packets[-1], InvalidPacket):
                        self.packets[-1].end_offset = self.total_offset + offset
                    self.resync = False
            try:
                size = self.parse_packet(offset)
                offset += size
                if size == 0:
                    break
            except CorruptedException:
                if log: log(f'Invalid at {self.total_offset + offset} bytes')
                if (len(self.packets) == 0) or not isinstance(self.packets[-1], InvalidPacket):
                    self.packets.append(InvalidPacket(self.total_offset + offset))
                size = 1
                offset += 1
                self.resync = True
        if offset > 0:
            self.total_offset += offset
            self.buffer = self.buffer[offset:]

    def parse_header(self, offset):
        hdr = struct.unpack_from('<HHBB', self.buffer, offset)
        if (hdr[0] > MAX_PACKET_DATA_LENGTH) or (hdr[0] < 4) or ((hdr[1] > BT_MONITOR_MAX_OPCODE) and (hdr[1] != BT_MONITOR_NOP)) or (hdr[2] != 0) or (hdr[3] > BT_MONITOR_EXT_HDR_MAX) or (4 + hdr[3] > hdr[0]):
            #TODO: Different payload lengths are allowed for different opcodes
            return None
        return hdr

    def parse_packet(self, offset):
        hdr = self.parse_header(offset)
        if hdr is None:
            raise CorruptedException(f'Corrupted at {self.total_offset + offset}')
        (data_len, opcode, _, hdr_len) = hdr
        if offset + data_len + 2 > len(self.buffer):
            return 0
        hdr_offset = offset + 6
        payload_offset = hdr_offset + hdr_len
        payload_len = data_len - 4 - hdr_len
        timestamp = None
        drops = None
        while hdr_len > 0:
            ext_code = self.buffer[hdr_offset]
            if (ext_code == BT_MONITOR_TS32) and (hdr_len >= 5):
                (timestamp, ) = struct.unpack_from('<L', self.buffer, hdr_offset + 1)
                timestamp /= MONITOR_TS_FREQ
                hdr_len -= 5
                hdr_offset += 5
            elif (ext_code >= BT_MONITOR_DROPS_MIN) and (ext_code <= BT_MONITOR_DROPS_MAX) and (hdr_len >= 2):
                drops = drops or ([0] * (BT_MONITOR_DROPS_MAX + 1))
                drops[ext_code] += self.buffer[hdr_offset + 1]
                hdr_len -= 2
                hdr_offset += 2
            else:
                raise CorruptedException(f'Corrupted at {self.total_offset + offset}')
        if timestamp is None:
            raise CorruptedException(f'Corrupted at {self.total_offset + offset}')
        self.packets.append(Packet(opcode, timestamp, drops, self.buffer[payload_offset:payload_offset+payload_len]))
        return data_len + 2

    def get_packets(self):
        if len(self.packets) == 0:
            result = self.packets
        elif isinstance(self.packets[-1], InvalidPacket):
            result = self.packets[:-1]
            self.packets = self.packets[-1:]
        else:
            result = self.packets
            self.packets = []
        return result

class PcapGenerator:

    output: bytearray
    last_timestamp: float

    def __init__(self):
        self.output = bytearray(b'\xD4\xC3\xB2\xA1\x02\x00\x04\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x04\x00\xFE\x00\x00\x00')
        self.last_timestamp = 0

    def generate(self, packet: 'Packet | InvalidPacket'):
        if isinstance(packet, InvalidPacket):
            self.generate_invalid(packet)
        else:
            self.generate_valid(packet)

    def generate_drops(self, timestamp, drops):
        for i, count in enumerate(drops):
            if count > 0:
                name = DROP_NAME[i] if i in DROP_NAME else 'Some'
                self.generate_capture_log(timestamp, f'{name} packets dropped, count {count}')

    def generate_invalid(self, packet: InvalidPacket):
        self.generate_capture_log(self.last_timestamp, f'Corrupted input detected from offset {packet.start_offset} to {packet.end_offset}')

    def generate_capture_log(self, timestamp, message):
        self.generate_output(timestamp, BT_MONITOR_SYSTEM_NOTE, message.encode('utf-8'))

    def generate_valid(self, packet: Packet):
        if packet.drops is not None:
            self.generate_drops(packet.timestamp, packet.drops)
        self.generate_output(packet.timestamp, packet.opcode, packet.payload)
        self.last_timestamp = packet.timestamp

    def generate_output(self, timestamp, opcode, payload):
        sec = math.floor(timestamp)
        usec = math.floor((timestamp - sec) * 1000000)
        size = 4 + len(payload)
        self.output += struct.pack('<LLLL', sec, usec, size, size)
        self.output += struct.pack('>HH', ADAPTER_ID, opcode)
        self.output += payload

    def get_output(self):
        result = self.output
        if len(self.output) > 0:
            self.output = bytearray()
        return result


def stop_rtt_process():
    global ignore_signals
    def wait_for_exit():
        for i in range(0, 40):
            if rtt_process.poll() is not None:
                if log: log('Done')
                return True
            if log: log('Waiting...')
            sleep(0.3)
        return False
    if (rtt_process is not None) and (rtt_process.returncode is None):
        ignore_signals = True
        if log: log('RTTLogger process still running. Interrupting...')
        if platform.system().lower() == 'windows':
            import win32console
            win32console.GenerateConsoleCtrlEvent(win32console.CTRL_BREAK_EVENT, rtt_process.pid)
        else:
            rtt_process.send_signal(signal.SIGINT)
        if not wait_for_exit():
            if log: log('Cannot interrupt. Terminating...')
            rtt_process.terminate()
            if not wait_for_exit():
                if log: log('Cannot terminate. Killing...')
                rtt_process.kill()
                if not wait_for_exit():
                    if log: log('What? Cannot kill? Better leave it alone.')


def report_error(*pargs, **kwargs):
    global output_pipe
    print(*pargs, **kwargs, file=sys.stderr)
    if output_pipe is None:
        output_pipe = Pipe()
        output_pipe.open(True, args.fifo)


# Capturing
def capture():
    global input_pipe, output_pipe, rtt_process

    # Listen for signals from Wireshark
    setup_signal_handler()

    if log: log('Capturing...')

    # Building JLinkRTTLogger commadn line
    cmd = [
        args.logger if args.logger and args.logger.strip() else 'JLinkRTTLogger',
        '-Device', args.device.strip(),
        '-If', args.iface.strip(),
        '-Speed', args.speed.strip(),
        '-RTTChannel', args.channel.strip(),
    ]
    if args.snr and args.snr.strip():
        cmd.append('-USB')
        cmd.append(args.snr.strip())
    if args.addr and args.addr.strip():
        if args.addr.strip().find(' ') < 0:
            cmd.append('-RTTAddress')
            cmd.append(args.addr.strip())
        else:
            cmd.append('-RTTSearchRanges')
            cmd.append(args.addr.strip())

    input_pipe = Pipe()
    filename = input_pipe.create(False)
    cmd.append(filename)

    if log: log('Temporary FIFO', filename)
    if log: log('Subprocess command', cmd)

    rtt_stdout = open(Path(args.debug).with_suffix('.stdout.txt'), 'wb')

    # Starting child process
    try:
        rtt_process = subprocess.Popen(cmd, stdout=rtt_stdout, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    except:
        report_error(f'Can not start JLinkRTTLogger. Check interface configuration.')
        raise
    if log: log(f'Process created', rtt_process.pid)

    total_bytes = 0
    try:
        try:
            # Open FIFOs
            input_pipe.open(False)
            if log: log('Input Opened')
            output_pipe = Pipe()
            output_pipe.open(True, args.fifo)
            if log: log('Ouput Opened')

            # Write pcap file header to the output
            #output_pipe.write(b'\xD4\xC3\xB2\xA1\x02\x00\x04\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\xC9\x00\x00\x00')
            #if log: log('Header written')

            parse = BtmonParser()
            gen = PcapGenerator()

            # Main capture trasfer loop
            while True:
                pcap_data = gen.get_output()
                if log: log(f'Generated data {len(pcap_data)}')
                if len(pcap_data):
                    output_pipe.write(pcap_data)
                    output_pipe.flush()
                if log: log(f'Write done')
                data = input_pipe.read1(2048)
                if log: log(f'Generated data {len(pcap_data)}')
                if (data is None) or (len(data) == 0):
                    if log: log(f'Data ended from JLinkRTTLogger site after {total_bytes} bytes')
                    break
                total_bytes += len(data)
                if log: log(f'Parsing {len(data)}')
                parse.parse(data)
                for packet in parse.get_packets():
                    if log: log(f'Packet of payload size {len(packet.payload)}')
                    gen.generate(packet)
        except BrokenPipeError:
            if log: log(f'Some pipe was closed')
            # Expecting termination signal if pipe was closed by the Wireshark
            sleep(2)
            raise
    except SignalTerminated:
        if log: log(f'Termination signal after {total_bytes} bytes')
        stop_rtt_process()

def configure_windows(bat_file: Path, venv_dir: Path):
    bat_content = dedent(r'''
        @echo off
        call "%~dpn0_venv\Scripts\activate.bat" || exit /b 99
        python "%~dpn0.py" %*
        ''')
    print(f'Configuring virtual environment for { bat_file.with_suffix("").name }... This can take a few minutes...')
    with open(bat_file, 'w') as fd:
        fd.write(bat_content)
    subprocess.run([sys.executable, '-m', 'venv', str(venv_dir.resolve())], check=True)
    subprocess.run(['cmd.exe', '/c', str(bat_file.resolve()), '--pip-install'], check=True)
    print('Environment for plugin configured. You can use it in Wireshark now.')

def pip_install_windows():
    subprocess.run(['pip.exe', 'install', 'pywin32'], check=True)

# Main function
def main():
    if args.extcap_interfaces:
        print('extcap {version=1.0}{help=https://www.segger.com/supported-devices/jlink/}')
        print('interface {value=bt_hci_rtt}{display=Bluetooth Linux monitor packets over RTT}')
        exit(0)

    if args.extcap_dlts:
        print('dlt {number=254}{name=DLT_BLUETOOTH_LINUX_MONITOR}{display=Bluetooth Linux Monitor}')
        exit(0)

    if args.extcap_config: # TODO: Some versions of Wireshark does not correctly handle {required=true}, so everyting must be optional.
                           # TODO: Make sure that scripts handles any missing parameter, e.g. by passing an error message to Wireshark.
        print(dedent('''
            arg {number=0}{call=--device}{display=Device}{tooltip=Device name - press Help for full list}{type=string}{required=false}{group=Main}
            arg {number=1}{call=--iface}{display=Interface}{tooltip=Target interface}{type=selector}{required=false}{group=Main}
            arg {number=2}{call=--speed}{display=Speed (kHz)}{tooltip=Target speed}{type=integer}{range=5,50000}{default=4000}{required=false}{group=Main}
            arg {number=5}{call=--channel}{display=RTT Channel}{tooltip=RTT channel that monitor uses}{type=integer}{range=1,99}{default=1}{required=false}{group=Main}
            arg {number=3}{call=--snr}{display=Serial Number}{tooltip=Fill if you have more devices connected}{type=string}{required=false}{group=Optional}
            arg {number=4}{call=--addr}{display=RTT Address}{tooltip=Single address or ranges <Rangestart> <RangeSize>[, <Range1Start> <Range1Size>, ...]}{type=string}{required=false}{group=Optional}
            arg {number=6}{call=--logger}{display=JLinkRTTLogger Executable}{tooltip=Select your executable if you do not have in your PATH}{type=fileselect}{mustexist=true}{group=Optional}
            arg {number=7}{call=--debug}{display=Debug output}{tooltip=This is only for debuging this extcap plugin}{type=fileselect}{mustexist=false}{group=Debug}
            value {arg=1}{value=SWD}{display=SWD}{default=true}
            value {arg=1}{value=JTAG}{display=JTAG}{default=false}
            value {arg=1}{value=cJTAG}{display=cJTAG}{default=false}
            value {arg=1}{value=FINE}{display=FINE}{default=false}
        ''').strip())
        exit(0)

    if args.capture:
        capture()
        return

    if args.pip_install:
        pip_install_windows()
        return

    script_file = Path(__file__)
    bat_file = script_file.with_suffix('.bat')
    venv_dir = Path(str(script_file.with_suffix('')) + '_venv')

    if is_windows and (script_file.parent.name == 'extcap') and ((not bat_file.exists()) or (not venv_dir.exists())): # TODO: add switch to force the configuration
        configure_windows(bat_file, venv_dir)
        exit()

    parser.print_usage()
    print(sys.argv)


try:
    main()
except Exception as ex:
    report_error('Unexpected exception occurred. See debug file for details.')
    if log: log(f'Unexpected exception: {str(ex)}')
    if log: log(traceback.format_exc())
finally:
    # Try to cleanup resources
    try:
        stop_rtt_process()
    except:
        if log: log('Error')
        if log: log(traceback.format_exc())
    try:
        if (input_pipe is not None) and (not input_pipe.is_closed()):
            if log: log('Input pipe no closed. Closing...')
            input_pipe.close()
            if log: log('OK')
    except:
        if log: log('Error')
        if log: log(traceback.format_exc())
    try:
        if (output_pipe is not None) and (not output_pipe.is_closed()):
            if log: log('Output pipe no closed. Closing...')
            output_pipe.close()
            if log: log('OK')
    except:
        if log: log('Error')
        if log: log(traceback.format_exc())
    if log:
        log('End of log')
        debug_file.close()
