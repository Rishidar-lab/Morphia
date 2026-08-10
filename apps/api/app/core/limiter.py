"""Shared slowapi Limiter instance.

Split out from app.main so routers can apply @limiter.limit(...) to
individual routes without a circular import on the FastAPI app module.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
