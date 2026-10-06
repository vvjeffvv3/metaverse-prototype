import re

from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm

from .models import Profile


class NicknameField(forms.CharField):
    def __init__(self, **kwargs):
        super().__init__(
            label="닉네임", min_length=2, max_length=20,
            help_text="다른 사람에게 보이는 이름이에요. 2~20자의 한글·영문·숫자·공백·_·-를 사용할 수 있어요.",
            widget=forms.TextInput(attrs={"placeholder": "캠퍼스에서 사용할 닉네임", "autocomplete": "nickname"}),
            **kwargs,
        )

    def clean(self, value):
        value = super().clean(value)
        if not re.fullmatch(r"[\w -]+", value):
            raise forms.ValidationError("문자, 숫자, 공백, _와 -만 사용할 수 있어요.")
        return value


class NicknameForm(forms.ModelForm):
    nickname = NicknameField()

    class Meta:
        model = Profile
        fields = ["nickname"]


class LoginForm(AuthenticationForm):
    error_messages = {
        "invalid_login": "아이디 또는 비밀번호를 확인해 주세요.",
        "inactive": "로그인할 수 없는 계정입니다.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "아이디"
        self.fields["username"].widget.attrs.update(
            {"placeholder": "아이디를 입력하세요", "autocomplete": "username"}
        )
        self.fields["password"].label = "비밀번호"
        self.fields["password"].widget.attrs.update(
            {"placeholder": "비밀번호를 입력하세요", "autocomplete": "current-password"}
        )


class SignUpForm(UserCreationForm):
    nickname = NicknameField()

    class Meta(UserCreationForm.Meta):
        fields = ["username", "nickname"]

    def save(self, commit=True):
        user = super().save(commit=False)
        if commit:
            user.save()
            Profile.objects.create(user=user, nickname=self.cleaned_data["nickname"])
        return user

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "아이디"
        self.fields["username"].help_text = (
            "150자 이하의 문자, 숫자와 @ . + - _를 사용할 수 있어요."
        )
        self.fields["username"].widget.attrs.update(
            {"placeholder": "사용할 아이디를 입력하세요", "autocomplete": "username"}
        )
        self.fields["password1"].label = "비밀번호"
        self.fields["password1"].widget.attrs.update(
            {"placeholder": "8자 이상 비밀번호", "autocomplete": "new-password"}
        )
        self.fields["password2"].label = "비밀번호 확인"
        self.fields["password2"].widget.attrs.update(
            {"placeholder": "비밀번호를 한 번 더 입력하세요", "autocomplete": "new-password"}
        )
        self.fields["password2"].help_text = ""
