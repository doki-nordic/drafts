
import numpy as np
import matplotlib.ticker as ticker
import matplotlib.pyplot as plt
from scipy import signal
from pathlib import Path
import os
import math


# ---- User parameters ----
filename = Path(__file__).parent / "capture.iq"        # raw file from hackrf_transfer (-r)
iq_sample_rate = 20000000         # Hz (the -s you used when recording)
iq_center_freq = 2404000000       # Hz (the -f you used when recording)
carrier_frequency = 2402000000    # Hz
#carrier_frequency = 2408000000    # Hz
channel_bw = 2000000              # Hz
sample_decim = 4                  # integer decimation factor
bitrate = 1000000                 # bps
frequency_deviation = 400000      # Hz
preamble_length = 8               # bits
sync_threshold = 0.06             # in fraction of frequency_deviation, tells how much sync pattern
                                  # can deviate from ideal

decimated_sample_rate = iq_sample_rate / sample_decim
samples_per_symbol = decimated_sample_rate / bitrate
demod_cutoff = 0.75 * bitrate

assert float.is_integer(decimated_sample_rate), "Decimated sample rate must be integer"
assert float.is_integer(samples_per_symbol), "Samples per symbol must be integer"
samples_per_symbol = int(samples_per_symbol)
decimated_sample_rate = int(decimated_sample_rate)
print(f"Decimated sample rate: {decimated_sample_rate}, samples per symbol: {samples_per_symbol}")


# ---- Helper: read whole file into complex numpy array ----
def read_iq_file(path):
    raw = np.fromfile(path, dtype=np.int8) #TODO: We may want to parse just part of the file: count=bytes_count, offset=bytes_skip)
    # Interpret as interleaved I,Q
    I = raw[0::2].astype(np.float32) / 128.0
    Q = raw[1::2].astype(np.float32) / 128.0
    return I + 1j * Q

def freq_shift(samples, f_offset_hz, sample_rate_hz):
    """
    Shift 'samples' by -f_offset_hz (so a signal at +f_offset moves to 0).
    """
    n = np.arange(samples.size, dtype=np.float64)
    phase = -2.0 * np.pi * f_offset_hz * n / sample_rate_hz
    mixer = np.exp(1j * phase)
    return samples * mixer

def design_lowpass(sample_rate_hz, cutoff_hz):
    """
    Low-pass FIR.
    """
    nyq = sample_rate_hz / 2.0
    normalized_cutoff = cutoff_hz / nyq
    num_taps = 129  # similar to before; can be adjusted
    taps = signal.firwin(num_taps, normalized_cutoff)
    return taps

def design_channel_filter(sample_rate_hz, channel_bw_hz):
    """
    Design a complex low-pass FIR filter to isolate the GFSK channel.
    channel_bw_hz is approximate occupied bandwidth. We'll set cutoff slightly smaller.
    """
    lp_cutoff = 0.9 * (channel_bw_hz / 2.0)  # for 4 MHz BW -> ~1.8 MHz cutoff
    return design_lowpass(sample_rate_hz, lp_cutoff)

def apply_filter_and_decimate(samples, taps, decim):
    """
    Apply FIR filter 'taps' and decimate by integer factor 'decim'.
    """
    # lfilter will convolve FIR over complex samples (taps are real)
    samples = signal.lfilter(taps, 1.0, samples)
    # Decimate by keeping every 'decim'-th sample
    samples = samples[::decim]
    return samples

def fm_demod(samples, sample_rate_hz):
    """
    Simple quadrature FM demodulator.
    Input: complex baseband samples
    Output: real-valued 'frequency-like' signal
    """
    # x[n] * conj(x[n-1])
    # For first sample, we can assume previous sample is 0 or equal to first.
    # Easiest: start from n=1 to avoid boundary issues.
    x = samples
    # Multiply current sample by conjugate of previous sample
    prod = x[1:] * np.conj(x[:-1])
    # The angle of prod is the phase difference
    demod = np.angle(prod)
    # Convert frequency deviation to Hz
    return demod * sample_rate_hz / (2 * np.pi)

def design_sync_detector(samples_per_symbol: int, pattern: int, pattern_len_bits: int, bigendian: bool=True):
    # bits = [
    #     -np.ones(shape=(samples_per_symbol,), dtype=np.float32) / samples_per_symbol / pattern_len_bits,
    #     np.ones(shape=(samples_per_symbol,), dtype=np.float32) / samples_per_symbol / pattern_len_bits,
    # ]
    # bits[0][0] = 0.0
    # bits[0][-1] = 0.0
    # bits[1][0] = 0.0
    # bits[1][-1] = 0.0
    bit_window = signal.windows.tukey(samples_per_symbol, alpha=0.7)
    bits = [
        -bit_window / bit_window.sum() / pattern_len_bits,
        bit_window / bit_window.sum() / pattern_len_bits,
    ]
    bit_list = []
    for i in range(pattern_len_bits):
        bit = (pattern >> i) & 0x1
        bit_list.append(bits[bit])
    if bigendian:
        bit_list.reverse()
    sync_waveform = np.concatenate(bit_list)
    return sync_waveform

