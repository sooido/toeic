import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("READING_COACH_PORT", "8000"))


def read_static_file(path: Path) -> bytes:
    return path.read_bytes()


def call_openai(api_key: str, model: str, prompt: str) -> dict:
    payload = json.dumps(
        {
            "model": model,
            "input": prompt,
        }
    ).encode("utf-8")

    req = request.Request(
        "https://api.openai.com/v1/responses",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with request.urlopen(req, timeout=90) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw)


def extract_output_text(response_json: dict) -> str:
    if response_json.get("output_text"):
        return response_json["output_text"]

    chunks = []
    for item in response_json.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                chunks.append(text)
    return "\n".join(chunks).strip()


class ReadingCoachHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._serve_file("index.html", "text/html; charset=utf-8")
            return
        if self.path == "/styles.css":
            self._serve_file("styles.css", "text/css; charset=utf-8")
            return
        if self.path == "/app.js":
            self._serve_file("app.js", "application/javascript; charset=utf-8")
            return

        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self):
        if self.path != "/api/generate":
            self._send_json({"error": "Not found"}, status=404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")

        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json({"error": "잘못된 요청 형식입니다."}, status=400)
            return

        api_key = (body.get("apiKey") or "").strip()
        model = (body.get("model") or "").strip()
        prompt = (body.get("prompt") or "").strip()

        if not api_key or not model or not prompt:
            self._send_json({"error": "API 키, 모델, 프롬프트가 모두 필요합니다."}, status=400)
            return

        try:
            response_json = call_openai(api_key, model, prompt)
            output_text = extract_output_text(response_json)
            problem_set = json.loads(output_text)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self._send_json(
                {"error": f"OpenAI API 호출이 실패했습니다. ({exc.code}) {detail}"},
                status=exc.code,
            )
            return
        except error.URLError as exc:
            self._send_json(
                {"error": f"네트워크 오류가 발생했습니다: {exc.reason}"},
                status=502,
            )
            return
        except json.JSONDecodeError:
            self._send_json(
                {"error": "모델 응답을 JSON으로 해석하지 못했습니다. 다시 시도해 주세요."},
                status=502,
            )
            return
        except Exception as exc:
            self._send_json({"error": f"예상치 못한 오류가 발생했습니다: {exc}"}, status=500)
            return

        self._send_json({"problemSet": problem_set})

    def log_message(self, format, *args):
        return

    def _serve_file(self, name: str, content_type: str):
        target = ROOT / name
        if not target.exists():
            self._send_json({"error": "Not found"}, status=404)
            return

        data = read_static_file(target)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload: dict, status: int = 200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    server = ThreadingHTTPServer((HOST, PORT), ReadingCoachHandler)
    print(f"Reading Coach server is running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
