"""
Tests for electrical calculations.

Verifies NEC table lookups and circuit sizing against known values.
"""

from __future__ import annotations

import pytest

from src.services.nec_tables import (
    STANDARD_BREAKER_SIZES,
    WIRE_AMPACITY,
    calculate_conduit_size,
    calculate_demand_factor,
    select_breaker_size,
    select_wire_gauge,
)


class TestWireGaugeSelection:
    """Test wire gauge selection per NEC 310.16."""

    def test_15a_circuit_selects_14awg(self) -> None:
        """Per NEC 310.16: 15A load should use 14AWG copper (rated 15A)."""
        spec = select_wire_gauge(15.0)
        assert spec.gauge_awg == "14AWG"
        assert spec.ampacity == 15.0
        assert "NEC 310.16" in spec.standard_reference

    def test_20a_circuit_selects_12awg(self) -> None:
        """Per NEC 310.16: 20A load should use 12AWG copper (rated 20A)."""
        spec = select_wire_gauge(20.0)
        assert spec.gauge_awg == "12AWG"
        assert spec.ampacity == 20.0

    def test_16a_load_requires_12awg(self) -> None:
        """A 16A load exceeds 14AWG capacity (15A), so 12AWG is required."""
        spec = select_wire_gauge(16.0)
        assert spec.gauge_awg == "12AWG"
        assert spec.ampacity >= 16.0

    def test_30a_circuit_selects_10awg(self) -> None:
        """Per NEC 310.16: 30A load should use 10AWG copper (rated 30A)."""
        spec = select_wire_gauge(30.0)
        assert spec.gauge_awg == "10AWG"
        assert spec.ampacity == 30.0

    def test_40a_circuit_selects_8awg(self) -> None:
        """Per NEC 310.16: 40A load should use 8AWG copper (rated 40A)."""
        spec = select_wire_gauge(40.0)
        assert spec.gauge_awg == "8AWG"
        assert spec.ampacity == 40.0

    def test_55a_circuit_selects_6awg(self) -> None:
        """Per NEC 310.16: 55A load should use 6AWG copper (rated 55A)."""
        spec = select_wire_gauge(55.0)
        assert spec.gauge_awg == "6AWG"
        assert spec.ampacity == 55.0

    def test_wire_is_copper(self) -> None:
        """Default material should be copper."""
        spec = select_wire_gauge(20.0)
        assert spec.material == "copper"

    def test_wire_insulation_is_thhn(self) -> None:
        """Default insulation type should be THHN."""
        spec = select_wire_gauge(20.0)
        assert spec.insulation == "THHN"


class TestBreakerSizing:
    """Test breaker size selection per NEC 240.6(A)."""

    def test_15a_load_gets_15a_breaker(self) -> None:
        """15A non-continuous load should use a 15A breaker."""
        assert select_breaker_size(15.0) == 15

    def test_20a_load_gets_20a_breaker(self) -> None:
        """20A non-continuous load should use a 20A breaker."""
        assert select_breaker_size(20.0) == 20

    def test_continuous_load_80_percent_rule(self) -> None:
        """Per NEC 210.20(A): continuous loads must not exceed 80% of breaker.

        A 16A continuous load requires 16/0.80 = 20A breaker.
        """
        breaker = select_breaker_size(16.0, continuous=True)
        assert breaker == 20

    def test_13a_continuous_needs_20a(self) -> None:
        """13A continuous: 13/0.80 = 16.25A, rounds up to 20A breaker."""
        breaker = select_breaker_size(13.0, continuous=True)
        assert breaker == 20

    def test_all_standard_sizes_valid(self) -> None:
        """All returned breaker sizes must be from the NEC 240.6(A) standard list."""
        for amps in [5.0, 10.0, 15.0, 18.0, 25.0, 35.0, 50.0]:
            breaker = select_breaker_size(amps)
            assert breaker in STANDARD_BREAKER_SIZES


class TestConduitSizing:
    """Test conduit fill calculation per NEC Chapter 9, Table 1."""

    def test_three_12awg_wires(self) -> None:
        """Three 12AWG wires should fit in 1/2\" EMT conduit."""
        spec = calculate_conduit_size("12AWG", wire_count=3)
        assert spec.size_inches >= 0.5
        assert spec.fill_percentage <= spec.max_fill_percentage
        assert spec.max_fill_percentage == 40.0  # 3+ wires = 40%

    def test_single_wire_53_percent_fill(self) -> None:
        """Per NEC Ch.9 Table 1: 1 conductor = 53% max fill."""
        spec = calculate_conduit_size("12AWG", wire_count=1)
        assert spec.max_fill_percentage == 53.0

    def test_two_wires_31_percent_fill(self) -> None:
        """Per NEC Ch.9 Table 1: 2 conductors = 31% max fill."""
        spec = calculate_conduit_size("12AWG", wire_count=2)
        assert spec.max_fill_percentage == 31.0

    def test_conduit_references_nec(self) -> None:
        """Standard reference should cite NEC Chapter 9."""
        spec = calculate_conduit_size("12AWG", wire_count=3)
        assert "NEC" in spec.standard_reference


class TestDemandFactors:
    """Test demand factor application per NEC Articles 220.42 and 220.53."""

    def test_lighting_under_3kw_full_load(self) -> None:
        """Per NEC 220.42: first 3000W of lighting at 100%."""
        demand = calculate_demand_factor(2000.0, "lighting")
        assert demand == 2000.0

    def test_lighting_over_3kw_reduced(self) -> None:
        """Per NEC 220.42: lighting over 3000W at 35%."""
        demand = calculate_demand_factor(5000.0, "lighting")
        expected = 3000 + (2000 * 0.35)
        assert demand == expected

    def test_general_power_under_10kw(self) -> None:
        """Per NEC 220.53: first 10kW of appliances at 100%."""
        demand = calculate_demand_factor(8000.0, "general_power")
        assert demand == 8000.0

    def test_general_power_over_10kw_reduced(self) -> None:
        """Per NEC 220.53: appliances over 10kW at 40%."""
        demand = calculate_demand_factor(15000.0, "general_power")
        expected = 10000 + (5000 * 0.40)
        assert demand == expected

    def test_dedicated_no_reduction(self) -> None:
        """Dedicated circuits have no demand factor reduction."""
        demand = calculate_demand_factor(5000.0, "dedicated")
        assert demand == 5000.0


class TestWireAmpacityTable:
    """Verify the NEC 310.16 ampacity table values."""

    def test_known_ampacity_values(self) -> None:
        """Verify all standard wire ampacity values per NEC 310.16."""
        assert WIRE_AMPACITY["14AWG"] == 15.0
        assert WIRE_AMPACITY["12AWG"] == 20.0
        assert WIRE_AMPACITY["10AWG"] == 30.0
        assert WIRE_AMPACITY["8AWG"] == 40.0
        assert WIRE_AMPACITY["6AWG"] == 55.0