def plot_spectrum(x, Fs, title=""):
    N = 6553600
    x_seg = x[:N]
    window = np.hanning(N)
    X = np.fft.fftshift(np.fft.fft(x_seg * window))
    freqs = np.fft.fftshift(np.fft.fftfreq(N, 1/Fs))
    psd = 20 * np.log10(np.abs(X) + 1e-12)
    plt.figure()
    plt.plot(freqs, psd)
    plt.xlabel("Frequency [Hz]")
    plt.ylabel("Amplitude [dB]")
    plt.title(title)
    plt.grid(True)
    plt.show()

def plot_float_time_domain(x, Fs, title=""):
    t = np.arange(x.size) / Fs
    plt.figure()
    plt.plot(t, x, label="Real")
    plt.xlabel("Time [s]")
    plt.ylabel("Amplitude")
    plt.title(title)
    plt.legend()
    plt.grid(True)
    plt.show()

def plot_float_time_domain2(x1, x2, Fs, title=""):
    plt.figure()
    plt.plot(np.arange(x1.size) / Fs, x1, label="Before")
    plt.plot(np.arange(x2.size) / Fs, x2, label="After")
    plt.xlabel("Time [s]")
    plt.ylabel("Amplitude")
    plt.title(title)
    plt.legend()
    plt.grid(True)
    plt.show()

def plot_float_time_domain3(x1, x2, x3, Fs, title=""):
    plt.figure()
    plt.plot(np.arange(x1.size) / Fs, x1, label="Before")
    plt.plot(np.arange(x2.size) / Fs, x2, label="After")
    plt.plot(np.arange(x3.size) / Fs, x3, label="Third")
    plt.xlabel("Time [s]")
    plt.ylabel("Amplitude")
    plt.title(title)
    plt.legend()
    plt.grid(True)
    plt.show()

def block_convolve(samples, win):
    N = samples.size
    W = win.size
    # Number of full windows
    n_blocks = N // W
    if n_blocks == 0:
        return np.array([], dtype=samples.dtype)
    # Truncate to a multiple of W
    trimmed = samples[:n_blocks * W]
    # Reshape into (n_blocks, W)
    blocks = trimmed.reshape(n_blocks, W)
    # Compute dot product of each block with win
    # Equivalent to convolution with step W
    result = blocks @ win
    return result

def power_time_average(x, sample_rate_hz, window_us=10.0):
	"""
	Compute time-averaged power over non-overlapping windows.
	x: complex baseband
	window_us: averaging window in microseconds
	Returns:
	t_centers: time in seconds at center of each window
	p_avg: average power per window
	"""
	x = np.asarray(x)
	N = x.size
	win_len = int(window_us * 1e-6 * sample_rate_hz)
	if win_len <= 0:
		win_len = 1
	n_windows = N // win_len
	x = x[:n_windows * win_len]
	x_reshaped = x.reshape(n_windows, win_len)

	p_avg = np.mean(np.abs(x_reshaped)**2, axis=1)

	# Time center of each window
	t_centers = (np.arange(n_windows) * win_len + win_len/2) / sample_rate_hz
	return t_centers, p_avg

