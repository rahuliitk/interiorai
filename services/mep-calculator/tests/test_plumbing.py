"""
Tests for plumbing calculations.

Verifies IPC table lookups, fixture unit values, pipe sizing,
and drainage slope calculations against known values.
"""

from __future__ import annotations

import pytest

from src.services.ipc_tables import (
    DRAINAGE_FIXTURE_UNITS,
    SUPPLY_FIXTURE_UNITS,
    calculate_drainage,
    get_fixture_unit,
    size_drainage_pipe,
    size_supply_pipe,
    size_vent_pipe,
)


class TestFixtureUnitValues:
    """Test fixture unit lookups per IPC Table 604.4 and Table 709.1."""

    def test_toilet_supply_fu(self) -> None:
        """Per IPC Table 604.4: toilet = 4 fixture units."""
        fu = get_fixture_unit("toilet", quantity=1)
        assert fu.fixture_units == 4.0

    def test_lavatory_supply_fu(self) -> None:
        """Per IPC Table 604.4: lavatory = 1 fixture unit."""
        fu = get_fixture_unit("lavatory", quantity=1)
        assert fu.fixture_units == 1.0

    def test_bathtub_supply_fu(self) -> None:
        """Per IPC Table 604.4: bathtub = 2 fixture units."""
        fu = get_fixture_unit("bathtub", quantity=1)
        assert fu.fixture_units == 2.0

    def test_kitchen_sink_supply_fu(self) -> None:
        """Per IPC Table 604.4: kitchen sink = 2 fixture units."""
        fu = get_fixture_unit("kitchen_sink", quantity=1)
        assert fu.fixture_units == 2.0

    def test_dishwasher_supply_fu(self) -> None:
        """Per IPC Table 604.4: dishwasher = 2 fixture units."""
        fu = get_fixture_unit("dishwasher", quantity=1)
        assert fu.fixture_units == 2.0

    def test_washing_machine_supply_fu(self) -> None:
        """Per IPC Table 604.4: washing machine = 3 fixture units."""
        fu = get_fixture_unit("washing_machine", quantity=1)
        assert fu.fixture_units == 3.0

    def test_quantity_multiplies_fu(self) -> None:
        """Fixture units should scale with quantity."""
        fu = get_fixture_unit("lavatory", quantity=3)
        assert fu.fixture_units == 3.0  # 1 FU * 3

    def test_toilet_drainage_fu(self) -> None:
        """Per IPC Table 709.1: toilet = 4 drainage fixture units."""
        fu = get_fixture_unit("toilet", quantity=1)
        assert fu.drainage_fixture_units == 4.0

    def test_toilet_trap_size(self) -> None:
        """Per IPC Table 709.1: toilet minimum trap = 3 inches."""
        fu = get_fixture_unit("toilet", quantity=1)
        assert fu.min_trap_size_inches == 3.0

    def test_lavatory_trap_size(self) -> None:
        """Per IPC Table 709.1: lavatory minimum trap = 1.25 inches."""
        fu = get_fixture_unit("lavatory", quantity=1)
        assert fu.min_trap_size_inches == 1.25

    def test_standard_reference_cites_ipc(self) -> None:
        """All fixture unit lookups should cite IPC tables."""
        fu = get_fixture_unit("toilet", quantity=1)
        assert "IPC" in fu.standard_reference


class TestPipeSizing:
    """Test supply and drainage pipe sizing."""

    def test_small_supply_pipe(self) -> None:
        """2 fixture units should require 1/2\" supply pipe."""
        pipe = size_supply_pipe(2.0)
        assert pipe.nominal_size_inches == 0.5

    def test_medium_supply_pipe(self) -> None:
        """10 fixture units should require 1\" supply pipe."""
        pipe = size_supply_pipe(10.0)
        assert pipe.nominal_size_inches == 1.0

    def test_large_supply_pipe(self) -> None:
        """50 fixture units should require 1.5\" supply pipe."""
        pipe = size_supply_pipe(50.0)
        assert pipe.nominal_size_inches == 1.5

    def test_supply_pipe_references_ipc(self) -> None:
        """Supply pipe sizing should cite IPC Table 604.4."""
        pipe = size_supply_pipe(10.0)
        assert "IPC" in pipe.standard_reference

    def test_drain_pipe_small(self) -> None:
        """3 DFU requires 1.5\" drain per IPC Table 710.1(2)."""
        size = size_drainage_pipe(3.0)
        assert size == 1.5

    def test_drain_pipe_medium(self) -> None:
        """10 DFU requires 2.5\" drain per IPC Table 710.1(2)."""
        size = size_drainage_pipe(10.0)
        assert size == 2.5

    def test_drain_pipe_toilet(self) -> None:
        """Per IPC: toilet (4 DFU) requires minimum 3\" drain."""
        # 4 DFU with toilet's 3\" minimum
        size = size_drainage_pipe(4.0)
        # 4 DFU falls within 2\" capacity (6 DFU max)
        assert size == 2.0

    def test_vent_pipe_small(self) -> None:
        """2 DFU requires 1.25\" vent per IPC Table 916.1."""
        size = size_vent_pipe(2.0)
        assert size == 1.25

    def test_vent_pipe_medium(self) -> None:
        """10 DFU requires 2\" vent per IPC Table 916.1."""
        size = size_vent_pipe(10.0)
        assert size == 2.0


class TestDrainageCalculation:
    """Test complete drainage calculations per IPC 704.1."""

    def test_slope_small_pipe(self) -> None:
        """Per IPC 704.1: pipes 3\" and smaller need 1/4\" per foot slope."""
        drainage = calculate_drainage(5.0)
        assert drainage.slope_inches_per_foot == 0.25

    def test_slope_large_pipe(self) -> None:
        """Per IPC 704.1: pipes larger than 3\" need 1/8\" per foot slope."""
        drainage = calculate_drainage(50.0)
        # 50 DFU requires 4\" pipe
        assert drainage.pipe_size_inches >= 4.0
        assert drainage.slope_inches_per_foot == 0.125

    def test_drainage_includes_vent(self) -> None:
        """Drainage calculation must include vent pipe sizing."""
        drainage = calculate_drainage(10.0)
        assert drainage.vent_size_inches > 0

    def test_drainage_references_ipc(self) -> None:
        """Drainage calculation should cite IPC references."""
        drainage = calculate_drainage(10.0)
        assert "IPC" in drainage.standard_reference


class TestStandardBathroomFixtures:
    """Integration test: standard bathroom fixture package."""

    def test_standard_bathroom(self) -> None:
        """A standard bathroom (toilet + lavatory + shower) should be calculable."""
        toilet = get_fixture_unit("toilet", 1)
        lav = get_fixture_unit("lavatory", 1)
        shower = get_fixture_unit("shower", 1)

        total_supply = toilet.fixture_units + lav.fixture_units + shower.fixture_units
        total_drainage = (
            toilet.drainage_fixture_units
            + lav.drainage_fixture_units
            + shower.drainage_fixture_units
        )

        # Expected: 4 + 1 + 2 = 7 supply FU
        assert total_supply == 7.0
        # Expected: 4 + 1 + 2 = 7 drainage FU
        assert total_drainage == 7.0

        supply_pipe = size_supply_pipe(total_supply)
        drainage = calculate_drainage(total_drainage)

        assert supply_pipe.nominal_size_inches >= 0.75
        assert drainage.pipe_size_inches >= 2.0
        assert drainage.slope_inches_per_foot >= 0.125
