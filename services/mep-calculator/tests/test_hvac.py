"""
Tests for HVAC calculations.

Verifies ASHRAE Manual J cooling/heating load calculations,
duct sizing, and equipment recommendations against known values.
"""

from __future__ import annotations

import math

import pytest

from src.services.ashrae_methods import (
    BASE_COOLING_LOAD_BTU_SQFT,
    BASE_HEATING_LOAD_BTU_SQFT,
    CFM_PER_TON,
    INSULATION_FACTOR,
    OCCUPANT_LATENT_BTU,
    OCCUPANT_SENSIBLE_BTU,
    WATTS_TO_BTU,
    calculate_cooling_load,
    calculate_duct_sizing,
    calculate_heating_load,
    recommend_equipment,
)


class TestCoolingLoad:
    """Test cooling load calculation per ASHRAE Manual J."""

    def test_standard_room_cooling(self) -> None:
        """A 200 sqft room in hot-humid climate should produce a reasonable load."""
        result = calculate_cooling_load(
            room_area_sqft=200.0,
            orientation="south",
            insulation="average",
            climate_zone="hot_humid",
            occupancy=2,
            window_area_sqft=20.0,
            num_external_walls=2,
        )
        # Should be positive and reasonable (roughly 1-2 tons for a 200 sqft room)
        assert result.total_load_btu > 0
        assert result.load_tons > 0
        assert result.load_tons < 5.0  # 200 sqft should not need more than 5 tons

    def test_larger_room_more_load(self) -> None:
        """A larger room should have a higher cooling load than a smaller one."""
        small = calculate_cooling_load(room_area_sqft=100.0)
        large = calculate_cooling_load(room_area_sqft=400.0)
        assert large.total_load_btu > small.total_load_btu

    def test_poor_insulation_more_load(self) -> None:
        """Poor insulation should increase cooling load vs. good insulation."""
        poor = calculate_cooling_load(room_area_sqft=200.0, insulation="poor")
        good = calculate_cooling_load(room_area_sqft=200.0, insulation="good")
        assert poor.total_load_btu > good.total_load_btu

    def test_west_orientation_more_than_north(self) -> None:
        """West-facing rooms should have higher solar gain than north-facing."""
        west = calculate_cooling_load(room_area_sqft=200.0, orientation="west")
        north = calculate_cooling_load(room_area_sqft=200.0, orientation="north")
        assert west.total_load_btu > north.total_load_btu

    def test_more_occupants_more_load(self) -> None:
        """More occupants should increase the cooling load."""
        few = calculate_cooling_load(room_area_sqft=200.0, occupancy=1)
        many = calculate_cooling_load(room_area_sqft=200.0, occupancy=5)
        assert many.total_load_btu > few.total_load_btu

    def test_sensible_plus_latent_equals_total(self) -> None:
        """Total load should equal sensible + latent."""
        result = calculate_cooling_load(room_area_sqft=200.0)
        assert abs(result.total_load_btu - (result.sensible_load_btu + result.latent_load_btu)) < 1

    def test_load_breakdown_present(self) -> None:
        """The breakdown dict should contain expected components."""
        result = calculate_cooling_load(room_area_sqft=200.0)
        assert "envelope_btu" in result.breakdown
        assert "window_solar_btu" in result.breakdown
        assert "occupant_sensible_btu" in result.breakdown
        assert "occupant_latent_btu" in result.breakdown
        assert "equipment_btu" in result.breakdown
        assert "lighting_btu" in result.breakdown

    def test_hot_humid_higher_than_cold(self) -> None:
        """Hot-humid climate should have higher cooling load than cold climate."""
        hot = calculate_cooling_load(room_area_sqft=200.0, climate_zone="hot_humid")
        cold = calculate_cooling_load(room_area_sqft=200.0, climate_zone="cold")
        assert hot.total_load_btu > cold.total_load_btu

    def test_standard_reference_cites_ashrae(self) -> None:
        """Result should cite ASHRAE Manual J."""
        result = calculate_cooling_load(room_area_sqft=200.0)
        assert "ASHRAE" in result.standard_reference

    def test_tons_calculation(self) -> None:
        """1 ton = 12,000 BTU/hr."""
        result = calculate_cooling_load(room_area_sqft=200.0)
        expected_tons = result.total_load_btu / 12000.0
        assert abs(result.load_tons - expected_tons) < 0.01


