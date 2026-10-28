from urllib.parse import parse_qs, urlparse

from app.core.config import Settings
from app.services import google_oauth
from app.services.google_oauth import GMAIL_READONLY_SCOPE


def test_authorization_url_requests_read_only_scopes_and_pkce():
    settings = Settings.from_env({
        "GOOGLE_CLIENT_ID": "client.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:8000/api/auth/google/callback",
    })
    url, verifier = google_oauth.create_authorization_request(settings, "state-value")
    query = parse_qs(urlparse(url).query)
    scopes = set(query["scope"][0].split())
    assert GMAIL_READONLY_SCOPE in scopes
    assert "openid" in scopes and "email" in scopes
    assert not any("gmail.send" in scope or "mail.google.com" in scope for scope in scopes)
    assert query["state"] == ["state-value"]
    assert query["access_type"] == ["offline"]
    assert query["prompt"] == ["consent"]
    assert query["code_challenge"]
    assert query["code_challenge_method"] == ["S256"]
    assert verifier and len(verifier) >= 43
