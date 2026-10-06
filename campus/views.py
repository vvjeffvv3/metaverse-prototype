from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.urls import reverse
from django.utils.html import escape
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from accounts.models import get_nickname
from .menu_images import FILE_NAME, IMAGE_TYPES, latest_menu, storage_root


@login_required
@never_cache
@require_safe
def map_view(request):
    response = render(request, "index.html")
    html = response.content.decode(response.charset)
    # Reuse the standalone HTML and all its relative CSS, JS, and photo paths.
    html = html.replace(
        "<head>", f'<head>\n  <base href="{escape(static("campus/"))}">', 1
    )
    # The home link must return to the Django view rather than the static folder.
    html = html.replace('href="./"', f'href="{escape(reverse("campus:map"))}"', 1)
    # Add account controls without changing the standalone map source.
    account_styles = f'<link rel="stylesheet" href="{escape(static("accounts/auth.css"))}">'
    html = html.replace("</head>", f"  {account_styles}\n</head>", 1)
    nickname = get_nickname(request.user)
    account_controls = render_to_string("accounts/map_account.html", {
        "nickname": nickname,
        "presence_config": {"socketPath": "/ws/campus/", "loginUrl": reverse("accounts:login")},
    }, request=request)
    html = html.replace('<div class="top-actions">', f'<div class="top-actions">{account_controls}', 1)
    response.content = html
    return response


@login_required
@never_cache
@require_safe
def menu_photo(request):
    metadata = latest_menu()
    return JsonResponse({
        "imageUrl": reverse("campus:menu-image", args=[metadata["filename"]]) if metadata else None,
        "updatedAt": metadata["updated_at"] if metadata else None,
        "sourceName": "더좋은밥상 · 카카오 채널 프로필",
    })


@login_required
@never_cache
@require_safe
def menu_image(request, filename):
    if not FILE_NAME.fullmatch(filename):
        raise Http404
    try:
        photo = (storage_root() / filename).open("rb")
    except OSError:
        raise Http404
    content_type = dict(IMAGE_TYPES.values())[filename.rsplit(".", 1)[1]]
    return FileResponse(photo, content_type=content_type, filename="cafeteria-menu." + filename.rsplit(".", 1)[1])
