from enum import Enum
from typing import Optional
from pydantic import BaseModel


class NisaType(str, Enum):
    tsumitate = "tsumitate"  # つみたて投資枠
    seichou = "seichou"      # 成長投資枠
    both = "both"            # 両方対応


class AssetCategory(str, Enum):
    domestic_equity = "domestic_equity"   # 国内株式
    foreign_equity = "foreign_equity"     # 外国株式
    global_equity = "global_equity"       # 全世界株式
    domestic_bond = "domestic_bond"       # 国内債券
    foreign_bond = "foreign_bond"         # 外国債券
    balanced = "balanced"                 # バランス型
    reit = "reit"                         # REIT


CATEGORY_LABELS = {
    AssetCategory.domestic_equity: "国内株式",
    AssetCategory.foreign_equity: "外国株式",
    AssetCategory.global_equity: "全世界株式",
    AssetCategory.domestic_bond: "国内債券",
    AssetCategory.foreign_bond: "外国債券",
    AssetCategory.balanced: "バランス",
    AssetCategory.reit: "REIT",
}

NISA_TYPE_LABELS = {
    NisaType.tsumitate: "つみたて投資枠",
    NisaType.seichou: "成長投資枠",
    NisaType.both: "両枠対応",
}

RISK_LABELS = {1: "非常に低い", 2: "低い", 3: "中程度", 4: "高い", 5: "非常に高い"}


class Fund(BaseModel):
    id: str
    name: str
    short_name: str
    fund_company: str
    category: AssetCategory
    nisa_type: NisaType
    expense_ratio: float            # 信託報酬（年率%）
    benchmark: Optional[str] = None
    risk_level: int                 # 1〜5
    min_investment: int = 100       # 最低積立額（円）
    net_assets_billion_jpy: Optional[float] = None
    is_rakuten_card_eligible: bool = True
    inception_date: Optional[str] = None
    description: Optional[str] = None

    @property
    def category_label(self) -> str:
        return CATEGORY_LABELS.get(self.category, self.category)

    @property
    def nisa_type_label(self) -> str:
        return NISA_TYPE_LABELS.get(self.nisa_type, self.nisa_type)

    @property
    def risk_label(self) -> str:
        return RISK_LABELS.get(self.risk_level, str(self.risk_level))

    def model_dump_with_labels(self) -> dict:
        d = self.model_dump()
        d["category_label"] = self.category_label
        d["nisa_type_label"] = self.nisa_type_label
        d["risk_label"] = self.risk_label
        return d