class TestHeatingLoad:
    """Test heating load calculation per ASHRAE Manual J."""

    def test_standard_room_heating(self) -> None:
        """A standard room should produce a positive heating load."""
        result = calculate_heating_load(
            room_area_sqft=200.0,
            insulation="average",
            climate_zone="cold",
        )
        assert result.total_load_btu > 0

    def test_cold_climate_higher_heating(self) -> None:
        """Cold climate should have higher heating load than hot-humid."""
        cold = calculate_heating_load(room_area_sqft=200.0, climate_zone="cold")
        hot = calculate_heating_load(room_area_sqft=200.0, climate_zone="hot_humid")
        assert cold.total_load_btu > hot.total_load_btu

    def test_poor_insulation_more_heating(self) -> None:
        """Poor insulation should increase heating load."""
        poor = calculate_heating_load(room_area_sqft=200.0, insulation="poor")
        good = calculate_heating_load(room_area_sqft=200.0, insulation="good")
        assert poor.total_load_btu > good.total_load_btu

    def test_heating_breakdown_present(self) -> None:
        """Heating breakdown should include envelope and window components."""
        result = calculate_heating_load(room_area_sqft=200.0)
        assert "envelope_btu" in result.breakdown
        assert "window_btu" in result.breakdown


class TestDuctSizing:
    """Test duct sizing per ASHRAE Fundamentals Chapter 21."""

    def test_duct_for_1_ton(self) -> None:
        """1 ton (12,000 BTU) should need 400 CFM."""
        result = calculate_duct_sizing(12000.0)
        assert result.supply_cfm == 400.0

    def test_duct_for_2_tons(self) -> None:
        """2 tons (24,000 BTU) should need 800 CFM."""
        result = calculate_duct_sizing(24000.0)
        assert result.supply_cfm == 800.0

    def test_duct_dimensions_positive(self) -> None:
        """All duct dimensions should be positive."""
        result = calculate_duct_sizing(12000.0)
        assert result.duct_width_inches > 0
        assert result.duct_height_inches > 0
        assert result.round_duct_diameter_inches > 0

    def test_larger_load_bigger_duct(self) -> None:
        """Larger cooling load should need larger duct."""
        small = calculate_duct_sizing(12000.0)
        large = calculate_duct_sizing(48000.0)
        assert large.round_duct_diameter_inches > small.round_duct_diameter_inches

    def test_cfm_per_ton(self) -> None:
        """Per ASHRAE: 400 CFM per ton of cooling."""
        assert CFM_PER_TON == 400.0


class TestEquipmentRecommendation:
    """Test equipment sizing and recommendations."""

    def test_small_room_split_ac(self) -> None:
        """A small load should recommend split AC."""
        equipment = recommend_equipment(12000.0, 8000.0)
        assert len(equipment) >= 1
        types = [e.equipment_type for e in equipment]
        assert any("Split" in t for t in types)

    def test_small_room_window_option(self) -> None:
        """Small loads (<= 2 tons) should include window AC option."""
        equipment = recommend_equipment(18000.0, 10000.0)
        types = [e.equipment_type for e in equipment]
        assert any("Window" in t for t in types)

    def test_large_room_ducted_option(self) -> None:
        """Large loads (>= 2.5 tons) should include ducted option."""
        equipment = recommend_equipment(36000.0, 20000.0)
        types = [e.equipment_type for e in equipment]
        assert any("ducted" in t.lower() for t in types)

    def test_equipment_capacity_matches(self) -> None:
        """Equipment capacity should be >= calculated load (with safety margin)."""
        cooling_btu = 18000.0
        equipment = recommend_equipment(cooling_btu, 10000.0)
        for eq in equipment:
            assert eq.capacity_btu >= cooling_btu

    def test_equipment_has_energy_rating(self) -> None:
        """All equipment should include an energy rating."""
        equipment = recommend_equipment(18000.0, 10000.0)
        for eq in equipment:
            assert eq.energy_rating is not None
            assert len(eq.energy_rating) > 0


class TestInsulationFactors:
    """Verify insulation factor values."""

    def test_poor_insulation_factor(self) -> None:
        """Poor insulation factor should be > 1.0 (increases load)."""
        assert INSULATION_FACTOR["poor"] > 1.0

    def test_excellent_insulation_factor(self) -> None:
        """Excellent insulation factor should be < 1.0 (decreases load)."""
        assert INSULATION_FACTOR["excellent"] < 1.0

    def test_average_insulation_factor(self) -> None:
        """Average insulation factor should be 1.0 (baseline)."""
        assert INSULATION_FACTOR["average"] == 1.0


class TestOccupantHeatGain:
    """Verify ASHRAE occupant heat gain values."""

    def test_sensible_heat_per_occupant(self) -> None:
        """Per ASHRAE Fundamentals Table 1: ~230 BTU/hr sensible per person."""
        assert OCCUPANT_SENSIBLE_BTU == 230.0

    def test_latent_heat_per_occupant(self) -> None:
        """Per ASHRAE Fundamentals Table 1: ~190 BTU/hr latent per person."""
        assert OCCUPANT_LATENT_BTU == 190.0

    def test_watts_to_btu_conversion(self) -> None:
        """1 watt = 3.412 BTU/hr."""
        assert abs(WATTS_TO_BTU - 3.412) < 0.001
