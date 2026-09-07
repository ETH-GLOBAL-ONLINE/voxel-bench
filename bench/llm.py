"""One `complete()` for every provider, so none of them is load-bearing.

The recipe step is a cheap task — natural language into JSON that already has a
schema — and we charge per craft, so the cost of this call is the business
model rather than a line item. Measured on one crate:

    gemini-flash-lite-latest    2.9s    901 tokens      0 thinking
    gemini-3.1-flash-lite      12.1s    542 tokens      0 thinking
    gemini-3.6-flash           17.3s   3587 tokens   2802 thinking

The frontier model spends 2802 tokens reasoning its way to the same crate. Six
times slower and four times the tokens for an equivalent result, which is why
the default is the lite one.

Set GEMINI_API_KEY (aistudio.google.com, free tier) or GROQ_API_KEY.
"""
import json
import os
import time
import urllib.error
import urllib.request

DEFAULT_MODEL = "gemini-flash-lite-latest"
TIMEOUT = 45

# The free tier answers 503 when it is busy, which is a demo risk rather than a
# bug. Back off and try again — but against a wall-clock deadline, not a retry
# count. Counting retries alone allows minutes of silence: two validator retries
# times four HTTP attempts times a 45s timeout is not a wait, it is a hang.
RETRY_STATUSES = (429, 500, 503)
RETRIES = 3
DEADLINE = float(os.environ.get("VOXEL_LLM_DEADLINE", "75"))

# urllib identifies itself as Python-urllib by default, which Cloudflare in
# front of Groq rejects outright with a 1010 before the request reaches the API.
# Every real SDK sends its own; ours had none.
USER_AGENT = "voxel-bench/0.1 (+https://github.com/ETH-GLOBAL-ONLINE/voxel-bench)"


class LLMError(RuntimeError):
    pass


def _post(url, payload, headers, deadline=None):
    deadline = deadline or (time.time() + DEADLINE)
    last = None
    for attempt in range(RETRIES + 1):
        if time.time() > deadline:
            raise LLMError("gave up after %.0fs. Last problem: %s"
                           % (DEADLINE, last or "too slow"))
        req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")[:300]
            last = "HTTP %s: %s" % (exc.code, body)
            if exc.code in RETRY_STATUSES and attempt < RETRIES:
                if time.time() + 1.5 * (attempt + 1) > deadline:
                    raise LLMError(last) from None
                time.sleep(1.5 * (attempt + 1))
                continue
            raise LLMError(last) from None
        except urllib.error.URLError as exc:
            last = str(exc.reason)
            if attempt < RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise LLMError("could not reach the model: %s" % last) from None
    raise LLMError(last or "gave up")


def _gemini(prompt, schema, model, temperature):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY is not set")

    config = {"temperature": temperature}
    if schema:
        config["responseMimeType"] = "application/json"
        config["responseSchema"] = schema

    data = _post(
        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model,
        {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": config},
        {"Content-Type": "application/json", "x-goog-api-key": key,
         "User-Agent": USER_AGENT},
    )
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise LLMError("no answer in the response: %s" % json.dumps(data)[:300]) from None

    usage = data.get("usageMetadata", {})
    return text, {
        "model": model,
        "tokens": usage.get("totalTokenCount"),
        "thinking": usage.get("thoughtsTokenCount", 0),
    }


def _groq(prompt, schema, model, temperature):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY is not set")

    # Groq does not enforce a schema server-side the way Gemini does — it only
    # promises valid JSON. So the schema goes in the prompt, and the validator
    # downstream is what actually holds the line.
    if schema:
        schema_note = "Return JSON matching exactly this schema, with no commentary:\n"
        prompt = "%s\n\n%s%s" % (prompt, schema_note, json.dumps(schema))

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    if schema:
        payload["response_format"] = {"type": "json_object"}

    data = _post("https://api.groq.com/openai/v1/chat/completions", payload,
                 {"Content-Type": "application/json",
                  "Authorization": "Bearer " + key,
                  "User-Agent": USER_AGENT})
    usage = data.get("usage", {})
    return data["choices"][0]["message"]["content"], {
        "model": model,
        "tokens": usage.get("total_tokens"),
        "thinking": 0,
    }


PROVIDERS = {"gemini": _gemini, "groq": _groq}


def complete(prompt, schema=None, model=None, temperature=0.4, provider=None):
    """Return (text, usage). With a schema, the text is JSON matching it.

    Gemini enforces the schema server-side, so the model cannot invent a field
    or a shape name. Groq only guarantees valid JSON, which is why the
    validator downstream is not optional either way.
    """
    provider = provider or os.environ.get("VOXEL_LLM_PROVIDER") or "gemini"
    if provider not in PROVIDERS:
        raise LLMError("unknown provider %r (have: %s)"
                       % (provider, ", ".join(PROVIDERS)))
    model = model or os.environ.get("VOXEL_LLM_MODEL") or (
        DEFAULT_MODEL if provider == "gemini" else "openai/gpt-oss-20b")
    return PROVIDERS[provider](prompt, schema, model, temperature)
