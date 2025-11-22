#
# Requires:
# pip install numpy scipy matplotlib
#
# Arguments for this script are in "User parameters" section below.
# Make sure to pass the same values for sample rate and center frequency as during capturing.
# You can also set parameters of "plot_waterfall" function call near the end of this file.
#
# Example capture command:
# hackrf_transfer -r capture.iq  -f 2407000000  -s 20000000  -n 20000000  -g 0 -l 0 -a 0  -b 20000000
#                 ^^^^^^^^^^^^^  ^^^^^^^^^^^^^  ^^^^^^^^^^^  ^^^^^^^^^^^  ^^^^^^^^^^^^^^  ^^^^^^^^^^^
#                       |             |             |            |             |               |
#                       |             |             |            |             |               +----- Baseband filter in Hz. Default will reduce signal at the
#                       |             |             |            |             |                      ends of the band, bigger will cause mirror effects.
#                       |             |             |            |             +----- Gain and antenna power. Disable all if transmitter is directly connected.
#                       |             |             |            |                    Leave default if using antenna. Adjust if signal is too weak/strong.
#                       |             |             |            +----- Number of samples to capture.
#                       |             |             +----- Sample rate in Hz. Big sample rate (e.g. 20Msps) may cause few buffer overflows, but looks like
#                       |             |                    it does not affect the waterfall plot significantly.
#                       |             +----- Center frequency in Hz.
#                       +----- Receive data to raw samples to file.
#

import numpy as np
import matplotlib.ticker as ticker
import matplotlib.pyplot as plt
from scipy import signal
from pathlib import Path
import os


# ---- User parameters ----
filename = Path(__file__).parent / "capture.iq"        # raw file from hackrf_transfer (-r)
sample_rate = 20000000         # Hz (the -s you used when recording)
center_freq = 2404000000       # Hz (the -f you used when recording)
time_span_sec = 0.5            # seconds to read from file (for long files)
time_offset_sec = 0.0          # seconds offset from start of file


# ---- Helper: read whole file into complex numpy array ----
def read_iq_file(path):
    filesize = os.path.getsize(path)
    bytes_skip = 2 * int(round(sample_rate * time_offset_sec))
    bytes_count = 2 * int(min((filesize - bytes_skip) // 2, round(sample_rate * time_span_sec)))
    raw = np.fromfile(path, dtype=np.int8, count=bytes_count, offset=bytes_skip)
    # Interpret as interleaved I,Q
    I = raw[0::2].astype(np.float32) / 128.0
    Q = raw[1::2].astype(np.float32) / 128.0
    return I + 1j * Q


# ---- Chunked reader (for large files) ----
def stream_iq_file(path, chunk_complex_samples=1024*1024):
    # yields complex numpy arrays chunk by chunk
    bytes_per_complex = 2  # int8 I + int8 Q
    chunk_bytes = int(chunk_complex_samples * bytes_per_complex)
    with open(path, "rb") as f:
        while True:
            data = f.read(chunk_bytes)
            if not data:
                break
            raw = np.frombuffer(data, dtype=np.int8)
            if len(raw) % 2 != 0:
                raw = raw[:-1]  # drop last incomplete byte
            I = raw[0::2].astype(np.float32) / 128.0
            Q = raw[1::2].astype(np.float32) / 128.0
            yield I + 1j * Q


def plot_fft_snapshot(samples, fs, center_freq_hz, title="FFT snapshot"):
    N = len(samples)
    window = np.hanning(N)
    X = np.fft.fftshift(np.fft.fft(samples * window, n=N))
    freqs = np.fft.fftshift(np.fft.fftfreq(N, 1.0/fs)) + center_freq_hz
    psd_db = 20.0 * np.log10(np.abs(X) + 1e-12)
    plt.figure(figsize=(9,4))
    plt.plot((freqs - center_freq_hz)/1e6, psd_db)  # x axis relative to center, in MHz
    plt.xlabel("Frequency offset (MHz) relative to center")
    plt.ylabel("Magnitude (dB, uncalibrated)")
    plt.title(title)
    plt.grid(True)
    plt.tight_layout()


def plot_psd_welch(samples, fs, center_freq_hz, nperseg=4096):
    f, Pxx = signal.welch(samples, fs=fs, window='hann', nperseg=nperseg, return_onesided=False)
    # shift
    f = np.fft.fftshift(f) + 0  # freqs centered around 0
    Pxx = np.fft.fftshift(Pxx)
    plt.figure(figsize=(9,4))
    plt.semilogy((f)/1e6, Pxx)
    plt.xlabel("Frequency offset (MHz) relative to center")
    plt.ylabel("PSD (power/Hz, uncalibrated)")
    plt.title("Welch PSD (two-sided)")
    plt.grid(True)
    plt.tight_layout()


def plot_waterfall(samples, fs, center_freq_hz, step_time=0.0001,
                   freq_step_mhz=1.0, time_step_ms=1.0):
    nperseg = int(round(fs * step_time))
    print(f"nperseg: {nperseg}")
    if nperseg < 16:
        raise ValueError("step_time too small for given sample rate")
    
    # Short-Time Fourier Transform
    f, t, Sxx = signal.spectrogram(
        samples,
        fs=fs,
        window='hann',
        nperseg=nperseg,
        noverlap=0,#-10240/2,
        detrend=False,
        return_onesided=False,
        scaling='density',
        mode='magnitude'
    )
    
    # Shift to center
    f = np.fft.fftshift(f)
    Sxx = np.fft.fftshift(Sxx, axes=0)
    Sxx_dB = 20 * np.log10(Sxx + 1e-12)
    
    # Plot
    fig, ax = plt.subplots(figsize=(10,6))
    extent = [t[0]*1e3, t[-1]*1e3, f[0]/1e6 + center_freq_hz/1e6, f[-1]/1e6 + center_freq_hz/1e6]
    im = ax.imshow(Sxx_dB, aspect='auto', extent=extent, origin='lower', vmin=-120, vmax=-70,
                   cmap='turbo')
    cbar = plt.colorbar(im, ax=ax, label="Magnitude (dB, uncalibrated)")
    
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("Frequency offset (MHz)")
    ax.set_title(f"Waterfall (step {step_time*1e3:.3f} ms, center {center_freq_hz/1e6:.3f} MHz)")
    
    # Add grid and set tick locators
#     ax.grid(True, color='white', alpha=0.3, linestyle='--')
#     ax.xaxis.set_major_locator(ticker.MultipleLocator(time_step_ms))
#     ax.yaxis.set_major_locator(ticker.MultipleLocator(freq_step_mhz))
    
    plt.tight_layout()


if __name__ == "__main__":
    # small file: read whole
    print("Reading file (may take memory)...")
    samples = read_iq_file(filename)
    print(f"Read {samples.size} complex samples")

    # snapshot FFT of first N samples
    # Nsnap = 1024
    # plot_fft_snapshot(samples[:Nsnap], sample_rate, center_freq, title="FFT snapshot (first chunk)")

    # Welch PSD (two-sided)
    # plot_psd_welch(samples, sample_rate, center_freq, nperseg=16384)

    # Waterfall
    plot_waterfall(samples, sample_rate, center_freq, 0.000010, 1, 20)

    plt.show()
