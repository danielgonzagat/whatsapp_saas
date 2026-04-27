#!/usr/bin/env python3
"""Start one or more servers, wait for readiness, run a command, then clean up.

This helper is meant to be invoked by developers locally during webapp
testing. It deliberately spawns child processes (subprocess) because that
is the only way to launch a dev server alongside a test command. To avoid
shell-injection risks the server command is parsed with ``shlex.split`` and
the wrapped command is forwarded as a list (no shell). Operators that need
shell features must wrap their command in an explicit ``sh -c '...'`` call.

Usage:
    # Single server
    python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
    python scripts/with_server.py --server "npm start" --port 3000 -- python test.py

    # Multiple servers
    python scripts/with_server.py \\
      --server "sh -c 'cd backend && python server.py'" --port 3000 \\
      --server "sh -c 'cd frontend && npm run dev'" --port 5173 \\
      -- python test.py
"""

from __future__ import annotations

import argparse
import shlex
import socket
import sys
import time
from subprocess import DEVNULL, Popen, TimeoutExpired, run


def is_server_ready(port: int, timeout: int = 30) -> bool:
    """Return ``True`` when ``port`` accepts a TCP connection within ``timeout``."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection(('localhost', port), timeout=1):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.5)
    return False


def _parse_arguments() -> argparse.Namespace:
    """Build and parse the CLI argument namespace for this entry point."""
    parser = argparse.ArgumentParser(
        description='Run command with one or more servers',
    )
    parser.add_argument(
        '--server',
        action='append',
        dest='servers',
        required=True,
        help='Server command (can be repeated)',
    )
    parser.add_argument(
        '--port',
        action='append',
        dest='ports',
        type=int,
        required=True,
        help='Port for each server (must match --server count)',
    )
    parser.add_argument(
        '--timeout',
        type=int,
        default=30,
        help='Timeout in seconds per server (default: 30)',
    )
    parser.add_argument(
        'command',
        nargs=argparse.REMAINDER,
        help='Command to run after server(s) ready',
    )
    return parser.parse_args()


def _start_server(server_cmd: str, port: int, timeout: int) -> Popen:
    """Spawn ``server_cmd`` as a child process and wait for ``port`` to open."""
    argv = shlex.split(server_cmd)
    process = Popen(argv, stdout=DEVNULL, stderr=DEVNULL)
    print(f"Waiting for server on port {port}...")
    if not is_server_ready(port, timeout=timeout):
        raise RuntimeError(
            f"Server failed to start on port {port} within {timeout}s",
        )
    print(f"Server ready on port {port}")
    return process


def _cleanup_servers(processes: list[Popen]) -> None:
    """Terminate every spawned server, killing any that miss the grace period."""
    print(f"\nStopping {len(processes)} server(s)...")
    for index, process in enumerate(processes):
        try:
            process.terminate()
            process.wait(timeout=5)
        except TimeoutExpired:
            process.kill()
            process.wait()
        print(f"Server {index + 1} stopped")
    print("All servers stopped")


def main() -> None:
    """Entry point for the with-server CLI."""
    args = _parse_arguments()

    # Remove the '--' separator if present
    if args.command and args.command[0] == '--':
        args.command = args.command[1:]

    if not args.command:
        print("Error: No command specified to run")
        sys.exit(1)

    if len(args.servers) != len(args.ports):
        print("Error: Number of --server and --port arguments must match")
        sys.exit(1)

    server_processes: list[Popen] = []
    try:
        for index, (cmd, port) in enumerate(zip(args.servers, args.ports)):
            print(f"Starting server {index + 1}/{len(args.servers)}: {cmd}")
            server_processes.append(_start_server(cmd, port, args.timeout))

        print(f"\nAll {len(args.servers)} server(s) ready")
        print(f"Running: {' '.join(args.command)}\n")
        result = run(args.command, check=False)
        sys.exit(result.returncode)
    finally:
        _cleanup_servers(server_processes)


if __name__ == '__main__':
    main()
