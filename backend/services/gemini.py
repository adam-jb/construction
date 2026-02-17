import asyncio
import base64
import json
import logging
import re

import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "google/gemini-2.5-flash-lite"
OPENAI_EMBED_MODEL = "text-embedding-3-small"

MAX_RETRIES = 3
RETRY_BASE_DELAY = 30  # seconds


def _parse_json_lenient(text: str) -> dict | list:
    """Parse JSON leniently — handle common LLM output issues."""
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # If text has leading prose before JSON, extract the JSON part
    if text and text[0] not in "[{":
        match = re.search(r'[\[{]', text)
        if match:
            start = match.start()
            bracket = text[start]
            close = ']' if bracket == '[' else '}'
            last_close = text.rfind(close)
            if last_close > start:
                text = text[start:last_close + 1]

    def _try_parse(t: str):
        try:
            return json.loads(t)
        except json.JSONDecodeError:
            pass
        # Fix unescaped backslashes
        fixed = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', t)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass
        # Remove control characters
        fixed2 = re.sub(r'[\x00-\x1f]', ' ', fixed)
        return json.loads(fixed2)

    return _try_parse(text)


class GeminiService:
    """LLM generation via OpenRouter, embeddings via OpenAI."""

    def __init__(self, openrouter_api_key: str, openai_api_key: str):
        self.openrouter_key = openrouter_api_key
        self.http = httpx.Client(timeout=120)
        self.openai = OpenAI(api_key=openai_api_key)

    def _openrouter_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.openrouter_key}",
            "Content-Type": "application/json",
        }

    async def _request_with_retry(self, payload: dict) -> dict:
        """Make OpenRouter request with retry on rate limit (429)."""
        for attempt in range(MAX_RETRIES + 1):
            response = await asyncio.to_thread(
                self.http.post,
                f"{OPENROUTER_BASE}/chat/completions",
                headers=self._openrouter_headers(),
                json=payload,
            )
            if response.status_code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (attempt + 1)
                logger.warning(f"Rate limited, waiting {delay}s (attempt {attempt + 1})")
                await asyncio.sleep(delay)
                continue
            response.raise_for_status()
            return response.json()
        # Should not reach here, but just in case
        response.raise_for_status()
        return response.json()

    async def generate(self, prompt: str, system: str = "") -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": 0.1,
        }

        data = await self._request_with_retry(payload)
        return data["choices"][0]["message"]["content"]

    async def generate_json(self, prompt: str, system: str = "") -> dict | list:
        text = await self.generate(prompt, system)
        return _parse_json_lenient(text)

    async def generate_with_image(self, prompt: str, image_bytes: bytes) -> str:
        b64 = base64.b64encode(image_bytes).decode()
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                },
            ],
        }]

        payload = {
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": 0.1,
        }

        data = await self._request_with_retry(payload)
        return data["choices"][0]["message"]["content"]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Batch embed via OpenAI."""
        result = await asyncio.to_thread(
            self.openai.embeddings.create,
            model=OPENAI_EMBED_MODEL,
            input=texts,
        )
        return [e.embedding for e in result.data]

    async def embed_query(self, text: str) -> list[float]:
        """Embed single query via OpenAI."""
        result = await asyncio.to_thread(
            self.openai.embeddings.create,
            model=OPENAI_EMBED_MODEL,
            input=text,
        )
        return result.data[0].embedding
