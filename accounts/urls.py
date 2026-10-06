from django.contrib.auth.views import LogoutView
from django.urls import path

from .views import CampusLoginView, SignUpView, nickname_view

app_name = "accounts"
urlpatterns = [
    path("login/", CampusLoginView.as_view(), name="login"),
    path("signup/", SignUpView.as_view(), name="signup"),
    path("nickname/", nickname_view, name="nickname"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
