# Portal quickstart - FastAPI

This pattern works with plain FastAPI routes. Portal does not require a Python SDK.

## Install

```sh
python -m venv .venv
. .venv/bin/activate
pip install fastapi uvicorn
```

On PowerShell, activate with:

```powershell
.venv\Scripts\Activate.ps1
```

## `main.py`

```py
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type", "accept"],
)

manifest = {
    "portal_version": "0.1",
    "name": "FastAPI Portal",
    "brief": "A minimal Portal served from FastAPI.",
    "tools": [
        {
            "name": "ping",
            "description": "Returns pong and echoes msg.",
            "params": {
                "msg": {"type": "string", "description": "Optional message to echo."}
            },
        }
    ],
    "call_endpoint": "/portal/call",
    "auth": "none",
    "pricing": {"model": "free"},
}


class PortalCall(BaseModel):
    tool: str
    params: dict[str, Any] = Field(default_factory=dict)


@app.get("/portal")
def get_portal() -> dict[str, Any]:
    return manifest


@app.post("/portal/call")
def call_portal(call: PortalCall) -> JSONResponse:
    if call.tool != "ping":
        return error(f"tool '{call.tool}' not in manifest", "NOT_FOUND", 404)
    return JSONResponse({"ok": True, "result": {"pong": True, "msg": call.params.get("msg")}})


def error(message: str, code: str, status: int) -> JSONResponse:
    return JSONResponse({"ok": False, "error": message, "code": code}, status_code=status)
```

## Verify

```sh
uvicorn main:app --reload --port 3000
curl http://localhost:3000/portal
pnpm conformance http://localhost:3000/portal
```
