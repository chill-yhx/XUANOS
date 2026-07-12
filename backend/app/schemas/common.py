from pydantic import BaseModel


class ResponseMeta(BaseModel):
    request_id: str
    next_cursor: str | None = None


class Envelope[DataT](BaseModel):
    data: DataT
    meta: ResponseMeta
