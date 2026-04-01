from datetime import datetime
from typing import Optional

from app.data.funds import SEED_FUNDS
from app.models.product import Fund, AssetCategory, NisaType
from app.models.allowance import NisaAllowance, NisaBucket

_funds: dict[str, Fund] = {}
_allowance: NisaAllowance = NisaAllowance(
    year=datetime.now().year,
    tsumitate=NisaBucket(annual_limit=1_200_000, lifetime_limit=12_000_000),
    seichou=NisaBucket(annual_limit=2_400_000, lifetime_limit=12_000_000),
)


def seed() -> None:
    for fund in SEED_FUNDS:
        _funds[fund.id] = fund


def get_all_funds() -> list[Fund]:
    return list(_funds.values())


def get_fund(fund_id: str) -> Optional[Fund]:
    return _funds.get(fund_id)


def filter_funds(
    category: Optional[str] = None,
    nisa_type: Optional[str] = None,
    max_expense: Optional[float] = None,
    q: Optional[str] = None,
) -> list[Fund]:
    results = list(_funds.values())

    if category and category != "all":
        try:
            cat = AssetCategory(category)
            results = [f for f in results if f.category == cat]
        except ValueError:
            pass

    if nisa_type and nisa_type != "all":
        try:
            nt = NisaType(nisa_type)
            if nt == NisaType.tsumitate:
                results = [f for f in results if f.nisa_type in (NisaType.tsumitate, NisaType.both)]
            elif nt == NisaType.seichou:
                results = [f for f in results if f.nisa_type in (NisaType.seichou, NisaType.both)]
        except ValueError:
            pass

    if max_expense is not None:
        results = [f for f in results if f.expense_ratio <= max_expense]

    if q:
        q_lower = q.lower()
        results = [
            f for f in results
            if q_lower in f.name.lower() or q_lower in f.short_name.lower() or q_lower in f.fund_company.lower()
        ]

    return sorted(results, key=lambda f: f.expense_ratio)


def get_allowance() -> NisaAllowance:
    return _allowance


def update_allowance_bucket(bucket: str, used_this_year: int, used_lifetime: int) -> NisaAllowance:
    global _allowance
    if bucket == "tsumitate":
        _allowance = NisaAllowance(
            year=_allowance.year,
            tsumitate=NisaBucket(
                annual_limit=_allowance.tsumitate.annual_limit,
                lifetime_limit=_allowance.tsumitate.lifetime_limit,
                used_this_year=used_this_year,
                used_lifetime=used_lifetime,
            ),
            seichou=_allowance.seichou,
        )
    elif bucket == "seichou":
        _allowance = NisaAllowance(
            year=_allowance.year,
            tsumitate=_allowance.tsumitate,
            seichou=NisaBucket(
                annual_limit=_allowance.seichou.annual_limit,
                lifetime_limit=_allowance.seichou.lifetime_limit,
                used_this_year=used_this_year,
                used_lifetime=used_lifetime,
            ),
        )
    return _allowance
