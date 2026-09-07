"""Upload a generated model to Roblox via Open Cloud Assets API.

Needs an API key from create.roblox.com/dashboard/credentials with the
`assets` scope (read + write), exported as ROBLOX_API_KEY, plus the
creator id as ROBLOX_USER_ID (or ROBLOX_GROUP_ID).

    python services/roblox_upload.py out/market_stall.fbx "Market Stall"
"""
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request

ASSETS_URL = "https://apis.roblox.com/assets/v1/assets"
OPERATIONS_URL = "https://apis.roblox.com/assets/v1/operations/{}"
MAX_BYTES = 20 * 1024 * 1024

CONTENT_TYPES = {
    ".fbx": "model/fbx",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".rbxm": "model/x-rbxm",
    ".rbxmx": "model/x-rbxm",
}


class UploadError(RuntimeError):
    pass


def _multipart(fields, file_field, filename, file_bytes, content_type):
    boundary = "----voxel%s" % int(time.time() * 1000)
    crlf = b"\r\n"
    body = []
    for name, value in fields.items():
        body.append(("--" + boundary).encode())
        body.append(('Content-Disposition: form-data; name="%s"' % name).encode())
        body.append(b"")
        body.append(value.encode("utf-8"))
    body.append(("--" + boundary).encode())
    body.append(('Content-Disposition: form-data; name="%s"; filename="%s"'
                 % (file_field, filename)).encode())
    body.append(("Content-Type: " + content_type).encode())
    body.append(b"")
    body.append(file_bytes)
    body.append(("--" + boundary + "--").encode())
    body.append(b"")
    return crlf.join(body), "multipart/form-data; boundary=" + boundary


def _request(url, api_key, data=None, content_type=None):
    req = urllib.request.Request(url, data=data)
    req.add_header("x-api-key", api_key)
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:600]
        raise UploadError("HTTP %s from %s: %s" % (exc.code, url, detail)) from None


def upload_model(path, display_name, description="", api_key=None, creator=None):
    api_key = api_key or os.environ.get("ROBLOX_API_KEY")
    if not api_key:
        raise UploadError("ROBLOX_API_KEY is not set")

    if creator is None:
        if os.environ.get("ROBLOX_GROUP_ID"):
            creator = {"groupId": os.environ["ROBLOX_GROUP_ID"]}
        elif os.environ.get("ROBLOX_USER_ID"):
            creator = {"userId": os.environ["ROBLOX_USER_ID"]}
        else:
            raise UploadError("set ROBLOX_USER_ID or ROBLOX_GROUP_ID")

    ext = os.path.splitext(path)[1].lower()
    if ext not in CONTENT_TYPES:
        raise UploadError("unsupported model format %r (allowed: %s)"
                          % (ext, ", ".join(CONTENT_TYPES)))
    size = os.path.getsize(path)
    if size > MAX_BYTES:
        raise UploadError("file is %.1f MB, Open Cloud caps model uploads at 20 MB"
                          % (size / 1024 / 1024))

    with open(path, "rb") as fh:
        blob = fh.read()

    request_json = json.dumps({
        "assetType": "Model",
        "displayName": display_name,
        "description": description or display_name,
        "creationContext": {"creator": creator},
    })
    body, ctype = _multipart({"request": request_json}, "fileContent",
                             os.path.basename(path), blob, CONTENT_TYPES[ext])
    started = _request(ASSETS_URL, api_key, body, ctype)
    op = started.get("path", "").split("/")[-1] or started.get("operationId")
    if not op:
        raise UploadError("no operation id in response: %s" % started)
    return op


def wait_for_asset(operation_id, api_key=None, timeout=180, interval=2.0):
    api_key = api_key or os.environ["ROBLOX_API_KEY"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = _request(OPERATIONS_URL.format(operation_id), api_key)
        if result.get("done"):
            if "error" in result:
                raise UploadError("Roblox rejected the asset: %s" % result["error"])
            return result.get("response", result)
        time.sleep(interval)
    raise UploadError("operation %s did not finish in %ss" % (operation_id, timeout))


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    path, name = sys.argv[1], sys.argv[2]
    op = upload_model(path, name)
    print("operation: %s" % op)
    asset = wait_for_asset(op)
    print(json.dumps(asset, indent=2))
    asset_id = asset.get("assetId") or asset.get("path", "")
    print("\nassetId: %s" % asset_id)
    print("insert with: game:GetService('InsertService'):LoadAsset(%s)" % asset_id)


if __name__ == "__main__":
    main()
