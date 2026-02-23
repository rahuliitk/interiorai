"""
Price comparison service.

Compares product prices across vendors, identifies best deals,
and calculates price statistics for informed procurement decisions.
"""

from __future__ import annotations

from typing import Any

import structlog
from pydantic import BaseModel, Field

from src.models.product import PriceInfo, Product

logger = structlog.get_logger(__name__)


class PriceComparison(BaseModel):
    """Price comparison result for a single product across vendors."""

    product_id: str
    product_name: str
    cheapest: PriceInfo | None = None
    most_expensive: PriceInfo | None = None
    average_price: float | None = None
    price_range: float | None = Field(
        default=None,
        description="Difference between highest and lowest price",
    )
    vendor_count: int = 0
    all_prices: list[PriceInfo] = Field(default_factory=list)
    savings_percentage: float | None = Field(
        default=None,
        description="Percentage savings between cheapest and most expensive",
    )


class BulkPriceComparison(BaseModel):
    """Price comparison results for multiple products."""

    comparisons: list[PriceComparison]
    total_products: int
    total_cheapest_cost: float
    total_most_expensive_cost: float
    potential_savings: float
    potential_savings_percentage: float


def compare_product_prices(product: Product) -> PriceComparison:
    """Compare prices for a single product across all its vendors.

    Parameters
    ----------
    product:
        The product with vendor pricing information.

    Returns
    -------
    PriceComparison
        Complete price comparison with cheapest/most expensive/average.
    """
    prices = product.prices
    if not prices:
        return PriceComparison(
            product_id=product.id,
            product_name=product.name,
            vendor_count=0,
        )

    sorted_prices = sorted(prices, key=lambda p: p.price)
    cheapest = sorted_prices[0]
    most_expensive = sorted_prices[-1]
    avg = sum(p.price for p in prices) / len(prices)
    price_range = most_expensive.price - cheapest.price

    savings_pct = None
    if most_expensive.price > 0:
        savings_pct = round(
            (price_range / most_expensive.price) * 100, 2
        )

    return PriceComparison(
        product_id=product.id,
        product_name=product.name,
        cheapest=cheapest,
        most_expensive=most_expensive,
        average_price=round(avg, 2),
        price_range=round(price_range, 2),
        vendor_count=len(prices),
        all_prices=sorted_prices,
        savings_percentage=savings_pct,
    )


def compare_bulk_prices(
    products: list[Product],
    quantities: dict[str, int] | None = None,
) -> BulkPriceComparison:
    """Compare prices for multiple products and calculate total savings.

    Parameters
    ----------
    products:
        List of products to compare.
    quantities:
        Optional dict mapping product_id -> quantity for cost calculation.

    Returns
    -------
    BulkPriceComparison
        Aggregated price comparison with total savings potential.
    """
    comparisons: list[PriceComparison] = []
    total_cheapest = 0.0
    total_expensive = 0.0

    for product in products:
        comparison = compare_product_prices(product)
        comparisons.append(comparison)

        qty = 1
        if quantities and product.id in quantities:
            qty = quantities[product.id]

        if comparison.cheapest:
            total_cheapest += comparison.cheapest.price * qty
        if comparison.most_expensive:
            total_expensive += comparison.most_expensive.price * qty

    potential_savings = total_expensive - total_cheapest
    savings_pct = (
        round((potential_savings / total_expensive) * 100, 2)
        if total_expensive > 0
        else 0
    )

    logger.info(
        "bulk_price_comparison",
        product_count=len(products),
        total_cheapest=round(total_cheapest, 2),
        total_expensive=round(total_expensive, 2),
        potential_savings=round(potential_savings, 2),
    )

    return BulkPriceComparison(
        comparisons=comparisons,
        total_products=len(products),
        total_cheapest_cost=round(total_cheapest, 2),
        total_most_expensive_cost=round(total_expensive, 2),
        potential_savings=round(potential_savings, 2),
        potential_savings_percentage=savings_pct,
    )


def find_best_vendor_bundle(
    products: list[Product],
) -> dict[str, Any]:
    """Find the vendor that offers the best overall price for a bundle.

    Evaluates which single vendor can supply the most products at
    competitive prices, useful for reducing the number of suppliers.

    Parameters
    ----------
    products:
        Products to bundle.

    Returns
    -------
    dict
        Vendor scores with product coverage and estimated costs.
    """
    vendor_scores: dict[str, dict[str, Any]] = {}

    for product in products:
        for price in product.prices:
            vid = price.vendor_id
            if vid not in vendor_scores:
                vendor_scores[vid] = {
                    "vendor_id": vid,
                    "vendor_name": price.vendor_name,
                    "products_available": 0,
                    "total_cost": 0.0,
                    "product_ids": [],
                }

            vendor_scores[vid]["products_available"] += 1
            vendor_scores[vid]["total_cost"] += price.price
            vendor_scores[vid]["product_ids"].append(product.id)

    # Sort by coverage (more products) then by total cost
    ranked = sorted(
        vendor_scores.values(),
        key=lambda v: (-v["products_available"], v["total_cost"]),
    )

    return {
        "total_products": len(products),
        "vendors_ranked": ranked,
        "best_coverage_vendor": ranked[0] if ranked else None,
    }
