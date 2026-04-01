from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.data import store

router = APIRouter()


@router.get("/compare")
def compare_funds(ids: str = ""):
    fund_ids = [i.strip() for i in ids.split(",") if i.strip()]
    if not fund_ids:
        return []

    funds = []
    for fid in fund_ids[:4]:  # 最大4本
        f = store.get_fund(fid)
        if f:
            funds.append(f.model_dump_with_labels())

    if not funds:
        return JSONResponse(status_code=404, content={"detail": "指定されたファンドが見つかりません"})

    return funds
