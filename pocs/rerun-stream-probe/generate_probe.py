from __future__ import annotations

import argparse
import math
from pathlib import Path

import rerun as rr


TICKS = 120


def synthetic_metrics(frame: int) -> dict[str, float | int]:
    """Build a stable synthetic stream profile for local Rerun inspection."""
    reconnecting = 72 <= frame <= 82
    warmed_up = frame > 12
    dropped_frames = max(0, frame - 35) // 24

    latency_ms = 38 + 7 * math.sin(frame / 9)
    if reconnecting:
        latency_ms += 75 + (frame - 72) * 3
    elif frame in {36, 37, 38}:
        latency_ms += 38

    buffer_depth = 10 + 3 * math.sin(frame / 6)
    if reconnecting:
        buffer_depth = max(1, 8 - (frame - 72))
    elif not warmed_up:
        buffer_depth = 4 + frame * 0.45

    bitrate_mbps = 5.8 + 0.4 * math.sin(frame / 13)
    if reconnecting:
        bitrate_mbps = max(0.2, 5.2 - (frame - 72) * 0.45)

    if frame == 0:
        status_code = 0
    elif reconnecting:
        status_code = 2
    else:
        status_code = 1

    return {
        "latency_ms": round(latency_ms, 3),
        "buffer_depth_frames": round(buffer_depth, 3),
        "dropped_frames_total": dropped_frames,
        "frames_received_total": frame + 1,
        "bitrate_mbps": round(bitrate_mbps, 3),
        "status_code": status_code,
    }


def log_stream_event(frame: int) -> None:
    if frame == 0:
        rr.log("stream/events", rr.TextLog("stream started", level="INFO"))
    elif frame in {1, 30, 60, 90, 119}:
        rr.log("stream/events", rr.TextLog(f"frame received: {frame}", level="INFO"))
    elif frame == 36:
        rr.log(
            "stream/events",
            rr.TextLog("warning: latency spike and buffer pressure", level="WARN"),
        )
    elif frame == 72:
        rr.log("stream/events", rr.TextLog("reconnect: upstream heartbeat lost", level="WARN"))
    elif frame == 83:
        rr.log("stream/events", rr.TextLog("stream recovered", level="INFO"))


def generate(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    rr.init("streamthing_rerun_stream_probe", spawn=False)
    rr.save(output)

    for frame in range(TICKS):
        rr.set_time("frame", sequence=frame)
        metrics = synthetic_metrics(frame)

        rr.log("metrics/latency_ms", rr.Scalars(metrics["latency_ms"]))
        rr.log("metrics/buffer_depth_frames", rr.Scalars(metrics["buffer_depth_frames"]))
        rr.log("metrics/dropped_frames_total", rr.Scalars(metrics["dropped_frames_total"]))
        rr.log("metrics/frames_received_total", rr.Scalars(metrics["frames_received_total"]))
        rr.log("metrics/bitrate_mbps", rr.Scalars(metrics["bitrate_mbps"]))
        rr.log("stream/status_code", rr.Scalars(metrics["status_code"]))
        log_stream_event(frame)

    if hasattr(rr, "flush"):
        rr.flush()
    rr.disconnect()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic StreamThing Rerun stream probe."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "out" / "streamthing-stream-probe.rrd",
        help="Path to the generated .rrd file.",
    )
    args = parser.parse_args()

    generate(args.output)
    size_bytes = args.output.stat().st_size
    print(f"ticks={TICKS}")
    print(f"output={args.output}")
    print(f"size_bytes={size_bytes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
