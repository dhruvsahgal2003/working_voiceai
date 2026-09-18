"""
Resource-headroom probe for the LiveKit agent worker.

Estimates how many concurrent live calls this box can sustain, WITHOUT placing
any real calls, by running N real Silero VAD instances (the actual model
agent.py uses, loaded via the same livekit.plugins.silero API) each fed
synthetic 16kHz audio at real-time pace in its own subprocess — one subprocess
per simulated call, matching how LiveKit's worker actually achieves concurrency
(a separate OS process per job).

Deliberate scope limits, stated plainly rather than glossed over:
  - Only exercises VAD, the one model that runs continuously for the whole
    call (every 20ms frame). The turn-detector model (MultilingualModel) also
    runs locally but only at turn boundaries, so it's a much smaller share of
    total local compute — not simulated here.
  - STT/LLM/TTS (Sarvam/Groq) are remote API calls in the real pipeline; this
    probe doesn't simulate their network/latency behavior at all, only the
    local-CPU VAD cost.
  - Real audio would vary in how "speech-like" it is (affecting VAD internals
    marginally); this uses low-amplitude synthetic noise as a stand-in.
  - This measures resource *headroom*, not audio quality — it cannot tell you
    whether STT/TTS latency degrades under load, only whether the box has
    CPU/memory left to run N sessions at all.

Usage: python3 resource_headroom_probe.py [--levels 2,5,10,15,20,30]
"""
import argparse
import multiprocessing as mp
import os
import sys
import time

import numpy as np
import psutil


def _vad_worker(duration_s: float, ready_event, stop_event):
    """Runs in its own subprocess: load a real VAD instance, stream synthetic
    16kHz audio into it at real-time pace for `duration_s` seconds."""
    import warnings
    warnings.filterwarnings("ignore")
    from livekit import rtc
    from livekit.plugins import silero

    async def run():
        vad = silero.VAD.load(sample_rate=16000)
        stream = vad.stream()

        frame_ms = 20
        samples_per_frame = int(16000 * frame_ms / 1000)
        rng = np.random.default_rng(os.getpid())

        async def drain():
            async for _ in stream:
                pass  # we only care about CPU/mem cost of processing, not the VAD decisions

        import asyncio
        drain_task = asyncio.create_task(drain())

        ready_event.set()
        start = time.monotonic()
        next_frame_at = start
        while time.monotonic() - start < duration_s and not stop_event.is_set():
            # Low-amplitude noise, not silence — silence short-circuits cheaply in
            # many VAD implementations and would understate real CPU cost.
            samples = (rng.standard_normal(samples_per_frame) * 500).astype(np.int16)
            frame = rtc.AudioFrame(
                data=samples.tobytes(), sample_rate=16000, num_channels=1,
                samples_per_channel=samples_per_frame,
            )
            stream.push_frame(frame)
            next_frame_at += frame_ms / 1000
            sleep_for = next_frame_at - time.monotonic()
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)

        stream.end_input()
        drain_task.cancel()

    import asyncio
    asyncio.run(run())


def run_level(n: int, duration_s: float = 8.0, warmup_s: float = 3.0):
    ready_events = [mp.Event() for _ in range(n)]
    stop_event = mp.Event()
    procs = [
        mp.Process(target=_vad_worker, args=(duration_s + warmup_s + 2, ready_events[i], stop_event))
        for i in range(n)
    ]
    mem_before = psutil.virtual_memory().used
    for p in procs:
        p.start()
    for e in ready_events:
        e.wait(timeout=15)
    time.sleep(warmup_s)  # let everything reach steady state before sampling

    psutil.cpu_percent(interval=None)  # discard first (meaningless) reading
    cpu_samples = []
    mem_samples = []
    sample_start = time.monotonic()
    while time.monotonic() - sample_start < duration_s:
        cpu_samples.append(psutil.cpu_percent(interval=0.5))
        mem_samples.append(psutil.virtual_memory().used)

    stop_event.set()
    for p in procs:
        p.join(timeout=10)
        if p.is_alive():
            p.terminate()

    avg_cpu = sum(cpu_samples) / len(cpu_samples)
    peak_cpu = max(cpu_samples)
    peak_mem_mb = (max(mem_samples) - mem_before) / 1024 / 1024
    return avg_cpu, peak_cpu, peak_mem_mb


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--levels", default="2,5,10,15,20,30")
    args = parser.parse_args()
    levels = [int(x) for x in args.levels.split(",")]

    ncpu = psutil.cpu_count()
    total_mem_gb = psutil.virtual_memory().total / 1024 / 1024 / 1024
    print(f"[PROBE] Box: {ncpu} vCPUs, {total_mem_gb:.1f}GB total RAM, "
          f"{psutil.virtual_memory().available / 1024 / 1024 / 1024:.1f}GB currently available")
    print(f"[PROBE] Testing concurrent VAD sessions at: {levels}\n")

    print(f"{'N sessions':<12}{'avg CPU%':<12}{'peak CPU%':<12}{'incr. mem (MB)':<16}{'mem/session (MB)':<18}")
    results = []
    for n in levels:
        avg_cpu, peak_cpu, peak_mem_mb = run_level(n)
        results.append((n, avg_cpu, peak_cpu, peak_mem_mb))
        print(f"{n:<12}{avg_cpu:<12.1f}{peak_cpu:<12.1f}{peak_mem_mb:<16.0f}{peak_mem_mb / n:<18.1f}")
        if peak_cpu > 90:  # psutil.cpu_percent() is already 0-100 across all cores combined
            print(f"[PROBE] CPU saturation threshold crossed at N={n}, stopping further levels.")
            break
        if psutil.virtual_memory().available / 1024 / 1024 / 1024 < 1.0:
            print(f"[PROBE] Available memory dropped below 1GB at N={n}, stopping further levels.")
            break

    print("\n[PROBE] Note: 'peak CPU%' is psutil's system-wide percent (100% = all cores fully busy).")
    print("[PROBE] This box also runs the Node backend, Postgres, MinIO, and Redis concurrently —")
    print("[PROBE] leave real headroom below saturation, not just up to it.")


if __name__ == "__main__":
    mp.set_start_method("spawn")
    main()
