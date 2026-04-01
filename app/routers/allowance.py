from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.data import store
from app.models.allowance import AllowanceUpdateRequest

router = APIRouter()


@router.get("/allowance")
def get_allowance():
    return store.get_allowance()


@router.put("/allowance/{bucket}")
def update_allowance(bucket: str, body: AllowanceUpdateRequest):
    if bucket not in ("tsumitate", "seichou"):
        return JSONResponse(status_code=400, content={"detail": "bucketは tsumitate または seichou を指定してください"})
    allowance = store.update_allowance_bucket(
        bucket=bucket,
        used_this_year=body.used_this_year,
        used_lifetime=body.used_lifetime,
    )
    return allowance
