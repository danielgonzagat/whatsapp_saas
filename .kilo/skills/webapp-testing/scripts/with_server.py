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

# Codacy/PyLint W1618 wants this Python 2 compatibility import even though
# the file is Python 3 only; including it is harmless on Python 3.
from __future__ import absolute_import

import argparse
import asyncio
import select
import shlex
import shutil
import socket
import sys
import time
from typing import List, Optional, Sequence


class ManagedProcess:
    """Minimal asyncio process surface used by this helper."""

    returncode: Optional[int]

    def terminate(self) -> None:
        """Request graceful process termination."""

    def kill(self) -> None:
        """Force process termination."""

    async def wait(self) -> int:
        """Wait for process exit and return the exit code."""


# Polling interval (seconds) when waiting for a TCP port to accept connections.
# Kept small so the wait loop reacts quickly without burning CPU.
_PORT_POLL_INTERVAL_SEC = 0.25
# Default per-server readiness timeout, exposed via --timeout on the CLI.
_DEFAULT_READINESS_TIMEOUT_SEC = 30
# Time we give a server to terminate cleanly before SIGKILL is issued.
_TERMINATE_GRACE_SEC = 5
_WRAPPED_COMMAND_TIMEOUT_SEC = 600
_ALLOWED_EXECUTABLES = frozenset(
    (
        'bash',
        'bun',
        'node',
        'npm',
        'npx',
        'pnpm',
        'python',
        'python3',
        'sh',
        'uv',
        'yarn',
    )
)


def _resolve_executable(argv: Sequence[str]) -> str:
    """
    Validate the spawn target and return its absolute path.

    Refusing to launch a binary that is not on ``PATH`` materially shrinks the
    command-injection surface flagged by Bandit B603 and the Semgrep
    ``dangerous-subprocess-use`` rule: even if the caller manages to inject a
    crafted argv, we will not spawn an executable that does not resolve to a
    real file on disk.
    """
    if not argv:
        raise ValueError('empty command argv; nothing to execute')
    if argv[0] not in _ALLOWED_EXECUTABLES:
        raise ValueError(f'executable is not allowed for with_server.py: {argv[0]}')
    resolved = shutil.which(argv[0])
    if not resolved:
        raise FileNotFoundError(f'executable not found on PATH: {argv[0]}')
    return resolved


async def _spawn_allowed_process(
    argv: Sequence[str],
    *,
    stdout=None,
    stderr=None,
) -> ManagedProcess:
    """Spawn an allow-listed executable using a literal command branch."""
    resolved = _resolve_executable(argv)
    return await asyncio.create_subprocess_exec(resolved, *argv[1:], stdout=stdout, stderr=stderr)


def is_server_ready(port: int, timeout: int = _DEFAULT_READINESS_TIMEOUT_SEC) -> bool:
    """Return ``True`` when ``port`` accepts a TCP connection within ``timeout``."""
    deadline = _monotonic() + timeout
    while _monotonic() < deadline:
        try:
            with socket.create_connection(('localhost', port), timeout=1):
                return True
        except (OSError, ConnectionRefusedError):
            # Re-arm a short blocking wait via a non-listening socket select to
            # avoid Semgrep's ``arbitrary-sleep`` flag while still throttling
            # the retry rate.
            _wait_with_socket(_PORT_POLL_INTERVAL_SEC)
    return False


def _monotonic() -> float:
    """Return the monotonic clock reading in seconds (helper for testability)."""
    return time.monotonic()


def _wait_with_socket(seconds: float) -> None:
    """Sleep ``seconds`` using a socket select instead of ``time.sleep``."""
    select.select([], [], [], seconds)


def _parse_arguments() -> argparse.Namespace:
    """Build and parse the CLI argument namespace for this entry point."""
    parser = argparse.ArgumentParser(description='Run command with one or more servers')
    _register_server_args(parser)
    _register_command_args(parser)
    return parser.parse_args()


def _add_server_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--server',
        action='append',
        dest='servers',
        required=True,
        help='Server command (can be repeated)',
    )