if __name__ == "__main__":

    # plot_float_time_domain3(
    #     signal.windows.tukey(samples_per_symbol + 1, alpha=0.7),
    # #     signal.windows.tukey(samples_per_symbol * 7, alpha=0.1),
    #     signal.windows.gaussian(samples_per_symbol + 1, std=samples_per_symbol/4),
    #     signal.windows.hamming(samples_per_symbol + 1),
    #     1.0, "Hamming window example")
    # exit()

    print("Reading file (may take memory)...")
    samples = read_iq_file(filename)
    samples = samples[:723100*8]
    print(f"Read {samples.size} complex samples")

    f_offset = carrier_frequency - iq_center_freq
    print(f"Shifting frequency by {f_offset/1000000} MHz")
    #plot_spectrum(samples, iq_sample_rate, "Before shift")
    samples = freq_shift(samples, f_offset, iq_sample_rate)
    #plot_spectrum(samples, iq_sample_rate, "After shift")

    print(f"Filtering for band {channel_bw/1000000} MHz and decimating by {sample_decim}...")
    #plot_spectrum(samples, iq_sample_rate, "Before filtering/decimation")
    taps = design_channel_filter(iq_sample_rate, channel_bw)
    samples = apply_filter_and_decimate(samples, taps, sample_decim)
    unmodulated = samples
    #plot_spectrum(samples, decimated_sample_rate, "After filtering/decimation")
    print(f"Left {samples.size} complex samples")

    print("Simple FM demodulating...")
    samples = fm_demod(samples, decimated_sample_rate)
    # before = samples
    taps = design_lowpass(decimated_sample_rate, demod_cutoff)
    samples = apply_filter_and_decimate(samples, taps, 1)
    samples = samples[len(taps):]
    # plot_float_time_domain2(before[0:500000], samples[0+len(taps)//2:500000+len(taps)//2], decimated_sample_rate, "FM demodulated signal")

    limit_start = 33400 * 4 // sample_decim
    limit_end = 34400 * 4 // sample_decim
    limit_start = 0
    limit_end = -1

    error_final = None
    min_indexes = None

    for offset in range(2 * samples_per_symbol):
        #offset += 6
        expected: 'np.ndarray'
        expected = signal.windows.tukey(samples_per_symbol + 1, alpha=0.7) # TODO: Actual GFSK shape
        expected = expected[:-1]
        expected = np.concatenate([expected, -expected])
        expected = np.tile(expected, (samples.size + 10 * samples_per_symbol) // (2 * samples_per_symbol))
        expected = expected[offset:offset + samples.size]
        expected = 0.75 / 2 * frequency_deviation * expected
        mask_positive = np.ones_like(expected)
        mask_positive[expected <= 0] = 0
        mask_negative = np.ones_like(expected)
        mask_negative[expected >= 0] = 0
        error = mask_positive * np.maximum(0, expected - samples) + mask_negative * np.maximum(0, samples - expected)
        # error = error * error
        taps = signal.windows.tukey(preamble_length * samples_per_symbol, alpha=0.1)
        taps = taps / taps.sum()
        error2 = apply_filter_and_decimate(error, taps, 1)
        if error_final is None:
            error_final = error2
            min_indexes = np.ones(error2.size, dtype=np.int32) * offset
        else:
            min_indexes[error2 < error_final] = offset
            error_final = np.minimum(error_final, error2)
    samples = samples[taps.size:]
    min_indexes = min_indexes[taps.size:]
    error_final = error_final[taps.size:]
    detected = (error_final < sync_threshold * frequency_deviation)
    detected[0:taps.size] = False
    detected_diff = np.diff(detected.astype(np.int8))
    detected_indexes = np.where(detected_diff != 0)[0]
    detected_begin = detected_diff > 0
    detected_begin = detected_begin[detected_indexes]
    assert np.all(detected_begin[::2])
    assert not np.any(detected_begin[1::2])
    detected_indexes = detected_indexes + 1
    sync_locations = list(zip(detected_indexes[::2].tolist(), detected_indexes[1::2].tolist()))
    print(sync_locations)
    aaa = np.zeros_like(samples)
    for start, end in sync_locations:
        aaa[start:end] = sync_threshold * frequency_deviation
        offset = int(np.argmax(np.bincount(min_indexes[start:end])))
        bit_stream_start = start // samples_per_symbol * samples_per_symbol - (preamble_length + 1) * samples_per_symbol - offset
        while bit_stream_start < 0:
            bit_stream_start += samples_per_symbol
        bit_window = signal.windows.tukey(samples_per_symbol + 1, alpha=0.7)
        bit_window = bit_window[:-1]
        for i in range(preamble_length + 1):
            o = bit_stream_start + i * samples_per_symbol
            aaa[o: o + samples_per_symbol] = bit_window * 100000
        packet_length = 16 * 8  # hardcoded for now
        bits_float = block_convolve(samples[bit_stream_start:bit_stream_start + packet_length * samples_per_symbol], bit_window)
        print((bits_float > 0).astype(np.int8).tolist())

    ccc = np.abs(unmodulated)**2
    ccc = ccc / ccc.max() * 200000
    taps = signal.windows.hamming(samples_per_symbol * 2)
    taps = taps / taps.sum()
    bbb = np.convolve(ccc, taps, mode='same')
    plot_float_time_domain3(
        samples[limit_start:limit_end],
        #error_final[limit_start:limit_end],
        #min_indexes[limit_start:limit_end] / samples_per_symbol / 2 * 100000,
        aaa[limit_start:limit_end],
        bbb[limit_start:limit_end],
        decimated_sample_rate,
        f"{offset} samples offset")

    # signs = np.sign(samples)
    # crossings = np.where(np.diff(signs) != 0)[0]
    # cd = crossings[1:] - crossings[:-1]
    # win = np.ones(7, dtype=np.float32)
    # cdw = np.convolve(cd, win, mode='valid')

    #plot_float_time_domain2(crossings % 5, cd, 1.0, "Differences between zero crossings")
    #exit()

    # taps1 = design_sync_detector(samples_per_symbol, 0x5500, 16, False)
    # sync_det = apply_filter_and_decimate(samples, taps1, 1)
    # sync_det = np.abs(sync_det)
    # #taps2 = signal.windows.hamming(samples_per_symbol * 16 // 2)
    # #taps2 = taps2 / taps2.sum()
    # #sync_det_long = apply_filter_and_decimate(sync_det, taps2, 1)
    # taps1 = []
    # plot_float_time_domain3(
    #     samples,
    #     sync_det[0+len(taps1)//2:],
    #     signs * 0.05,
    #     decimated_sample_rate,
    #     "FM demodulated signal"
    # )

