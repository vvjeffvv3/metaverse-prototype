from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campus_profile"
    )
    nickname = models.CharField(max_length=20)


def get_nickname(user):
    # Accounts created before nicknames were introduced can still enter the map.
    profile = getattr(user, "campus_profile", None)
    return profile.nickname if profile and profile.nickname else user.get_username()
