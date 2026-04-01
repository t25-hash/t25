from fastapi import APIRouter

from app.data import store
from app.models.product import CATEGORY_LABELS

router = APIRouter()

EXPENSE_COLORS = {
    "low": "#22c55e",    # 緑 < 0.1%
    "mid": "#f59e0b",    # 黄 0.1〜0.2%
    "high": "#ef4444",   # 赤 > 0.2%
}


def _expense_color(ratio: float) -> str:
    if ratio < 0.1:
        return EXPENSE_COLORS["low"]
    elif ratio < 0.2:
        return EXPENSE_COLORS["mid"]
    return EXPENSE_COLORS["high"]


@router.get("/charts/expense-ratio")
def chart_expense_ratio(ids: str = ""):
    fund_ids = [i.strip() for i in ids.split(",") if i.strip()]
    if not fund_ids:
        funds = store.get_all_funds()
    else:
        funds = [f for fid in fund_ids if (f := store.get_fund(fid))]

    funds = sorted(funds, key=lambda f: f.expense_ratio)
    labels = [f.short_name for f in funds]
    data = [round(f.expense_ratio, 5) for f in funds]
    colors = [_expense_color(f.expense_ratio) for f in funds]

    return {
        "labels": labels,
        "datasets": [
            {
                "label": "信託報酬（年率%）",
                "data": data,
                "backgroundColor": colors,
                "borderRadius": 4,
            }
        ],
    }


@router.get("/charts/category-distribution")
def chart_category_distribution(ids: str = ""):
    fund_ids = [i.strip() for i in ids.split(",") if i.strip()]
    if not fund_ids:
        funds = store.get_all_funds()
    else:
        funds = [f for fid in fund_ids if (f := store.get_fund(fid))]

    counts: dict[str, int] = {}
    for f in funds:
        label = CATEGORY_LABELS.get(f.category, f.category.value)
        counts[label] = counts.get(label, 0) + 1

    palette = [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
        "#8b5cf6", "#06b6d4", "#f97316",
    ]

    labels = list(counts.keys())
    data = [counts[lb] for lb in labels]
    colors = [palette[i % len(palette)] for i in range(len(labels))]

    return {
        "labels": labels,
        "datasets": [
            {
                "label": "カテゴリ分布",
                "data": data,
                "backgroundColor": colors,
            }
        ],
    }
