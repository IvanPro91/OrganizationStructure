from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import CustomUser


class CustomUserCreationForm(UserCreationForm):
    """Кастомная форма регистрации"""

    email = forms.EmailField(
        required=True,
        label='Email',
        widget=forms.EmailInput(attrs={
            'class': 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
            'placeholder': 'user@example.com'
        })
    )

    class Meta(UserCreationForm.Meta):
        model = CustomUser
        fields = ('username', 'email')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Настройка поля username
        self.fields['username'].widget.attrs.update({
            'class': 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
            'placeholder': 'Имя пользователя'
        })
        self.fields['username'].help_text = None
        self.fields['username'].label = 'Имя пользователя'

        # Настройка поля password1
        self.fields['password1'].widget.attrs.update({
            'class': 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
            'placeholder': 'Пароль'
        })
        self.fields['password1'].help_text = None
        self.fields['password1'].label = 'Пароль'

        # Настройка поля password2
        self.fields['password2'].widget.attrs.update({
            'class': 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
            'placeholder': 'Подтверждение пароля'
        })
        self.fields['password2'].help_text = None
        self.fields['password2'].label = 'Подтверждение пароля'

    def clean_password1(self):
        """Упрощенная валидация пароля"""
        password = self.cleaned_data.get('password1')

        # Минимальная длина - 3 символа (как в вашем HTML)
        if len(password) < 3:
            raise forms.ValidationError('Пароль должен содержать минимум 3 символа')

        return password