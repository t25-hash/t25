from typing import Optional
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.data import store

router = APIRouter()


@router.get("/products")
def list_products(
    category: Optional[str] = None,
    nisa_type: Optional[str] = None,
    max_expense: Optional[float] = None,
    q: Optional[str] = None,
):
    funds = store.filter_funds(category=category, nisa_type=nisa_type, max_expense=max_expense, q=q)
    return [f.model_dump_with_labels() for f in funds]


@router.get("/products/{fund_id}")
def get_product(fund_id: str):
    fund = store.get_fund(fund_id)
    if fund is None:
        return JSONResponse(status_code=404, content={"detail": "ファンドが見つかりません"})
    return fund.model_dump_with_labels()
