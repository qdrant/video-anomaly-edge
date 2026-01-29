"""Edge device registry and management."""

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EdgeDevice:
    device_id: str
    name: str
    location: str
    status: str = "online"  # online, offline, syncing
    registered_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    baseline_version: str = ""
    threshold: float = 0.038
    # Stats
    total_escalations: int = 0
    confirmed_anomalies: int = 0
    false_positives: int = 0
    uptime_start: float = field(default_factory=time.time)

    @property
    def escalation_rate(self) -> float:
        elapsed_hours = max(0.001, (time.time() - self.uptime_start) / 3600)
        return self.total_escalations / elapsed_hours

    @property
    def false_positive_rate(self) -> float:
        if self.total_escalations == 0:
            return 0.0
        return self.false_positives / self.total_escalations

    @property
    def confirmation_rate(self) -> float:
        if self.total_escalations == 0:
            return 0.0
        return self.confirmed_anomalies / self.total_escalations

    def record_escalation(self, confirmed: bool):
        self.total_escalations += 1
        self.last_seen = time.time()
        if confirmed:
            self.confirmed_anomalies += 1
        else:
            self.false_positives += 1

    def heartbeat(self):
        self.last_seen = time.time()
        self.status = "online"

    def stats(self) -> dict:
        return {
            "device_id": self.device_id,
            "name": self.name,
            "location": self.location,
            "status": self.status,
            "total_escalations": self.total_escalations,
            "confirmed_anomalies": self.confirmed_anomalies,
            "false_positives": self.false_positives,
            "escalation_rate_per_hour": round(self.escalation_rate, 2),
            "false_positive_rate": round(self.false_positive_rate, 3),
            "confirmation_rate": round(self.confirmation_rate, 3),
            "baseline_version": self.baseline_version,
            "threshold": self.threshold,
            "last_seen": self.last_seen,
        }


class EdgeRegistry:
    """Manages registered edge devices."""

    def __init__(self):
        self._devices: dict[str, EdgeDevice] = {}

    def register(self, name: str, location: str, device_id: Optional[str] = None) -> EdgeDevice:
        did = device_id or f"edge-{uuid.uuid4().hex[:8]}"
        device = EdgeDevice(device_id=did, name=name, location=location)
        self._devices[did] = device
        return device

    def deregister(self, device_id: str) -> bool:
        return self._devices.pop(device_id, None) is not None

    def get(self, device_id: str) -> Optional[EdgeDevice]:
        return self._devices.get(device_id)

    def list_all(self) -> list[EdgeDevice]:
        return list(self._devices.values())

    def update_threshold(self, device_id: str, threshold: float) -> bool:
        device = self._devices.get(device_id)
        if not device:
            return False
        device.threshold = threshold
        return True

    def set_baseline_version(self, device_id: str, version: str) -> bool:
        device = self._devices.get(device_id)
        if not device:
            return False
        device.baseline_version = version
        device.status = "syncing"
        return True

    def mark_sync_complete(self, device_id: str) -> bool:
        device = self._devices.get(device_id)
        if not device:
            return False
        device.status = "online"
        return True

    def check_stale(self, timeout_seconds: float = 300.0) -> list[str]:
        """Return device IDs that haven't been seen recently."""
        now = time.time()
        stale = []
        for did, dev in self._devices.items():
            if now - dev.last_seen > timeout_seconds:
                dev.status = "offline"
                stale.append(did)
        return stale


# Global registry
registry = EdgeRegistry()
