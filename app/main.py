from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os

from app.data.store import seed
from app.routers import products, compare, allowance, charts

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

app = FastAPI(title="NISA分析ツール")

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

app.include_router(products.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(allowance.router, prefix="/api")
app.include_router(charts.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    seed()


@app.get("/manifest.json")
def manifest():
    return FileResponse(os.path.join(ROOT_DIR, "manifest.json"), media_type="application/manifest+json")


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/compare")
def compare_page(request: Request, ids: str = ""):
    return templates.TemplateResponse(request, "compare.html", {"ids": ids})


@app.get("/allowance")
def allowance_page(request: Request):
    return templates.TemplateResponse(request, "allowance.html")
