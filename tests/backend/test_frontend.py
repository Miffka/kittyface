from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_routes_get_the_shell():
    for path in ["/", "/history/abc"]:
        r = client.get(path)
        assert r.status_code == 200
        assert r.text == "<html>shell</html>"


def test_assets_are_served():
    assert client.get("/assets/app.js").text == "console.log(1)"


def test_api_paths_skip_the_shell():
    assert client.get("/api/v1/nope").status_code == 404
    assert client.get("/api/v1/config").json()["notice_version"]
