from pydantic import BaseModel, computed_field


class NisaBucket(BaseModel):
    annual_limit: int
    lifetime_limit: int
    used_this_year: int = 0
    used_lifetime: int = 0

    @computed_field
    @property
    def remaining_this_year(self) -> int:
        return max(0, self.annual_limit - self.used_this_year)

    @computed_field
    @property
    def remaining_lifetime(self) -> int:
        return max(0, self.lifetime_limit - self.used_lifetime)

    @computed_field
    @property
    def year_usage_pct(self) -> float:
        if self.annual_limit == 0:
            return 0.0
        return min(100.0, self.used_this_year / self.annual_limit * 100)

    @computed_field
    @property
    def lifetime_usage_pct(self) -> float:
        if self.lifetime_limit == 0:
            return 0.0
        return min(100.0, self.used_lifetime / self.lifetime_limit * 100)


class NisaAllowance(BaseModel):
    year: int
    tsumitate: NisaBucket = NisaBucket(
        annual_limit=1_200_000, lifetime_limit=12_000_000
    )
    seichou: NisaBucket = NisaBucket(
        annual_limit=2_400_000, lifetime_limit=12_000_000
    )

    @computed_field
    @property
    def total_lifetime_limit(self) -> int:
        return 18_000_000

    @computed_field
    @property
    def total_used_lifetime(self) -> int:
        return self.tsumitate.used_lifetime + self.seichou.used_lifetime

    @computed_field
    @property
    def total_remaining_lifetime(self) -> int:
        return max(0, self.total_lifetime_limit - self.total_used_lifetime)

    @computed_field
    @property
    def total_lifetime_usage_pct(self) -> float:
        return min(100.0, self.total_used_lifetime / self.total_lifetime_limit * 100)


class AllowanceUpdateRequest(BaseModel):
    used_this_year: int
    used_lifetime: int
