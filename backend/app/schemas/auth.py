from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str
    access_token_expires_in_seconds: int
    refresh_token_expires_in_seconds: int
    session_id: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=512)