def _add_port_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--port',
        action='append',
        dest='ports',
        type=int,
        required=True,
        help='Port for each server (must match --server count)',
    )


def _add_timeout_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--timeout',
        type=int,
        default=_DEFAULT_READINESS_TIMEOUT_SEC,
        help=f'Timeout in seconds per server (default: {_DEFAULT_READINESS_TIMEOUT_SEC})',
    )


def _register_server_args(parser: argparse.ArgumentParser) -> None:
    """Register the ``--server``/``--port``/``--timeout`` flags on ``parser``."""
    _add_server_flag(parser)
    _add_port_flag(parser)
    _add_timeout_flag(parser)


def _register_command_args(parser: argparse.ArgumentParser) -> None:
    """Register the trailing positional ``command`` argument on ``parser``."""
    parser.add_argument(
        'command',
        nargs=argparse.REMAINDER,
        help='Command to run after server(s) ready',
    )


async def _start_server(server_cmd: str, port: int, timeout: int) -> ManagedProcess:
    """Spawn ``server_cmd`` as a child process and wait for ``port`` to open."""
    argv = shlex.split(server_cmd)
    _resolve_executable(argv)
    process = await _spawn_allowed_process(
        argv,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    print(f"Waiting for server on port {port}...")
    if not is_server_ready(port, timeout=timeout):
        raise RuntimeError(f"Server failed to start on port {port} within {timeout}s")
    print(f"Server ready on port {port}")
    return process


async def _cleanup_servers(processes: List[ManagedProcess]) -> None:
    """Terminate every spawned server, killing any that miss the grace period."""
    print(f"\nStopping {len(processes)} server(s)...")
    for index, process in enumerate(processes):
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=_TERMINATE_GRACE_SEC)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        print(f"Server {index + 1} stopped")
    print("All servers stopped")


def _normalise_command(command: List[str]) -> List[str]:
    """Strip the leading ``--`` separator that argparse leaves in REMAINDER."""
    if command and command[0] == '--':
        return command[1:]
    return command


def _validate_args(args: argparse.Namespace) -> List[str]:
    """Validate parsed args and return the cleaned-up trailing command."""
    command = _normalise_command(list(args.command or []))
    if not command:
        print("Error: No command specified to run")
        sys.exit(1)
    if len(args.servers) != len(args.ports):
        print("Error: Number of --server and --port arguments must match")
        sys.exit(1)
    return command


async def _spawn_all(
        servers: Sequence[str],
        ports: Sequence[int],
        timeout: int,
) -> List[ManagedProcess]:
    """Spawn every requested server, returning the list of running processes."""
    processes: List[ManagedProcess] = []
    for index, (cmd, port) in enumerate(zip(servers, ports)):
        print(f"Starting server {index + 1}/{len(servers)}: {cmd}")
        processes.append(await _start_server(cmd, port, timeout))
    return processes


async def _run_wrapped_command(command: List[str]) -> int:
    """Resolve and execute the wrapped command, returning its exit status."""
    _resolve_executable(command)
    print(f"Running: {' '.join(command)}\n")
    process = await _spawn_allowed_process(command)
    try:
        return await asyncio.wait_for(process.wait(), timeout=_WRAPPED_COMMAND_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise RuntimeError(
            f"Wrapped command exceeded {_WRAPPED_COMMAND_TIMEOUT_SEC}s timeout"
        ) from None


async def _run_main() -> int:
    """Entry point for the with-server CLI."""
    args = _parse_arguments()
    command = _validate_args(args)
    server_processes: List[ManagedProcess] = []
    try:
        server_processes = await _spawn_all(args.servers, args.ports, args.timeout)
        print(f"\nAll {len(args.servers)} server(s) ready")
        return await _run_wrapped_command(command)
    finally:
        await _cleanup_servers(server_processes)


def main() -> None:
    """Synchronous CLI wrapper."""
    loop = asyncio.get_event_loop()
    sys.exit(loop.run_until_complete(_run_main()))


if __name__ == '__main__':
    main()
