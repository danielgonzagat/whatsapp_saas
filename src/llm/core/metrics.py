"""Usage metrics tracking for LLM providers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class UsageMetrics:
    """Token usage and cost metrics for a single LLM call."""

    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    latency_ms: float = 0.0

    def __post_init__(self) -> None:
        if self.tokens_in < 0:
            raise ValueError(f"tokens_in cannot be negative: {self.tokens_in}")
        if self.tokens_out < 0:
            raise ValueError(f"tokens_out cannot be negative: {self.tokens_out}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_usd": self.cost_usd,
            "latency_ms": self.latency_ms,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> UsageMetrics:
        return cls(
            tokens_in=data.get("tokens_in", 0),
            tokens_out=data.get("tokens_out", 0),
            cost_usd=data.get("cost_usd", 0.0),
            latency_ms=data.get("latency_ms", 0.0),
        )
