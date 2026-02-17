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
OPENROUTER_FALLBACK_MODEL = "google/gemini-3-flash-preview"
OPENAI_EMBED_MODEL = "text-embedding-3-small"

MAX_RETRIES = 3
RETRY_BASE_DELAY = 12  # seconds
MAX_CONCURRENT_LLM = 10


def _find_matching_bracket(text: str, start: int) -> int:
    """Find the matching closing bracket using depth counting.

    Handles nested brackets inside JSON strings correctly by tracking
    whether we're inside a string literal.
    """
    open_b = text[start]
    close_b = ']' if open_b == '[' else '}'
    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == open_b:
            depth += 1
        elif ch == close_b:
            depth -= 1
            if depth == 0:
                return i
    return -1


def _fix_newlines_in_strings(text: str) -> str:
    """Replace literal newlines inside JSON string values with \\n.

    Walks the text tracking whether we're inside a quoted string.
    Literal newlines inside strings break JSON — replace with escaped \\n.
    """
    result = []
    in_string = False
    escape = False
    for ch in text:
        if escape:
            result.append(ch)
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            result.append(ch)
            continue
        if ch == '"':
            in_string = not in_string
            result.append(ch)
            continue
        if in_string and ch == '\n':
            result.append('\\n')
            continue
        if in_string and ch == '\r':
            continue  # strip CR
        if in_string and ch == '\t':
            result.append('\\t')
            continue
        result.append(ch)
    return ''.join(result)


def _parse_json_lenient(text: str) -> dict | list:
    """Parse JSON leniently — handle common LLM output issues.

    Applies fixes in escalating order:
    1. Strip markdown fences / leading prose
    2. Direct parse
    3. Fix invalid escape sequences (\\s, \\1, etc)
    4. Fix literal newlines inside strings
    5. Remove trailing commas
    6. Strip control characters
    """
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
            end = _find_matching_bracket(text, start)
            if end > start:
                text = text[start:end + 1]

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fix 1: invalid escape sequences (\s, \1, \p, etc → \\s, \\1, \\p)
    # Also fix \uXXXX where XXXX isn't valid hex
    fixed = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)
    fixed = re.sub(r'\\u(?![0-9a-fA-F]{4})', r'\\\\u', fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Fix 2: literal newlines/tabs inside string values
    fixed2 = _fix_newlines_in_strings(fixed)
    try:
        return json.loads(fixed2)
    except json.JSONDecodeError:
        pass

    # Fix 3: trailing commas before ] or }
    fixed3 = re.sub(r',\s*([}\]])', r'\1', fixed2)
    try:
        return json.loads(fixed3)
    except json.JSONDecodeError:
        pass

    # Fix 4: strip all control characters
    fixed4 = re.sub(r'[\x00-\x1f]', ' ', fixed3)
    return json.loads(fixed4)


class GeminiService:
    """LLM generation via OpenRouter, embeddings via OpenAI."""

    def __init__(self, openrouter_api_key: str, openai_api_key: str):
        self.openrouter_key = openrouter_api_key
        self.http = httpx.AsyncClient(timeout=120)
        self.openai = OpenAI(api_key=openai_api_key)
        self._sem = asyncio.Semaphore(MAX_CONCURRENT_LLM)

    def _openrouter_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.openrouter_key}",
            "Content-Type": "application/json",
        }

    async def _request_with_retry(self, payload: dict) -> dict:
        """Make OpenRouter request with semaphore + retry on rate limit (429)."""
        async with self._sem:
            for attempt in range(MAX_RETRIES + 1):
                response = await self.http.post(
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

    async def generate(self, prompt: str, system: str = "",
                       model: str | None = None) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model or OPENROUTER_MODEL,
            "messages": messages,
            "temperature": 0.1,
        }

        data = await self._request_with_retry(payload)
        return data["choices"][0]["message"]["content"]

    async def generate_json(self, prompt: str, system: str = "",
                            model: str | None = None) -> dict | list:
        text = await self.generate(prompt, system, model=model)
        return _parse_json_lenient(text)

    async def generate_json_with_fallback(self, prompt: str,
                                           system: str = "") -> dict | list:
        """Try flash-lite first, fall back to flash on parse failure."""
        try:
            return await self.generate_json(prompt, system)
        except (json.JSONDecodeError, ValueError):
            logger.info("Flash-lite JSON failed, retrying with flash")
            return await self.generate_json(prompt, system,
                                            model=OPENROUTER_FALLBACK_MODEL)

    async def generate_chat(self, messages: list[dict], system: str = "",
                            model: str | None = None) -> str:
        """Send a full conversation (list of {role, content} dicts) to the LLM."""
        api_messages = []
        if system:
            api_messages.append({"role": "system", "content": system})
        for msg in messages:
            api_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        payload = {
            "model": model or OPENROUTER_MODEL,
            "messages": api_messages,
            "temperature": 0.3,
        }

        data = await self._request_with_retry(payload)
        return data["choices"][0]["message"]["content"]

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
