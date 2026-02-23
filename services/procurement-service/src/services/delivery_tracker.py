"""
Delivery tracking service.

Manages delivery status updates for purchase orders, computes delay metrics,
and generates delay alerts when deliveries fall behind schedule.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

import structlog

from src.models.order import (
    DeliveryStatus,
    DeliveryStatusEnum,
    DeliveryUpdate,
)

logger = structlog.get_logger(__name__)


class DeliveryTracker:
    """Service for tracking purchase order deliveries."""

    def create_delivery_record(
        self,
        order_id: str,
        expected_date: date | None = None,
    ) -> DeliveryStatus:
        """Create a new delivery tracking record for an order.

        Parameters
        ----------
        order_id:
            The purchase order ID.
        expected_date:
            Expected delivery date based on vendor lead time.

        Returns
        -------
        DeliveryStatus
            The initial delivery tracking record.
        """
        now = datetime.now(tz=timezone.utc)
        delivery_id = str(uuid.uuid4())

        return DeliveryStatus(
            id=delivery_id,
            order_id=order_id,
            status=DeliveryStatusEnum.PENDING,
            expected_date=expected_date,
            actual_date=None,
            tracking_number=None,
            carrier=None,
            delay_days=0,
            delay_reason=None,
            location=None,
            updates=[
                DeliveryUpdate(
                    timestamp=now,
                    status=DeliveryStatusEnum.PENDING,
                    notes="Delivery record created.",
                ),
            ],
            created_at=now,
            updated_at=now,
        )

    def update_status(
        self,
        delivery: DeliveryStatus,
        new_status: DeliveryStatusEnum,
        tracking_number: str | None = None,
        carrier: str | None = None,
        location: str | None = None,
        expected_date: date | None = None,
        actual_date: date | None = None,
        delay_reason: str | None = None,
        notes: str = "",
    ) -> DeliveryStatus:
        """Apply a status update to an existing delivery record.

        Parameters
        ----------
        delivery:
            The existing delivery record to update.
        new_status:
            The new delivery status.
        tracking_number:
            Carrier tracking number, if available.
        carrier:
            Carrier/logistics provider name.
        location:
            Current or last known location.
        expected_date:
            Updated expected delivery date.
        actual_date:
            Actual delivery date (set when status is DELIVERED).
        delay_reason:
            Reason for any delay.
        notes:
            Free-text notes for this update.

        Returns
        -------
        DeliveryStatus
            The updated delivery record.
        """
        now = datetime.now(tz=timezone.utc)

        delivery.status = new_status
        delivery.updated_at = now

        if tracking_number is not None:
            delivery.tracking_number = tracking_number
        if carrier is not None:
            delivery.carrier = carrier
        if location is not None:
            delivery.location = location
        if expected_date is not None:
            delivery.expected_date = expected_date
        if actual_date is not None:
            delivery.actual_date = actual_date
        if delay_reason is not None:
            delivery.delay_reason = delay_reason

        # Auto-set actual_date on delivery
        if new_status == DeliveryStatusEnum.DELIVERED and delivery.actual_date is None:
            delivery.actual_date = date.today()

        # Compute delay
        delivery.delay_days = self.compute_delay_days(delivery)

        # Auto-mark as delayed if past expected date
        if (
            delivery.delay_days > 0
            and new_status not in (DeliveryStatusEnum.DELIVERED, DeliveryStatusEnum.RETURNED)
        ):
            delivery.status = DeliveryStatusEnum.DELAYED

        # Append update to timeline
        update = DeliveryUpdate(
            timestamp=now,
            status=new_status,
            location=location,
            notes=notes,
        )
        delivery.updates.append(update)

        logger.info(
            "delivery_status_updated",
            delivery_id=delivery.id,
            order_id=delivery.order_id,
            status=new_status.value,
            delay_days=delivery.delay_days,
        )

        return delivery

    def compute_delay_days(self, delivery: DeliveryStatus) -> int:
        """Compute the number of days a delivery is delayed.

        Returns 0 if the delivery is on time or no expected date is set.

        Parameters
        ----------
        delivery:
            The delivery record.

        Returns
        -------
        int
            Number of days delayed (0 if on time or early).
        """
        if delivery.expected_date is None:
            return 0

        reference_date = delivery.actual_date or date.today()
        delta = (reference_date - delivery.expected_date).days
        return max(0, delta)

    def generate_delay_alert(self, delivery: DeliveryStatus) -> str | None:
        """Generate a human-readable delay alert message if the delivery is late.

        Parameters
        ----------
        delivery:
            The delivery record.

        Returns
        -------
        str | None
            Alert message, or ``None`` if no delay.
        """
        delay = self.compute_delay_days(delivery)
        if delay <= 0:
            return None

        severity = "WARNING"
        if delay > 14:
            severity = "CRITICAL"
        elif delay > 7:
            severity = "HIGH"
        elif delay > 3:
            severity = "MEDIUM"

        reason_text = ""
        if delivery.delay_reason:
            reason_text = f" Reason: {delivery.delay_reason}."

        return (
            f"[{severity}] Order {delivery.order_id} is {delay} days late. "
            f"Expected: {delivery.expected_date}, "
            f"Status: {delivery.status.value}.{reason_text}"
        )

    def compare_expected_vs_actual(
        self,
        deliveries: list[DeliveryStatus],
    ) -> dict[str, Any]:
        """Compare expected vs actual delivery dates across a set of deliveries.

        Parameters
        ----------
        deliveries:
            List of delivery records to analyse.

        Returns
        -------
        dict
            Summary statistics including on-time rate, average delay, and alerts.
        """
        total = len(deliveries)
        if total == 0:
            return {
                "total_deliveries": 0,
                "on_time_count": 0,
                "delayed_count": 0,
                "on_time_rate": 0.0,
                "average_delay_days": 0.0,
                "max_delay_days": 0,
                "alerts": [],
            }

        on_time = 0
        delayed = 0
        total_delay = 0
        max_delay = 0
        alerts: list[str] = []

        for delivery in deliveries:
            delay = self.compute_delay_days(delivery)
            if delay == 0:
                on_time += 1
            else:
                delayed += 1
                total_delay += delay
                max_delay = max(max_delay, delay)
                alert = self.generate_delay_alert(delivery)
                if alert:
                    alerts.append(alert)

        avg_delay = total_delay / delayed if delayed > 0 else 0.0

        return {
            "total_deliveries": total,
            "on_time_count": on_time,
            "delayed_count": delayed,
            "on_time_rate": round(on_time / total * 100, 1) if total > 0 else 0.0,
            "average_delay_days": round(avg_delay, 1),
            "max_delay_days": max_delay,
            "alerts": alerts,
        }
